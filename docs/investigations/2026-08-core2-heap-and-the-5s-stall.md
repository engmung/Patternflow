# Where the heap went, and the five-second tax on every upload

*Investigation log, 2026-08-18 → 19. One board (ESP32-S3-WROOM-1-N16R8, 128×64
panel), one day, three root causes. Everything below was measured on hardware;
nothing is inferred from documentation alone. Outcomes: PRs #318, #320, #321.*

## How it surfaced

The signal was months old and entirely qualitative.

**Simone Majocchi ([@SimonePDA](https://github.com/SimonePDA))** has been
building the firmware side continuously — the loadable `.pfm` module design,
the MQTT sidechannel, the `.pfs` show tables and the performance director, and
work still in progress — which means a lot of time spent running *his* builds
next to ours. His felt more comfortable. Ours had internal-heap trouble
constantly: patterns that would not install, a console that stopped answering
under a heavy pattern, features rejected during review for costing 7 KB.

That difference had no explanation and an easy excuse: different feature set,
different test conditions, different panel, different day. A vague "his feels
better" is not a bug report, so it sat unexamined.

It became concrete on 18 August. A pattern made at the office, on Simone's
build, running fine. Brought home, installed on a board running our own
release — **refused**. Same pattern file, two builds, opposite outcomes.

That is a controlled experiment arrived at by accident, and it moves the
question from *the pattern* to *the build*. It is worth being blunt about how
much that mattered: the investigation had started by dissecting the pattern's
ELF, looking for what made *it* special. Nothing in that file would ever have
explained anything. The build comparison is what cracked it open, and it came
from someone noticing that the same thing behaved differently in two places.

## The symptoms

Three complaints that looked like one:

1. A 29 KB community pattern (`muybridge_35mm`) refused to install — the panel
   said **"not enough executable/data RAM"**.
2. A pattern that used to run at ~20 fps (`strawberry_rush`) crawled at ~5, and
   with it resident the web console stopped answering at all.
3. Wireless pattern uploads felt several times slower than remembered.

All three were real, and each had a *different* root cause. The investigation
is worth recording because every early hypothesis was wrong, and the
measurements that killed them were cheap.

## Part 1 — the heap: the core generation decides everything

### The measurement that reframed the problem

The firmware prints internal-heap checkpoints during boot (`[MEM]` lines).
Comparing the same source built two ways, on the same board:

| free internal heap | Arduino core 3.3.8 (IDF 5.5) | Arduino core 2.0.17 (IDF 4.4) |
| :--- | ---: | ---: |
| entering `setup()` | 224,428 | **295,612** |
| after display init | 74,832 | 153,952 |
| after network services | **15,320 / largest 7,668** | **98,708 / largest 90,100** |

The ~71 KB gap exists **before the sketch runs a line**. That single fact
eliminated most hypotheses at once: it is not Wi-Fi buffers (nothing network
has started), not our services, not any code we wrote.

### Where the 71 KB actually goes

Diffing the two prebuilt `sdkconfig`s (`esp32s3-libs/3.3.8/sdkconfig` in the
Arduino package vs `tools/sdk/esp32s3/sdkconfig` in PIO's core-2 framework):

| setting | core 2 | core 3 |
| :--- | ---: | ---: |
| instruction cache | 16 KB | **32 KB** |
| data cache | 32 KB | **64 KB** |
| `esp_timer` task stack | 4,096 | 8,192 |
| Wi-Fi static RX/TX buffers, AMPDU, BA window, TCP window | identical | identical |

**Cache is carved out of the same physical SRAM the heap lives in.** 48 KB of
the 71 is the cache configuration alone; the rest is a doubled system task
stack, ~15 KB of larger static segments (`.iram0.text` +11 KB — IRAM and DRAM
share the S3's SRAM — plus ~3.5 KB `.data`/`.bss`), and IDF 5 startup
allocations. None of it is reachable from sketch code, and the Wi-Fi flags
being identical means no `sdkconfig` tweak short of a full lib rebuild
changes it.

### Why the heap number is the whole ballgame here

Two loader facts turn "free heap" into "what patterns can exist":

- A `.pfm` module's **`.text` must land in one contiguous internal executable
  allocation**. The S3 cannot execute loaded code from PSRAM. So the *largest
  free block* after services is a hard ceiling on pattern code size:
  `muybridge_35mm` carries 12,470 B of `.text`; the core-3 build's largest
  block was 7,668 B. Refusal was arithmetic, not a bug.
- A resident module's data prefers internal RAM too, so a heavy module
  (`strawberry_rush`: ~14 KB resident) drives the system to 1–2 KB free. At
  that level the console's ~10 KB page sends fail, `printf` can abort inside
  lock allocation, and the observed 4.9 fps was heap-starvation thrash, not
  pattern cost — the same pattern does 18.8 fps with room to breathe.

### Dead ends, recorded so nobody re-walks them

- **`esp_bt_controller_mem_release()`** at boot on core 3 (both prebuilts
  compile BT in; the firmware never uses it): returns an error, recovers
  **0 bytes**. The S3/IDF-5 BLE memory model doesn't hold a releasable static
  block.
- **pioarduino + `custom_sdkconfig`** (rebuild IDF 5 libs with the small-cache
  layout): parked after two environment failures. Its platform installs under
  the same name as classic `espressif32` and **shadows the release
  toolchain's packages** — it broke the working core-2 build twice (an
  `intelhex` import, then a tool re-download against a package mirror whose
  DNS does not resolve from this network). Recovery: pin
  `platform = espressif32@7.0.1`, `platform_packages` symlink for
  `tool-esptoolpy`, and a hand-written `esptool.py` shim that delegates to
  pip-installed esptool 4.9.0. With Part 3's fix the whole route became
  unnecessary — but if it is ever revisited, use an isolated
  `PLATFORMIO_CORE_DIR`.

### The decision (PRs #318, #320)

Build releases on **core 2.x via PlatformIO** (`firmware/patternflow/
platformio.ini`), which is what the Simone/performance-director fork had been
doing all along — the "his build runs everything" observation is what broke
the case open. Same source, no code changes, and the numbers above. Released
as v3.5.0. Trade-offs recorded in the ini header: IDF 4.4 is an older
generation, and Origin idles ~2 fps lower (61.5 vs 63.8 — consistent with the
smaller instruction cache) while heavy patterns gain an order of magnitude.

## Part 2 — the boot-restore zombie (side quest, PR #316 and a lesson)

Pattern persistence (#314) restores the remembered pattern in `setup()`,
**before services start** — at a moment when ~75 KB is free even on core 3. A
module that could never load post-services loads fine there, then services
starve around it: measured **1,112 B free** with the board rendering happily,
Wi-Fi associated, and HTTP dead. Not a crash, so the anti-boot-loop latch
(#316) doesn't fire; the board just looks broken from the network forever.

On core 2 the margin makes this a non-event (81 KB free with the same module
restored), but the structural fix — restore *after* services, through the same
`requestReload()` path a manual selection uses, so restores face the same
memory reality — is still the right shape if boot-restore ever misbehaves
again.

The lesson that cost real time: **`Preferences.putString()` failures are
silent** — the code logs "saved" without checking the return. Under heap
starvation the latch-clear write fails invisibly, which by pure luck is what
let the zombie recover once. Check NVS write returns.

## Part 3 — the five-second tax: it was never the network

With core 2 shipped, uploads still felt wrong. Measured honestly on the same
day, same network (the historical "~165 KB/s" figure did not reproduce —
always re-baseline):

- `/update`, 1.1 MB multipart: core 3 = 75 KB/s, core 2 = 52 KB/s
- a 29 KB `.pfm` PUT: core 3 = **0.77 s**, core 2 = **5.8 s**
- a **447-byte** sidecar PUT: core 3 = 0.42 s, core 2 = **5.4 s**

447 bytes taking 5.4 seconds is not bandwidth. Subtracting a ~5.4 s constant
from the core-2 numbers made its *per-byte* rate match core 3 — so the
difference was one **fixed stall per request**.

### The mechanism, proven with a falsifiable probe

Core 2.x `WebServer` reads a raw request body like this
(`Parsing.cpp`):

```cpp
while (_currentRaw->totalSize < _clientContentLength) {
  _currentRaw->currentSize = client.readBytes(_currentRaw->buf, HTTP_RAW_BUFLEN);
```

`readBytes` blocks until it fills the **whole** buffer (1,436 B) or the 5 s
stream timeout expires. The final chunk of a body is almost never an exact
buffer multiple, so every raw PUT pays the timeout once. Prediction: bodies
that are exact multiples of 1,436 don't stall. Measured:

| body size | stock core 2 | prediction |
| ---: | ---: | :--- |
| 1,436 B | 0.40 s | no stall ✓ |
| 2,872 B | 0.41 s | no stall ✓ |
| 1,437 B | **5.53 s** | stall ✓ |
| 447 B | **5.40 s** | stall ✓ |

Core 3 rewrote the loop to ask for exactly the bytes that remain. That is the
entire fix.

### The fix (PR #321)

`WebServer` is now **vendored** at `firmware/patternflow/src/webserver/` —
the same arrangement as `src/hub75` and `src/pubsubclient`: every include
points at the copy, the bundled library is never compiled, and the fix is
three lines marked `PATTERNFLOW FIX` (details in that directory's
`VENDORED.md`). After:

| | core 3 (old build) | core 2 stock | **core 2 + fix** |
| :--- | ---: | ---: | ---: |
| 29 KB `.pfm` install | 0.77 s | 5.8 s | **0.77 s** |
| `/update` 1.1 MB | 75 KB/s | 52 KB/s | **107 KB/s** |
| free heap / largest | 15.3 K / 7.7 K | 96.7 K / 86.0 K | **96.7 K / 86.0 K** |

The research question was "is there a middle ground between heap and upload
speed?" The answer: the trade never existed — it was three separate problems
wearing one coat.

## Method notes (the parts worth stealing)

- **A persistent "theirs feels better" is a measurement waiting to be taken.**
  This one went unexamined for months because it had no number attached and a
  dozen plausible excuses. The moment it was pinned to one artefact behaving
  two ways — same pattern, two builds — it took a day to close. If two builds
  of the same project keep *feeling* different, that is the finding; go and
  weigh it.
- **Same board, same day, same network, or the comparison lies.** The
  remembered 165 KB/s was a different day's number; today's core 3 managed 75.
- **A falsifiable prediction beats ten plausible theories.** The
  1,436-vs-1,437 probe settled in 30 seconds what could have been a week of
  driver blame.
- **Fixed-cost vs per-byte cost:** when a transfer is slow, time a tiny
  payload. A 447 B request that takes 5.4 s tells you the shape of the
  problem immediately.
- **Boot-stage heap checkpoints** (`[MEM]` prints at boot / after display /
  after services) localize a regression to a lifecycle stage before any
  debugger is attached.
- **OTA slot gotcha:** wireless `/update` writes the *passive* app slot and
  flips `otadata`. After any wireless update, a USB `write-flash 0x10000`
  lands in the inactive slot and "does nothing." Write `boot_app0.bin` back
  to `0xE000` to force app0, or write the app to `0x310000`.
- **`esptool read-flash` over the S3's native USB corrupts routinely;
  `verify-flash` (on-device hashing) is reliable** — including against an
  all-`0xFF` file to prove a region is erased.
- On this Windows machine the xtensa linker cannot write outputs under the
  non-ASCII repo path — build from an ASCII work copy or redirect
  `PLATFORMIO_BUILD_DIR`.

---

*I had been building on whatever the board manager called latest, so this was
the water I swam in — every heap number I ever measured was the degraded one,
and I tuned the project's expectations to it. [@SimonePDA](https://github.com/SimonePDA)
was building the same firmware the whole time and simply never had the problem,
which is the only reason there was anything to compare against. Months of "his
feels more comfortable" turned out to be exactly right, and precisely
measurable, the moment one pattern refused to install in one place and not the
other. The control group nobody set up on purpose is what found this. Thank
you.*
