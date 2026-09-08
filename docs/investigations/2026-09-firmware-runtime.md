# The September runtime work — 2026-09-06 → 09-08

One document for the whole arc: the rendering and recovery improvements, the
research that followed them, the runtime rework that research prompted, the
network-MIDI follow-up, and the regression the rework caused and how it was
fixed. It supersedes four separate reports written along the way.

**Baseline** `68e23cb`, project 3.9.5, Audio 0.5.4. All of it is unreleased.
**Bench** one ESP32-S3 panel, 128×64, 8 colour bits / 260 Hz, brightness 97,
Arduino 2.0.17 / ESP-IDF 4.4. No SDK, pin, partition or ABI change anywhere in
this work. Individual patterns and their setup iterations are unchanged.

**How to read the numbers.** Everything here is bench observation on one panel,
not a guaranteed reserve or a soak test. Steady cases settled five seconds and
sampled status for fifteen; HTTP requests were serialised at least a second
apart; A/B experiments ran A–B–B–A. Two observations per condition means medians
without confidence intervals. `frameUs` starts *after* loop sync, load adoption,
thumbnail service and catalog maintenance, is smoothed, and only updates when a
frame is drawn — it cannot bound the gap between input opportunities. Neither it
nor the research profiler measures encoder edge to emitted light; that needs a
logic analyser. Stages are inclusive (draw includes present); do not sum columns.

---

# Part 1 — What shipped into the working tree

## 1.1 The HUB75 blit emits word accesses

Xtensa disassembly showed the compiler had lowered each paired-column `memcpy`
to byte loads/stores with a stack temporary: the `memcpy` preserved aliasing
rules but hid the DMA buffer's alignment. Supplying the proven alignment
restores word accesses with the same colour and control bits.

`presentUs` **6,854–6,868 µs → 5,889–5,898 µs, about 14%** — roughly a
millisecond back on every pattern. Origin 72.5 → 78.2 fps (+7.9%), Ripple Grid
50.9 → 53.5 fps. That is rendering fps, not the panel's independent DMA refresh.
An odd-width buffer takes the scalar path. The host suite compares 30,436,000
DMA words including FIFO order and depths 2–8.

Per-pattern frame time, medians of three samples, only the blit differing:

| Pattern | before µs | after µs |
|---|---:|---:|
| Origin | 13,799 | 12,787 |
| 0515-4 | 30,448 | 29,397 |
| 0531 | 19,592 | 18,644 |
| 0601 | 32,552 | 31,506 |
| Branched flow | 31,477 | 30,781 |
| ForSoundTest | 11,530 | 10,656 |
| Ripple Grid | 19,628 | 18,685 |
| RippleCellGrid2 | 20,726 | 19,814 |
| ttt | 35,485 | 34,522 |
| Two-stream | 43,125 | 42,233 |
| Wave Cascade | 24,010 | 23,052 |

## 1.2 Thumbnail I/O leaves the frame loop

The loop owns the cache; one immutable PSRAM job crosses a release/acquire
mailbox to the *existing* network task — no new stack. Generation numbers
invalidate a queued result after deletion or format; a new capture wins over a
pending read. Optional thumbnail allocations now fail in PSRAM rather than
falling back to scarce internal RAM.

Largest capture **1,117 µs**. Largest background I/O wall time 1,843,144 µs,
which includes filesystem and task contention while a module loaded — not a pure
flash-throughput number, and moving the wait off the loop does not remove
platform-wide flash/cache stalls. The network task's existing 8 KB stack had at
least 5,248 B free, 4,720 B after opening the feature console pages.

Six overlapping-switch cycles started Two-stream, confirmed `loading`, then
selected Ripple Grid before setup finished; all settled on Ripple Grid with no
load error or reboot. These exercise the shared activation path through the API
— **not a hand turning the physical encoder.** Heavy setup still takes 2–3.5 s;
none of this accelerates a pattern's own algorithm.

## 1.3 Network recovery and names

A brief drop now gets the configured five-second automatic-reconnect grace, then
one explicit retry of the working SSID, before rotating saved networks. An IP
change without a sampled disconnect also fires the connect hook.
`POST /api/wifi/reconnect` replies, waits 500 ms, and reconnects on current
credentials without resetting the MCU or writing NVS.

`core_names.h` owns mDNS bootstrap and retries missing registrations on the
network task, keeping services already registered including feature-owned
records. A failing NetBIOS registration no longer restarts a working mDNS alias
on each retry. The MIDI feature retries its own record. Duplicate announcements
for one connect edge are coalesced — the test that found them saw two per
connection.

Eight reconnects recovered without reset: driver reconnected in 205–239 ms,
client-observed HTTP recovery 1.15–1.40 s. Fresh UDP 5353 queries confirmed the
shared hostname, per-device alias, `_http._tcp`, `_arduino._tcp` and
`_apple-midi._udp` within 4.84–5.27 s. **Each cycle's first hostname query timed
out while the responder re-probed: `namesReady` means registered locally, not
proven reachable.** Internal heap held 38,984–39,080 B across those cycles. This
does not prove behaviour during an AP reboot, a changing DHCP server, multicast
filtering, or five unavailable saved networks.

## 1.4 Storage mutations wait outside the render loop

An HTTP storage operation used to ask the render task to wait for a module's
setup — a measured upload overlap held it **2.020 s**. It is now a conditional
transaction: the network caller waits while the render task tests readiness and
returns to its next frame. The storage hold retains the selected module by path
across catalog rebuilds; aborted uploads close and remove only the destination
that request actually opened.

| Operation | max complete loop | max transaction callback | HTTP response |
|---|---:|---:|---:|
| Upload 1 | 44.844 ms | 0.585 ms | 1.936 s |
| Delete 1 | 49.364 ms | 0.627 ms | 1.671 s |
| Upload 2 | 48.918 ms | 0.585 ms | 1.884 s |
| Delete 2 | 49.812 ms | 0.649 ms | 1.732 s |

The HTTP request still waits for the job; these bound render-loop stalls, not
setup time. An aborted partial upload restored the prior module (max loop
35.716 ms). Destructive format was tested against the native fixture, never the
owner's filesystem.

## 1.5 Maintenance while HTTP waits

The HTTP owner polls Wi-Fi/name maintenance during parser waits, frame-boundary
waits and response backpressure; page bodies use nonblocking socket writes with
partial-write handling under the existing stall and total budgets. A held
two-second request header no longer starves those polls — **161 polls in a
four-second window containing that hold.** This is *not* a universal 25 ms
deadline: filesystem thumbnail I/O still produced maintenance gaps of
1.57–1.69 s, and IDF's own network tasks run independently of this hook.
Bounding those storage calls is follow-up work.

---

# Part 2 — What the research found (2026-09-07)

Run on hardware with a temporary whole-`loop()` profiler (counters and event
ring 2,544 B; a query temporarily reserves 5,500 B for JSON). Instrumentation
overhead was never independently measured, so **these are not a new
un-instrumented benchmark.** All six edited files were restored byte-for-byte
and both research modules deleted afterwards.

1. A heavy pattern is mostly in its own simulation, not the feature dispatcher
   or encoder reader.
2. A frame-boundary request could still stop the loop for seconds — uploading
   during an async load reproduced the 2.020 s iteration fixed in §1.4.
3. Most heavy-pattern startup delay is deliberate simulation warm-up. Cutting
   only that repetition count cut setup 78–79% **but changes the initial
   picture** — a causal experiment, not a shippable optimisation.
4. **Negative result:** removing repeated thumbnail drawing alone made setup
   *slower*. A loading state needs an explicit work cadence, not less drawing.
5. **The 24 KB internal reserve was a preference, not an enforced admission
   limit.** The section allocator fell back to internal RAM when PSRAM-first
   failed, and `moduleAlloc()` went through `PFMem::alloc()`, whose fallback did
   not enforce the reserve either. A source audit — PSRAM exhaustion was never
   induced.

The core/feature seam remains appropriate; none of this justifies moving edition
features into the core.

Two observations from that audit matter a great deal in Part 4, because the
rework acted on the first and ignored the second:

> Module data sections — *"Enforce a capability-specific reserve before every
> allowed internal fallback."*
>
> Loader task, 12,288-byte stack created per asynchronous activation — *"Compare
> a reserved worker against transient allocation; **reserved RAM has a real
> cost**."*

Placement is also coarse by construction: `module.ld` merges `.bss.*` into one
section, so Two-stream's two particle arrays (52,000 B), its 4,096 B sine table
and small control data all travel together as 57,400 B of PSRAM. A deliberately
small internal hot-data section could keep hot tables near the CPU while bulk
arrays stay in PSRAM — unmeasured, and moving *all* module data internal would
defeat the reserve.

---

# Part 3 — Allocation, workers and MIDI

## 3.1 The loader worker became persistent

Repeated upload/delete traffic exposed a real failure: about 40 KB free in
total, but the largest block only 12,276 B — a per-switch worker could not
start. The persistent worker removes that contiguous-allocation requirement from
interaction, **at the cost of retaining its stack when idle.** There is no
synchronous setup fallback in the render task.

The async loader retries only allocation failures: at most five attempts at
50/100/200/400/750 ms on its own worker. Bad ELF and unresolved symbols do not
retry. `loaderRetries` counts attempts; `loadError` reports the final result.
Setup is never repeated after a successful load.

A common-runtime sweep loaded all 14 catalog entries with no refusal and
9,304 B minimum free loader stack. **Further sweeps after adding the MIDI worker
exposed admission refusals during HTTP traffic** — the final Audio sweep still
loaded all 14, with two refusals each recovering on the first retry, and free
service RAM sampled down to **21,840 B during HTTP status requests.** That
number is the regression in Part 4 arriving early, recorded and not yet read as
a warning.

## 3.2 Network MIDI

The socket service runs independently of pattern rendering with ordered, bounded
event queues and PSRAM payload storage; incoming controls still apply on the
render task. Absolute-bus compatibility clicks no longer appear as physical
encoder output, so incoming automation is not reflected back as outbound CCs.

Eight windows, five seconds at the stated rate, 1.5 s settle, counters and all
four absolute bus values compared:

| Pattern | updates/knob/s | packing | baseline rx/tx | final rx/tx |
|---|---:|---|---:|---:|
| Origin | 30 | bundled | 600/600 | 600/600 |
| Origin | 30 | separate | 600/600 | 600/600 |
| Origin | 60 | separate | 1,073/1,200 | 1,200/1,200 |
| Origin | 120 | bundled | 2,392/2,400 | 2,400/2,400 |
| Two-stream | 30 | bundled | 600/600 | 600/600 |
| Two-stream | 30 | separate | 492/600 | 600/600 |
| Two-stream | 60 | separate | 589/1,200 | 1,200/1,200 |
| Two-stream | 120 | bundled | 1,512/2,400 | 2,400/2,400 |

Outbound CC counts fell from 199–264 per window to zero, with no handoff
overflow and no new parser errors. Two stress observations are retained in
[the sanitized measurements](2026-09-runtime-improvements.json): the same
firmware while this PC compiled all editions gave 9,418/9,600 CCs with an
increased RTP sequence-gap counter (sender timing was not captured, so blaming
PC scheduling would be inference); and a 20-second heavy-pattern run mixing
4,800 CCs, 1,200 clock messages, running status, sequence wrap and a two-second
incomplete HTTP header received 4,799/4,800 with correct final values.
**The remaining pre-parser packet loss means burst handling and transport
recovery are still open.** The probe is not Ableton Live; these verify the
device's receive path with controlled RTP-MIDI traffic.

---

# Part 4 — The regression, and the fix (2026-09-08)

Reported by the owner: heavy modules (Branched flow, Two-stream) intermittently
do not come on, and which ones changes across reboots. HEAD does not behave this
way — this was caused by the work in Parts 1 and 3.

## 4.1 Two changes that only bite together

**RAM spent in the load window.** `LOAD_TASK_STACK` became a *persistent*
12,288 B worker (§3.1), and `core_midi_rtp.h` added a net-new 4,096 B `pf_midi`
worker (§3.2). The loader's measured high-water use is a flat **2,980 B** across
Branched flow, Two-stream, 2D Burgers, ttt and Wave Cascade — over 9 KB of that
stack was never touched. The research had already priced this exact trade
("reserved RAM has a real cost") and it was not re-measured after the MIDI
worker landed.

**The reserve became an admission veto.** Acting on research finding 5, the
rework enforced it — and overshot. HEAD ended every path in a real allocation
attempt, using the reserve only to choose *order*:

```c
exec: heap_caps_malloc(EXEC|INTERNAL|32BIT)  then  heap_caps_malloc(EXEC|32BIT)
data: SPIRAM|8BIT -> INTERNAL|8BIT -> any 8BIT -> SPIRAM|8BIT
```

The new `PFModuleMemory::internal()` returns null **without attempting**
whenever `heap_caps_get_free_size(INTERNAL|8BIT) < 24576`, and for executable
caps the check **ignores the requested size entirely**. `code()` has no fallback,
because the S3 cannot execute from PSRAM. So a 2 KB `.text` was refused exactly
as hard as a 200 KB one, while the RAM it needed sat unused. Each data section
was also tested independently against one floor, so N sections that each "fit"
crossed it together, and the verdict depended on ELF section order.

Together the module's share of internal RAM fell to **~3,764 B** against a
boot-to-boot ambient variance of ~700 B: a coin toss that re-rolls every boot.
Measured need — ttt 2,320 · Two-stream 3,644 · 2D Burgers 3,704 · Branched flow
3,912 (short by 148 B). The five-attempt retry hid most occurrences; with the
console open, two switches were enough to drive free to ~21.7 KB and put lwIP
into permanent `endPacket(): could not send data: 12`, after which the board
kept rendering but left the network and did not recover. Reproduced twice.

## 4.2 The number that makes it structural

Pricing the executable image of every `.pfm` in the tree from its ELF section
headers, the heaviest module in the **shipped Basics pack** is
`breakout_arcade.pfm` at **5,364 B**:

```
24,576 (reserve) + 5,364 (.text) = 29,940  >  ~28,320 free
```

The board could not load its own shipped pack, short by 1,620 B, before any
margin. No allocation policy fixes that — the RAM has to come back. Price
modules from section headers; never reason from the handful on the bench, where
community modules run 4.6–29 KB.

## 4.3 The fix

- **`core_module_memory.h`** — the reserve *places* data and *prices* code.
  `budget()` = free − reserve, published. `admitCode(sum)` is one decision for
  the whole module, taken from the section headers before a byte is allocated,
  so section order cannot change the verdict. `internal()` charges each
  allocation its own size against live free, and no longer allocates-then-rolls-
  back — that dipped the heap under the reserve, on the network core, to
  discover whether it was allowed to. `data()` can lose its *placement* to PSRAM
  but can never fail a load on its own.
- **`core_module_loader.h`** — two passes: price, then place with executable
  sections first, so code takes its share before data can spend it. Failures
  name the numbers that disagreed. `unload()` clears the resident footprint.
- **`pattern_registry.h`** — `LOAD_TASK_STACK` 12288 → **8192**: 2.7× the
  measured 2,980 B high-water, and the size this same read + relocate + setup()
  work ran on before the async loader existed. Returns 4 KB to the window where
  loader and module contend. Guards a stray notify from indexing `patterns[-1]`
  now the worker is persistent.
- **`core_status_http.h`** — publish `moduleMemory.budget` and `codeBytes`, the
  two sides of the admission comparison.

**Separate correctness bug fixed in passing.** `abi/pf_abi.h` documents
`api->alloc()` as "PSRAM-preferred **zeroed**", and HEAD honoured it through
`PFMem::alloc`'s `memset`. The rework routed it to `PFModuleMemory::data(bytes,
false, true)` and dropped the zeroing, so any pattern allocating a trail map or
accumulator and reading it before writing was reading the previous module's
leavings. Restored.

**Admission failure must count as a refusal.** `budget()`'s right-hand side is
ambient — an HTTP response in flight moves it — so a dip under the reserve makes
room read as zero however small the module is. That is a transient, not a
verdict, and `loadPatternJob()` already retries while refusals move. The first
build of this fix failed two loads with `code 1372 B > 0 B` for exactly this
reason, caught on hardware.

## 4.4 Result

| | before | after |
|---|---:|---:|
| module's internal share, none resident | 3,764 B | **7,816 B** |
| heaviest shipped module (5,364 B) | short 1,620 B | **fits, 2,452 B spare** |
| 16-switch churn: refusals / retries | 12 / 12 | **0 / 0** |
| 16-switch churn: steps under reserve | most | **0 / 16** |
| console open + 8 switches | wedged, left the network | **0 failures, 56/56 fetches** |
| loader stack high-water | 2,980 / 12,288 | 3,068 / 8,192 |

Frame times unchanged: ttt −0.7 ms, Sandglass −1.1 ms, Wave Cascade −0.6 ms,
Two-stream −0.5 ms, 2D Burgers −0.03 ms, RippleCellGrid2 −0.1 ms, Branched flow
+0.3 ms (inside its own 30.7–33.2 ms spread). All nine catalog modules load and
render.

## 4.5 Retracted from the working notes

A claim that **Wave Cascade renders black** was wrong — 100% non-zero at 20 s and
90 s dwell. So was black-frame evidence against an earlier
`PF_MODULE_DATA_INTERNAL_MAX` experiment. Both came from reading frames back
through `PFThumbs`, which only captures when the pattern has been resident long
enough and `canvasShowsThumb` is false: a capture can silently not happen and
leave an empty record that reads as black. **Do not use that method as evidence
without corroboration.** That threshold experiment was rejected on its own
merits regardless — it tuned a constant against the sizes of the few modules on
this bench, which is not a fix for a diverse library.

## 4.6 Still open

`budget()` is still `serviceFree − reserve`, and `serviceFree` moves with
edition, panel geometry and momentary console load. Every shipped module now
clears the line by 2.4 KB or more against ~700 B of variance, and the retry
absorbs transients, but a module within a few hundred bytes of the budget would
still be boot-dependent. A boot-reserved module arena would remove that; it was
considered and not taken, because funding it would put the load window below the
level where lwIP was observed to die.

---

# Part 5 — Editions, reproduction, evidence

## 5.1 Per-edition bench

Snapshots after each edition's smoke workload — **not** a controlled comparison
of edition RAM use. Every edition passed catalog/capability checks, Ripple Grid
activation, sleep/wake, thumbnail-file validation, home and feature page
downloads, and a real reconnect with fresh hostname/HTTP/OTA DNS replies.
Performance adds its own Black preset beside Origin; Clock reported NTP
synchronized; Audio additionally passed two overlapping-load cycles and MIDI
service discovery. Feature *page availability* is not an end-to-end test of any
broker, DAW, microphone source or show configuration.

| Edition | image bytes | internal free after smoke | largest block | net stack min free |
|---|---:|---:|---:|---:|
| Default | 1,036,736 | 73,172 | 59,380 | 4,708 |
| Audio | 1,137,648 | 41,036 | 30,708 | 4,672 |
| Performance | 1,283,760 | 59,356 | 49,140 | 4,720 |
| Clock | 1,119,744 | 71,580 | 61,428 | 4,724 |

The final Audio image passed eight more reconnects, one announcement each:
radio downtime 283–409 ms, HTTP back in 1.36–1.62 s on seven cycles and 5.29 s
on one after a client request timed out; all five DNS query types answered
5.05–5.96 s after the request. No reboot; internal free 40,304–41,008 B, largest
block 30,708–31,732 B.

## 5.2 Reproduction

Build every composition with `firmware/bundles/build.sh all` — it scans each
image for per-feature markers, proving the composition in the shipped bytes.
**Never run two builds at once**: they share `~/pf-build` and the link breaks
while the marker scan reads stale output. Flash only the active app partition
after identifying the OTA slot; preserve NVS and the pattern volume. Bench
images contain local credentials and must not be published.

Use serial plus one-at-a-time HTTP with at least a second between polls; read
`frameUs`, `presentUs`, `load`, `moduleMemory`, `thumbs`, `network`, `runtime`,
`uptime`, `heapInternal`, `heapLargest`, `netStackMin`. A cached OS resolver is
not a discovery test — send fresh A/PTR queries to UDP 5353 and read the panel's
actual responses. Recovering a board whose network has wedged: a **1200-baud
touch** on COM13 (the DTR/RTS gesture does not reset this native USB CDC port,
and the port re-enumerates, so reopen after).

Host checks, also in CI with ASan/UBSan on Linux:

```sh
python firmware/toolchain/check_blit.py
python firmware/toolchain/check_runtime.py
python firmware/toolchain/check_midi.py
python firmware/toolchain/check_thumbs.py
python firmware/toolchain/check_network.py
python firmware/toolchain/check_send.py
python firmware/toolchain/check_module_elf.py
python firmware/toolchain/check_boundaries.py
python firmware/toolchain/check_abi_freeze.py
python firmware/toolchain/check_sources.py
python firmware/toolchain/check_presets.py
python firmware/toolchain/check_versions.py
```

The local native run used MSVC with warnings as errors; sanitizers were not run
locally. The blit test compares 30,436,000 DMA words. The ELF test includes
malformed ranges and strings and all 33 shipped Basics modules. MIDI transfers
200,000 ordered cross-thread events and checks bounded overflow, channel
filtering, absolute/relative/note echo suppression and physical output. None of
this changes the frozen ABI or puts feature references into the core.

## 5.3 Evidence retained

- [`2026-09-runtime-research/`](2026-09-runtime-research/README.md) — sanitized
  profiler measurements and source-only reproduction tools for Part 2.
- [`2026-09-runtime-improvements.json`](2026-09-runtime-improvements.json) —
  sanitized MIDI and runtime measurements for Part 3.

Raw status dumps, device backups and downloaded user modules stay in ignored
local scratch storage. Experimental firmware and research modules were removed;
the catalog and the owner's brightness setting were restored and verified.
