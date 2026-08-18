# Patternflow Firmware

Arduino-based firmware for the ESP32-S3 powering Patternflow. One image serves every board generation — the pin map is identical on v2.x and v3.0.

The firmware handles the ESP32-S3 DMA driver for the HUB75 LED matrix, reads four rotary encoders to control generative patterns, and supports Arduino OTA for wireless updates.

> ⚠️ **Panel compatibility.** This firmware drives the panel directly from the ESP32-S3, so the panel's **driver IC** must be one the `ESP32-HUB75-MatrixPanel-DMA` library can drive: classic shift-register parts — **74HC595**, **FM6124**, **FM6126A**, **ICN2037**, **ICN2038S**, **DP5125D**, **DP3246**, **MBI5124**, **SM162xx**. S-PWM / GCLK "video wall" panels (**ICN2053**, **FM6353**, **FM6363C / FM6373C**, **DP3264/DP3265**, **ICND2055**, **MBI505x** — sold as high-refresh "1920/3840Hz" modules needing a sending/receiving card) will **not** work and stay completely dark. "HUB75E" on a listing guarantees a connector, not compatibility. Check this **before buying** — see **[docs/panel-compatibility.md](../docs/panel-compatibility.md)**. Select your panel's driver below via `PANEL_PROFILE`.

## Setup

### Required board package
- ESP32 by Espressif Systems — **2.0.x, not the latest 3.x** (see below)

> ⚠️ **The core version decides how much RAM your patterns get.** Core 3.x
> ships ESP-IDF 5.5, which occupies about **71 KB more internal RAM before the
> sketch even starts** than core 2.x / IDF 4.4 — the gap is already there at the
> first heap reading in `setup()`, before Wi-Fi is up, and no sdkconfig setting
> reverses it (the Wi-Fi buffer flags are identical between the two prebuilts).
> Measured on the same board with the same source, free internal heap once the
> network services are up:
>
> | | free | largest block |
> |---|---|---|
> | core 3.3.8 (IDF 5.5) | 15,320 B | 7,668 B |
> | core 2.0.17 (IDF 4.4) | **98,708 B** | **90,100 B** |
>
> That largest-block number is the hard ceiling on a loadable module: a `.pfm`'s
> `.text` has to land in one contiguous internal executable block, because the
> S3 cannot execute loaded code from PSRAM. On core 3.x a 12 KB pattern is
> simply refused; on core 2.x it loads and runs. See
> [Internal RAM is the budget](#internal-ram-is-the-budget-everything-else-is-roomy).

### Build with PlatformIO (recommended)

`platformio.ini` in `patternflow/` pins core 2.x and is what the measurements
above come from. It also builds in ~90 s against the IDE's several minutes.

```bash
cd firmware/patternflow
pio run                       # → .pio/build/firmware/firmware.bin
pio run -t upload             # or flash it yourself at 0x10000
```

`toolchain/sync_ino_to_src.py` copies the sketch into `pio_src/` and clones the
libraries below into `lib/` on first run, so there is nothing to install by
hand. On Windows, build from a path with no non-ASCII characters, or point
`PLATFORMIO_BUILD_DIR` at one — the xtensa linker cannot write outputs
underneath a path it cannot encode.

The Arduino IDE path still works and is documented below; it is what the older
guides describe. Just install core **2.0.x** rather than the latest.

### Arduino IDE board settings
- **Board:** ESP32S3 Dev Module
- **PSRAM:** OPI PSRAM
- **Flash Size:** 16MB
- **Partition Scheme:** 16M Flash with PSRAM-aware partition
- **USB CDC On Boot:** Enabled
- **Upload Mode:** UART0 / Hardware CDC

> **Why CDC On Boot matters.** It decides whether `Serial` is the native USB
> peripheral or UART0 — and therefore which of the two USB-C ports answers the
> browser flasher's Wi-Fi setup (Improv speaks over `Serial`). Enabled puts it
> on the **left/native `USB`** port, which is what the released firmware does
> and what §8.1 of the build guide tells people to use. Building with it
> disabled produces firmware that flashes fine but whose Wi-Fi setup only
> appears on the other socket.

### Required libraries
PlatformIO clones these for you. For the Arduino IDE, install them via the
Library Manager:
- `ESP32-HUB75-MatrixPanel-DMA` (for driving the matrix)
- `Adafruit GFX Library` (dependency)

> The HUB75 library is also **vendored** under `patternflow/src/hub75/`, and that
> copy is the one that compiles — it carries Patternflow's additions
> (`resumeDMAoutput()` for sleep, the brightness hook the power clamp uses). The
> installed/cloned copy only needs to satisfy headers, so its exact version does
> not matter. See `src/hub75/VENDORED.md`.

The experimental OSC output uses the ESP32 Arduino core's built-in `WiFi` and `WiFiUdp` libraries, so it does not require an extra OSC library.

The experimental audio-react WebSocket control uses:
- `WebServer` from the ESP32 Arduino core
- `WebSockets` by Markus Sattler / Links2004

## Project layout

```
firmware/
├── patternflow/                 # The Arduino sketch (open patternflow.ino)
│   ├── patternflow.ino          # Main sketch: input routing, mode dispatch
│   ├── config.h                 # Hardware configuration (pin mappings, limits)
│   ├── net_config.h             # Wi-Fi / OTA / OSC / audio-react / self-update config
│   ├── pattern_registry.h       # Presets compiled in + .pfm modules discovered on FATFS
│   ├── presets/                 # Curated presets (34), compiled into firmware.bin
│   ├── abi/                     # Host ⇄ module contract for loadable patterns
│   │   ├── pf_abi.h             # Frozen C ABI: PFHostAPI, PFPatternModule, PF_ABI_VERSION
│   │   └── pf_module.h          # Module SDK — the ONE header a .pfm pattern includes
│   ├── patternflow_secrets.example.h  # Template (copy to patternflow_secrets.h)
│   └── src/                     # Foundation — not shown in the Arduino IDE tab bar
│       ├── core_display.h       # HUB75 driver init + refresh-rate config
│       ├── core_encoders.h      # Encoder ISRs + InputFrame contract
│       ├── core_canvas.h        # 128×64 RGB888 framebuffer + gamma/WB/sat
│       ├── core_math.h          # PFMath — shared verbatim with modules
│       ├── core_color.h         # PFColor — shared verbatim with modules
│       ├── core_noise.h         # PFNoise — shared verbatim with modules
│       ├── core_mem.h           # PSRAM-first allocator (PFMem)
│       ├── core_tables.h        # Panel-space polar tables (host-owned, 32 KB each)
│       ├── core_module_loader.h # ELF loader/relocator for .pfm modules
│       ├── core_power.h         # Total power clamp (measures demand, caps brightness)
│       ├── core_sleep.h         # Sleep mode: panel off, board idle, still on the network
│       ├── core_wifi.h          # Multi-network Wi-Fi (up to 5 saved, tried in order)
│       ├── core_improv.h        # Improv-Serial provisioning from the browser flasher
│       ├── core_osc.h           # OSC sidechannel (UDP)
│       ├── core_mqtt.h          # MQTT sidechannel (knobs, pattern, params, sleep)
│       ├── core_audio_ws.h      # Shared port-80 WebServer + audio-react WebSocket
│       ├── core_web_update.h    # Browser self-update (/update)
│       ├── core_patterns_http.h # Module manager (/patterns + /api/patterns)
│       ├── core_status_http.h   # Diagnostics (/status + /api/status)
│       ├── core_wifi_http.h     # Wi-Fi manager (/wifi + /api/wifi)
│       └── *_index.h            # PROGMEM HTML bundles for the pages above
├── modules/                     # Loadable-pattern sources (one dir per pattern)
│   └── <slug>/pattern.cpp       # + optional module.json sidecar
└── toolchain/
    ├── build_module.py          # pattern.cpp → <slug>.pfm (Xtensa relocatable ELF)
    ├── port_preset.py           # firmware .h → freestanding module source
    └── module.ld                # Collapses a module to .text/.rodata/.data/.bss
```

The `src/` subfolder holds the foundation that patterns build on. Arduino IDE compiles everything underneath the sketch folder, but `.h` files inside subfolders **do not appear as tabs** — so the IDE stays focused on the files you actually edit (the sketch, config, registry, and patterns) while the foundation stays out of the way. Patterns and the main sketch reference these helpers via `#include "src/core_*.h"`.

The foundation files are stateless utilities — no global state to coordinate, safe to include from any pattern.

## Foundation modules

Patterns should not duplicate trig tables, color converters, or noise functions. The foundation modules provide them once, shared across every pattern.

### `core_canvas.h` — PFCanvas
The single point of contact with the LED driver. Patterns write pixels into the canvas; the canvas pushes the frame to the HUB75 panel.

```cpp
PFCanvas::setPixel(x, y, r, g, b);   // inside the pixel loop
PFCanvas::present();                  // last line of draw()
```

Patterns must not call `dma_display->drawPixelRGB888()` directly. Global brightness, gamma, white balance, saturation, and any future post-processing live in `present()` — patterns that bypass the canvas miss those.

`present()` runs three post-processing steps before pushing pixels:
1. **Saturation boost** — pulls each pixel away from its Rec.601 luma in 8.8 fixed-point. Gray pixels are mathematically unchanged; saturated colors land closer to where the JS preview puts them. LED panels look washed out vs. a calibrated monitor, so a mild boost (default 1.10×) compensates.
2. **Per-channel gamma + white balance** — three 256-entry LUTs (one per channel) with the WB gain pre-multiplied into the gamma curve. HUB75 panels are linear PWM with unbalanced LED primaries (red is brighter per duty, blue is dimmer), so a single global gamma can't cover both correction needs. The pre-folded LUT means the inner loop pays the same cost as a single lookup.
3. **DMA push** — pixels are written to the HUB75 panel via `dma_display->drawPixelRGB888()`.

All five calibration values are tunable from `config.h` — see "LED panel calibration" below.

### `core_math.h` — PFMath
```cpp
PFMath::buildSinLUT();                       // call from setup() — idempotent
PFMath::fastSin(angle);                      // ~5x faster than sinf in pixel loops
PFMath::fastCos(angle);
PFMath::fract(x);                            // x - floor(x)
PFMath::lerp(a, b, t);
PFMath::approxLength(x, y);                  // ~5% accurate sqrt(x*x + y*y)
```

The sin LUT is 4 KB (1024 entries, ~0.35° resolution) and shared. Do not build your own.

`approxLength` is an octagonal sqrt approximation — ~5% error, no `sqrtf` in the pixel loop. Use it only when distance is a **secondary** signal. If distance IS the visual structure of the pattern (radial ripples, concentric rings, vortex centers, anything that uses `1/dist` for amplification), use real `sqrtf` instead — the octagonal contour shows up as visible polygonal artifacts in those cases.

### `core_color.h` — PFColor
```cpp
PFColor::hsvToRgb(h, s, v, r, g, b);                // h is 0..1 (not degrees)
PFColor::ColorStop ramp[] = { {0.0f, 0,0,0}, ... };
PFColor::sampleRamp(ramp, count, t, r, g, b);
```

### `core_noise.h` — PFNoise
```cpp
PFNoise::perlin2D(x, y);
PFNoise::fractal2D(x, y, octaves, roughness);
```

The 512-byte permutation table is shared. Do not duplicate it.

### `core_ota.h` — PatternflowOta
ArduinoOTA wrapper for wireless flashing. The main sketch only needs:

```cpp
PatternflowOta::begin();   // in setup() — connects Wi-Fi if not already up
PatternflowOta::handle();  // first line of loop() — UDP poll, ~free when idle
```

Shares Wi-Fi credentials and connection with OSC (if both are enabled, the connection is reused). When `PF_OTA_ENABLED` is 0 everything compiles to a no-op. See the [OTA Updates](#ota-updates-for-developers) section below for the user-facing workflow.

### `core_improv.h` — PatternflowImprov
Self-contained [Improv-Serial](https://www.improv-wifi.com/serial/) implementation so the **browser flasher** (ESP Web Tools, behind the website's "Flash" button) can set Wi-Fi over USB right after flashing — no rebuild, no `patternflow_secrets.h`. The main sketch only needs:

```cpp
PatternflowImprov::begin();   // in setup() — announces it speaks Improv
PatternflowImprov::handle();  // in loop()  — drains Serial, drives provisioning
```

The flasher sends the SSID/password over serial; `core_wifi.h` stores them in NVS (separate `pf_wifi` namespace) and uses them in preference to the built-in `PF_WIFI_SSID/PASS` placeholders on every boot. Shares the debug USB Serial — the host parser scans for the `IMPROV` header and ignores `println()` noise. Compiled in only when Wi-Fi is actually used (one of OTA/OSC/audio enabled) and `PF_IMPROV_ENABLED` is 1; otherwise a no-op. Set `#define PF_IMPROV_ENABLED 0` in `patternflow_secrets.h` to drop it.

## Patterns

The pattern list has two tiers:

- **Presets** — the curated showcase in `presets/`, compiled into `firmware.bin`.
  Pattern 1 is always `Origin`. They work whether or not the filesystem mounts,
  and switching between them is instant.
- **Modules** — `.pfm` files on the FATFS partition, discovered at boot and
  appended after the presets. This is how new patterns normally arrive now: a
  ~3–22 KB file installed over Wi-Fi at `http://patternflow.local/patterns`,
  **no reflash, no reboot**. See [Loadable pattern modules](#loadable-pattern-modules-pfm).

Both tiers share the same pattern shape — a namespace with:
- `NAME`
- `KNOB_LABELS`
- `setup()`
- `update(float dt, const InputFrame& input)`
- `draw()` — draws via `PFCanvas::setPixel(...)` and ends with `PFCanvas::present();`

and the same foundation (`PFCanvas`/`PFMath`/`PFColor`/`PFNoise`), so a pattern
written for one tier ports to the other mechanically. `CUSTOM_PATTERNS.md`
documents the submission format; the Pattern Lab at
[patternflow.work](https://patternflow.work) generates conforming C++ from a
JavaScript pattern via its "Copy C++ prompt" flow.

To add a **preset** (rare — curated set): copy `_TEMPLATE.h` into
`presets/preset_<name>.h` and add one `PATTERN_ENTRY(...)` line in
`pattern_registry.h`. To add a **module** (the usual way): see the next section.

## Loadable pattern modules (.pfm)

Patterns no longer have to be compiled into the firmware image. A pattern can
be built as a relocatable Xtensa ELF module, copied to the device over Wi-Fi,
and it appears in the list immediately.

```
firmware/modules/<slug>/pattern.cpp     ← freestanding pattern source
        │  python firmware/toolchain/build_module.py firmware/modules/<slug>
        ▼
<slug>.pfm  (+ <slug>.json sidecar)     ← 3–22 KB relocatable ELF
        │  drag onto http://patternflow.local/patterns   (several at once)
        ▼
FATFS /patterns/<slug>.pfm  →  loaded on selection in ~5–11 ms
```

The design comes from Simone Majocchi (@SimonePDA), who proved the whole idea
in a working fork: a frozen C ABI between host and module, a linker script
that collapses each module to four sections, and an on-device relocator.

**How it works, briefly.** The firmware exposes a versioned function table
(`abi/pf_abi.h` — framebuffer, present, alloc, log, millis, polar tables,
libm hooks). A module is compiled freestanding against `abi/pf_module.h`
only — never against Arduino or the HUB75 driver — and partially linked with
`toolchain/module.ld` so all code lands in one contiguous `.text` with
literals inside it. At load time `core_module_loader.h` reads the ELF from
FATFS, allocates executable internal RAM, applies `R_XTENSA_32` relocations,
resolves libm/libgcc against the host's own symbols, runs `.init_array` (so
C++ global constructors work), syncs the instruction cache, and calls the
module's entry point. Switching away unloads it; one module is resident at a
time.

**Converting an existing pattern header:**

```bash
python firmware/toolchain/port_preset.py firmware/patternflow/presets/preset_origin.h
python firmware/toolchain/build_module.py firmware/modules/origin
# outputs land in firmware/patternflow/data/patterns/ — upload from /patterns
```

The port is mechanical (drop firmware includes, add `#include "pf_module.h"`,
append `PF_REGISTER_PATTERN(Namespace)`); the body is copied verbatim because
the module SDK provides the same `PFCanvas`/`PFMath`/`PFColor`/`PFNoise`
surface — the math headers are literally the same files, included with
`-DPF_MODULE_BUILD`.

**Install paths**, easiest first:
- Community cart → "Send over Wi-Fi": opens `/patterns?src=<modules-url>`, and
  the page fetches and installs every file itself. Nothing downloaded.
- Drag any number of `.pfm`/`.json` files onto `/patterns` — a visible queue
  uploads them one by one with progress, retries, and per-file results.
- `curl -F "module=@slug.pfm" http://patternflow.local/api/patterns` for scripts.

**Costs and limits, measured on hardware** (128×64, esp32 core 3.3.8):

| Property | Measured |
|---|---|
| Switch latency (7.5 KB module) | 6.0 ms = read 4.4 + relocate 0.6 + setup 1.0 |
| Switch latency (22 KB module) | 10.9 ms — still under one 60 fps frame |
| Runtime speed vs the same source compiled in | **~20 % slower** (Origin: 53.4 → 43.5 fps) — the cost of relocatable code (`-mlongcalls`); not fixable by `-O2` (~2 %) or memory placement |
| Comfortable module size | ≲ 8 KB of data; a 22 KB module pushes `.rodata` to PSRAM and drops to ~14 fps |
| Panel size | Baked in at build (`-DPF_PANEL_W/H`); the loader rejects a mismatch |
| ABI | `PF_ABI_VERSION` must match; bump it on ANY layout change in `pf_abi.h` and rebuild every module |

If a module fails to load, nothing else is affected — the presets and other
modules keep working, the panel shows a `PATTERN FAILED` screen with the
reason, and `/api/status` reports it as `loadError`. The usual cause is a
libc/libm symbol the host does not export yet: the message names it
(`unresolved symbol: rand`), and the fix is one line in `resolveHostSymbol()`
in `core_module_loader.h`. Check `loadError` first for any "this pattern is
broken" report — it turns a vague complaint into a specific one.

**Pattern names are UTF-8.** "Dynamic Moiré" and "Poincaré Sphere" are real
entries in the library, and an accent used to break three layers at once: the
toolchain scripts printing a name on a cp949 console, a loader guard that
tested names for printable ASCII and called anything else a relocation bug,
and the panel's 5×7 ASCII font. Names stay UTF-8 in the ELF and in every JSON
API; only the panel folds them (`asciiFold()` in `patternflow.ino`). Any new
code that touches a name must assume UTF-8.

### How many can you install

Installing costs nothing at runtime. The registry allocates its arrays at full
capacity on boot, in PSRAM, whether or not the modules exist — so five
installed modules and 128 installed modules use exactly the same RAM. Only the
**resident** module costs internal RAM, and unloading returns all of it
(measured: 4,548 B free with a module resident → 11,692 B on a preset).

| Limit | Value | Binding? |
|---|---|---|
| Installed modules | **128** (`MAX_MODULE_PATTERNS`) | The only real cap, and it is a UX choice — 136 B of PSRAM per slot, 17 KB total |
| Storage | ~1,500 modules (10.2 MB partition, 5.9 KB median) | No — 12× the count cap |
| Per-module RAM | ≲ 8 KB of data comfortable | Yes, for that module's own frame rate |
| Concurrent modules | 1 | By design — one pattern is selected at a time |

A large module only costs while it is the selected pattern; it has no effect
on the presets or on any other module. The one way it is not self-contained:
while resident it drops `heapLargest` to ~3 KB, which is what makes opening a
console page pause the pattern (see the constraints section below).

Measured across the real 42-pattern community library: median `.pfm` 5,924 B,
largest 17,512 B, smallest 4,612 B, 281 KB for all 42 together.

### Current state (v3.1.0, measured on hardware, core 3.x build)

> Heap rows here are core 3.x figures. The same board on a core 2.x build has
> ~98 KB free / ~90 KB largest with a preset resident, and ~79 KB free with a
> module resident — the difference between a module loading and being refused.

| | |
|---|---|
| Frame time, preset (Origin) | 18,717 µs = **53.4 fps** |
| Internal heap, preset resident | 11,692 B free, largest block 7,668 B |
| Internal heap, module resident | ~4,550 B free, largest block ~3,060 B |
| PSRAM | 8.28 MB idle |
| Flash | 1,292,519 B = **41 %** of the app partition |
| Globals | 92,760 B = **28 %**, 234 KB left for locals |
| Pattern storage | 73,728 / 10,235,904 B with 5 modules installed |
| Leak check | 48 consecutive page loads: **−8 B** net, largest block unchanged |

## Adding features — the constraints that matter

Read this before adding anything to the firmware. Every item here was learned
the expensive way, with measurements to back it.

### Internal RAM is the budget. Everything else is roomy.

The ESP32-S3 has 512 KB of internal SRAM, but what a feature can actually
claim is far smaller:

```
≈320 KB   Arduino data region (of 512 KB SRAM; rest is cache/ROM/RTOS)
 −92 KB   this firmware's globals (24 KB canvas, fonts, module state…)
 =213 KB  free heap at boot                          ← measured, core 2.x
 −150 KB  HUB75 DMA framebuffers (see below)
 −49 KB   Wi-Fi socket buffers, HTTP, OSC, mDNS…
 ≈ 15 KB  steady-state free internal heap
```

**That last line is a build choice, not a hardware limit.** The figures above
are the core 3.x picture. Core 2.x gives back roughly 71 KB that IDF 5 takes
before `setup()` even runs, so the same firmware idles at **~98 KB free,
90 KB largest block** — see [Required board package](#required-board-package).
Build on core 2.x and the numbers below stop being the constraint they were.
Build on core 3.x and they are real, so know which one you measured on before
concluding a feature is too expensive.

Below roughly **10 KB free**, the web console starts failing in a maddening
way: every endpoint returns its status line and then hangs, while Wi-Fi, OSC
and OTA look perfectly healthy. A 7 KB static array added during development
took down four unrelated pages at once. So:

- **Static buffers are guilty until proven innocent.** If data is written at
  boot and read occasionally — lists, tables, names — allocate it from PSRAM
  (`heap_caps_calloc(1, size, MALLOC_CAP_SPIRAM)`). There are **8 MB** of
  PSRAM sitting idle; the pattern registry lives there for exactly this
  reason. Reserve internal RAM for hot loops and DMA.
- Check `/status` (or `/api/status`) after your change: it reports free
  internal heap, largest block, and PSRAM live from the device.

### Why HUB75 owns 150 KB and it cannot move

HUB75 panels have no framebuffer of their own and only understand on/off per
pixel. The driver therefore streams the whole frame continuously (the panel
lights 2 rows at a time) and achieves 256 brightness levels by re-sending the
frame as 8 binary-weighted bit-planes (BCM). That waveform is what DMA plays
out autonomously:

```
128 cols × 32 row-pairs × 2 B = 8 KB per bit-plane
× 8 bit-planes                = 64 KB per frame buffer
× 2 (double buffering)        = 128 KB  (+ descriptors ≈ 150 KB)
```

It must be internal RAM — PSRAM's latency jitter glitches the 15 MHz stream.
Shrinking it costs image quality directly (6-bit color = banding in exactly
the gradients these patterns live on; single buffering = tearing). This is
the standard tax every ESP32-driven HUB75 project pays; in exchange, refresh
costs zero CPU and the render loop effectively owns a core.

### The Arduino WebServer will hurt you. Known landmines:

The console shares **one** synchronous, single-client `WebServer` on port 80
(owned by `core_audio_ws.h`; other features attach routes to it). Learned so
far, each confirmed by A/B on hardware:

1. **A multipart POST with a URL query string gets an empty reply.** Send
   flags as form fields instead (`fd.append('last', …)`), never `?last=1` on
   an upload.
2. **Never do heavy work inside a request handler.** A FATFS rescan + module
   reload inside the upload handler crashed the device mid-batch — and the
   crash corrupted the FAT. Handlers set a flag; `tick()` functions called
   from `loop()` do the work ~150 ms later (see `core_patterns_http.h`).
3. **Never force-close connections from the server** (`client().stop()`).
   Each server-initiated close parks a TCP pcb in TIME_WAIT; after a couple
   of upload batches every multi-chunk transfer died until reboot.
4. **Rapid sequential uploads flake ~1 in 12** even when healthy (dead reply
   after the file was stored). Client pages pace files ~350 ms apart and
   retry each file twice; re-uploading is harmless (same bytes, same name).
5. **Never auto-format the filesystem on a failed mount.** A crash mid-write
   once corrupted the FAT and the "helpful" auto-format erased every
   installed module. Mount failure now means presets-only; formatting is an
   explicit button (`POST /api/patterns/format`).

6. **A response larger than ~5.6 KB needs the heap a loaded module is
   holding.** This one looked for a long time like a slow "leak" that
   degraded over hours; it is not. Measured on one device, one minute apart:

   ```
   module resident    internal heap  4,932   /patterns truncated at 5,633 B
                                             after a 10 s stall
   module unloaded    internal heap 11,852   /patterns whole (15,903 B), 0.43 s
   ```

   5,633 B is four TCP segments — one bufferful. Under a starved heap the
   one-shot `send()` fills that and gives up, and the client waits out the
   timeout holding half a page. The HTML renders, its script is cut
   mid-statement and never runs, and the console looks blank while every API
   underneath answers fine.

   The console therefore **pauses the pattern**: opening any console page
   evicts the module, and `tick()` restores it after 25 s of console
   silence (`core_patterns_http.h`). The request that triggers the eviction
   cannot be rescued — its send path is already constrained — so it gets a
   552-byte interstitial that reloads itself.

   **This is a memory wall, not a pacing problem.** It is tempting to read
   the 10 s stall as impatience — `NetworkClient::write()` really does send
   with `MSG_DONTWAIT` and give up after `WIFI_CLIENT_MAX_WRITE_RETRY` (10)
   non-writable selects of 1 s each, which is where the ten seconds comes
   from. Rewriting the send path to be patient does not help, because the
   number that matters is `heapLargest`: **3,060 bytes** with a module
   resident. lwIP cannot allocate the pbufs, and no amount of waiting
   creates them.

   Three fixes were tried on hardware and **do not work**; do not retry them:
   - Spilling module data sections to PSRAM to spare internal RAM — reboots
     the device the moment a module is selected.
   - Chunked transfer encoding — delivers *less*, not more (one 1 KB chunk,
     or nothing), with or without pacing between chunks.
   - 512-byte slices with a wall-clock deadline instead of a retry count
     (`core_http_send.h`, reverted in bb8e52c) — delivers **3,072 B**, worse
     than the 5,633 B it replaced, and still takes the full 10 s. It *is*
     ~3× faster than `send_P` on a healthy heap, which is exactly the trap:
     it measures beautifully in the condition that was never the problem.

   An async server (ESPAsyncWebServer or esp-idf httpd) would lift the
   one-client and upload-pacing limits, but it shares this same lwIP heap —
   do not expect it to make a 16 KB page deliverable on a 4.5 KB heap. The
   only real levers on page delivery are using less internal RAM per module
   or shrinking the pages.

### Adding a console page

Follow the existing shape (`core_status_http.h` + `status_index.h` is the
smallest example): one `core_<name>_http.h` that attaches routes in a
`begin()` called from the Wi-Fi connect edge in `patternflow.ino`, one
`<name>_index.h` PROGMEM HTML bundle, a row on `home_index.h`. Rules:

- Self-contained HTML only — the device serves with no internet in the loop.
  Match the cream/ink/LED design tokens of the existing pages.
- **Syntax-check the page's JavaScript before flashing**:
  extract the `<script>` body and run `node --check` on it. A single stray
  newline in a string once shipped a page whose script never ran — the page
  rendered but showed nothing, which reads as "the device is broken".
- Keep pages lean, and call `PatternflowPatternsHttp::noteConsolePageOpened()`
  first (see any existing page): a page over ~5.6 KB cannot be delivered while
  a pattern module is resident. `/status` at 5.5 KB was the only page that
  survived that state by accident.
- **Never leave the render loop with nothing to draw.** If a screen decides not
  to paint, set `frameDrawn = false`; flipping an unpainted buffer shows a torn
  leftover frame, which every tester reads as "the pattern is broken".

### What is cheap and what is expensive here

Cheap (fits the platform well):
- **Wired OSC over USB-C** — the S3's native USB does CDC serial out of the
  box; OSC 1.1 over SLIP is a standard TouchDesigner/Max speak. Reuses the
  existing OSC message parser with a different transport. Near-zero RAM,
  independent of Wi-Fi entirely. A very good first contribution.
- More device pages, more OSC addresses, more module-SDK helpers (add the
  symbol to the host table + bump nothing, if it's a new function on
  `PFHostAPI` — that's an ABI bump).
- Anything whose cold data can live in PSRAM.

Expensive (think twice, or push to "Remote compute"):
- TLS clients/servers (tens of KB of internal RAM per connection).
- Many concurrent WebSockets or HTTP clients (single-threaded server today).
- Anything needing large always-resident internal-RAM buffers — that budget
  is 15 KB, total, shared with everyone.

## Configuration (`config.h`)

All hardware-specific pins and limits are centralized in `config.h`.
- **Panel Selection:** `PANEL_PROFILE` picks the driver-init path — `PANEL_STANDARD` (no init; the default and what the browser flasher ships), `PANEL_HIGHREFRESH` (FM6126A), `PANEL_FM6124`, `PANEL_ICN2038S`, `PANEL_MBI5124`, `PANEL_DP3246`. It expands to the `HUB75_DRIVER` value `core_display.h` passes to the library. **Don't set it by part number — leave it at `PANEL_STANDARD` unless the panel comes up completely dark.** The init sequence only writes a brightness register and an output-enable bit; many panels ship with those already usable, and the reference panel's FM6124 runs fine without it. A panel that genuinely needs a different profile needs one custom build. Full buyer's guide: [docs/panel-compatibility.md](../docs/panel-compatibility.md).
- **Pin Mapping:** Adjust the `R1_PIN`, `ENC1_A` etc. if you are not using the official Patternflow PCB.
- **Hardware Settings:** `INVERT_ENCODER` can be toggled depending on whether you mounted your encoders on the front or back of the PCB. `DEFAULT_BRIGHTNESS` controls the initial matrix brightness.

### LED panel calibration
LED panels render the same RGB triplets differently than a calibrated monitor — the LED primaries are at different wavelengths than sRGB phosphors, red LEDs are brighter per PWM duty than blue, and linear PWM doesn't match perceptual brightness. The defaults below are a mild correction tuned for typical HUB75 panels; every value can be overridden per panel:

```cpp
#define LED_GAMMA_R   2.5f   // steeper than baseline — curbs red dominance
#define LED_GAMMA_G   2.4f   // baseline
#define LED_GAMMA_B   2.2f   // gentler — keeps blues from collapsing
#define LED_WB_R      0.92f  // trim red gain
#define LED_WB_G      0.92f  // trim green gain
#define LED_WB_B      1.00f  // keep blue
#define LED_SAT_BOOST 1.10f  // pull saturated colors away from gray
```

To revert to the previous single-gamma behavior, set all three gammas to 2.4, all WB gains to 1.0, and `LED_SAT_BOOST` to 1.0.

### Refresh rate (anti-flicker for video)
`core_display.h` configures the panel for ~240Hz refresh:

```cpp
mxconfig.i2sspeed         = HUB75_I2S_CFG::HZ_15M;  // pixel clock 15 MHz
mxconfig.min_refresh_rate = 240;                      // target refresh
mxconfig.latch_blanking   = 2;                        // brightness uniformity
```

HUB75's BCM (binary code modulation) cycles bit planes at the library default ~120Hz, which aliases against phone-camera rolling shutter and shows up as visible flicker bands on video. Pushing refresh past 240Hz means a 60fps camera averages 4+ cycles per exposure and the bands disappear. I2S/DMA refresh runs on the ESP32-S3's hardware peripherals in parallel with the CPU, so this costs zero rendering FPS — the only trade-off is that the library may quietly reduce effective color depth (8-bit → 6–7 bit) to fit the higher refresh into the same clock budget. If you see banding on long color gradients, dial `min_refresh_rate` down to ~180 or drop `i2sspeed` to `HZ_10M`.

## Controls

The four rotary encoders control pattern-specific parameters. Each pattern exposes its own labels through `KNOB_LABELS`.

For the original defaults:
- **Encoder 1:** Hue
- **Encoder 2:** Speed
- **Encoder 3:** Mode/Preset
- **Encoder 4:** Frequency

### Longpress actions
- **Encoder 1 longpress (≥1s)** — enter/exit global brightness mode. While active, K1 rotation adjusts panel brightness (5–255, ~5 per detent), the active pattern does not see K1 input, and a "BRIGHTNESS XX%" overlay shows the current level. Exits on a second longpress or after 5 seconds of idle. Value persists across reboots via NVS.
- **Encoder 2 longpress (≥1s)** — enter/exit the NETWORK screen (portrait status view: Wi-Fi state, local IP, OSC on/off and its remote host/port, audio-react on/off). Inside the screen, settings are toggled by **knob rotation, not clicks** — right = ON, left = OFF — so that holding K2 to leave can't flip anything on the way out:
  - **turn K2** → OSC send/receive on/off (persists in NVS, so the device reboots into the same state). Wi-Fi stays connected either way; the toggle only enables/disables traffic. If the firmware was built with `PF_OSC_ENABLED 0` the row still shows but the toggle is inert ("REBUILD WITH PF_OSC_ENABLED=1").
  - **turn K3** → audio-react on/off (also persisted).
  - **turn K1** → sleep (see [Sleep mode](#sleep-mode) below). Either direction, unlike the toggles above: the screen is about to go dark, so "right = on" has nothing to mean.
  - **turn K4** → hand off to the UPDATE screen, which arms the `/update` endpoint (the arming *is* the security model — see `core_web_update.h`).

  Exits on a second K2 longpress, a **K2 click**, or after 8 seconds of idle.
- **Encoder 3 longpress (≥1s)** — enter/exit the KNOB MAP screen: it shows which physical knob is which number (front view: K1 top-right, K2 top-left, K3 bottom-right, K4 bottom-left), and turning any knob lights its digit green so each one can be verified without leaving the screen. Knob input is swallowed while it's up, so the pattern underneath never sees it. Exits on a K3 click, a second K3 longpress, or after 8 seconds of idle.
- **Encoder 4 longpress (≥1s)** — enter/exit pattern SELECT mode. In SELECT mode, K4 rotation cycles patterns; longpress again to confirm.

### One detent, one step
Knob deltas are linear: a pattern sees exactly the number of detents that were turned, however fast the turn was.

There used to be a fast-spin multiplier here (×2 to ×5 as the gap between detents shrank), meant to let one knob sweep a wide range quickly. It was removed after testing against a linear build, because it made the knobs unpredictable on exactly the parameter that most needs landing on a value — Origin's Mode knob picks a discrete preset, and a quick turn skipped five at a time. OSC had already been routed around the multiplier for the same reason, which was the tell.

**If a pattern's range feels slow to cross, raise that pattern's own step constant** (`d * 10` → `d * 25`). Linear and predictable beats a curve guessing at intent.

### Short press (per-pattern, opt-in)
There is no global short-press handler. Each pattern decides what `K1..K4 short press` does for itself, by reading `input.btnPressed[i]` inside its `update()`. The built-in patterns (`Origin`, `Wave Saw`) use short press to reset the corresponding parameter to its default. A pattern that does not handle `btnPressed` — most of the curated presets — simply ignores short presses.

When you generate a new pattern from the Live Editor, the conversion prompt does not force a particular short-press convention — if you want one, either ask for it in the prompt ("K1 short press resets hue") or add the line by hand in `update()`.

## Sleep mode

`src/core_sleep.h`. The panel goes dark and the board idles, without anything being unplugged, and it stays **on the network** the whole time.

That last part is the design decision. `esp_deep_sleep` would take the draw to microamps, but it takes the radio with it, and then the only way back is a button — which is exactly what "switch the lights off from the sofa" needs not to be true. So sleep here means:

| | |
| :--- | :--- |
| **Panel** | framebuffer blanked, brightness 0, HUB75 DMA transfer stopped |
| **Wi-Fi** | modem sleep — still associated, wakes on its DTIM beacon |
| **CPU** | 80 MHz, the floor at which the radio still works |
| **`loop()`** | returns early and yields 20 ms; no render, no flip, no power clamp |

Stopping the DMA transfer is what makes this worth more than blanking. The LEDs are most of the draw and blanking collects that, but with the transfer running the panel's driver ICs are clocked at 15 MHz forever, lit or not. `core_power.h` puts that idle floor at ~550 mA against ~1900 mA for a bright pattern.

The yield is not politeness either: without it the sleeping loop polls sockets flat out and the core never idles, so neither modem sleep nor the IDF's clock gating gets a chance.

### Entering and leaving

| Enter | Leave |
| :--- | :--- |
| the **On / Sleep** switch on the console home page (`/`) | the same switch |
| NETWORK screen (hold K2) → turn K1 | any **physical** knob turn or button press |
| MQTT `<prefix>/sleep` ← `1` / `on` / `true` / `sleep` / `toggle` | same topic ← `0` / `off` / `false` / `wake` |
| `POST /api/sleep` ← `on=1` (also `on=toggle`) | `POST /api/sleep` ← `on=0` |
| | a firmware image starting to arrive (web update or `espota`) |

"Physical" is meant literally: waking checks the raw encoder counters, not `input.knobDeltas`, because remote OSC/MQTT/audio deltas are merged into that field by the time the input frame exists. A show still streaming knob values at a sleeping panel must not switch the lights back on. Input is ignored for the first 800 ms so the second detent of the K1 turn that started the sleep doesn't end it.

Sleep is never entered while an image is being written to flash, and a device already asleep wakes when one starts arriving — whoever is flashing wants the UPDATE screen anyway.

The state is **not** persisted: a device unplugged while asleep boots awake, because a panel that stays dark after you plug it in reads as broken.

### Waking gives the pattern back

Opening any console page evicts the resident module to free DRAM (`noteConsolePageOpened()`), and with Origin the only compiled-in preset, the pattern you are running is almost always a module — so this is the ordinary case, not an exotic one. Left alone, waking with a console tab open would land the panel on the `CONSOLE PAUSED` card until the 25-second idle timer fired.

So a wake — from *any* of the three sources, not just the web switch — asks for the pattern back via `PatternflowPatternsHttp::requestReload()`, the same path the console's Play Now button uses. The reload happens in `tick()` from `loop()`, never inside an HTTP transaction.

### The switch, and why `/api/sleep` is its own endpoint

The console home page carries an **On / Sleep** pair in the device card, styled like `/mqtt`'s channel buttons — the console's existing way of picking between states. It is a *view* of the device's state: K1 and MQTT change the same thing, and the page's 3-second `/api/status` poll follows them within a beat.

`POST /api/sleep` only *queues* the transition (`PatternflowSleep::request()`), so its reply reports the state as it stands, not as it will be — stopping a DMA engine and reclocking the CPU belong in `loop()`, not inside an open response. The page therefore paints optimistically and suppresses the poll for 1.5 s, or the reply would snap the switch back under the cursor.

Sleep control deliberately does **not** live on `/api/display`, where the plumbing first landed. That endpoint is independently compile-out-able (`-DPF_DISPLAY_HTTP_ENABLED=0`), which would leave the switch dead in a build with an otherwise complete console — and sleep is a power state, not a display calibration. `/api/display` still *reports* `sleep`, read-only, because a dark panel is the first thing to rule out while tuning.

### MQTT

`<prefix>/sleep` is obeyed in **either** role, unlike the knob and pattern topics — a panel set to Publisher is still a panel you want to be able to switch off. It is a broadcast for the same reason `<prefix>/message` is: one `1` on a shared prefix sleeps every panel on it. Give a panel its own prefix if that is not what you want, and send the command non-retained unless you really do want panels coming back asleep after every reconnect.

The device publishes `<prefix>/sleep/state` (`0` or `1`, non-retained) on every change and once per connection — enough for a Home Assistant switch.

```bash
mosquitto_pub -h <broker> -t patternflow/sleep -m 1
mosquitto_sub -h <broker> -t 'patternflow/sleep/state'
```

Unrecognised payloads are ignored rather than guessed at; a typo should not black out a panel.

### Compile-time flags (`config.h`)

| Flag | Default | Meaning |
| :--- | :--- | :--- |
| `PF_SLEEP_ENABLED` | `1` | compile the feature in at all |
| `PF_SLEEP_STOP_DMA` | `1` | stop the HUB75 transfer, not just blank. **Set to 0 if the panel comes back black or garbled after waking** — sleep then blanks only, which is safe on any panel and still saves the LED current |
| `PF_SLEEP_CPU_MHZ` | `80` | clock while asleep; `0` disables the switch |
| `PF_AWAKE_CPU_MHZ` | `240` | clock restored on wake |

`PF_SLEEP_STOP_DMA` depends on `resumeDMAoutput()`, a Patternflow addition to the vendored HUB75 driver — upstream's `stopDMAoutput()` is a one-way trip. See `src/hub75/VENDORED.md`.

## Remembering the selected pattern

The pattern you left running comes back after a sleep and after a full power cut. It is stored in NVS as a **slug**, not an index: installing or deleting one `.pfm` renumbers the whole list, so an index would come back as somebody else's pattern. Resolution on boot goes through `findPatternByName()` in `pattern_registry.h`, which matches display name and slug alike.

The write is debounced — it waits until SELECT mode is left and the choice has been still for 3 seconds — so spinning K4 through fifty patterns is one NVS write, not fifty. Brightness has used the same shape for longer.

A remembered pattern that is gone, or that no longer loads, falls back to Origin with a log line. The PATTERN FAILED screen is the right answer for a pattern somebody just picked and the wrong one for a boot: nobody asked for it in this session.

## Audio-react WebSocket Control

Patternflow can receive four normalized audio-control streams over WebSocket on port `81`. Current browser clients send normalized deltas so audio, WS Test, OSC, and physical encoders all arrive at patterns as `knobDeltas`:

```text
d=0,v=0.125
off=0
off
```

The older absolute message shape, `k=0,v=0.735`, is still accepted for compatibility. The firmware does not require each pattern to opt in. From a pattern's point of view, audio looks like the user is turning the four encoders. This keeps pattern code independent from the audio transport and lets any encoder-driven pattern react.

The conversion is tuned in `config.h`:

```cpp
#define PF_AUDIO_ENABLED 1
#define PF_AUDIO_HTTP_PORT 80
#define PF_AUDIO_WS_PORT 81
#define PF_AUDIO_VIRTUAL_KNOB_SCALE 48.0f
```

`PF_AUDIO_VIRTUAL_KNOB_SCALE` controls how strongly a normalized 0..1 audio change becomes knob motion.

### Recommended: Chrome/Edge extension

Use [`tools/patternflow-audio-extension`](../tools/patternflow-audio-extension) for tab audio. It captures the active browser tab, runs FFT analysis in the browser, and sends only four lightweight knob values to Patternflow. It also includes **WS Test** sliders for debugging the device connection without audio capture.

Install for local testing:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `tools/patternflow-audio-extension`.
5. Open a tab that is playing audio.
6. Click the Patternflow Audio extension button and press **Start**.

Set the device host to `patternflow.local` or the board IP address.

### Built-in device page

When Wi-Fi is configured and audio is enabled, the device also serves a small page at:

```text
http://patternflow.local/
```

Keep this page for file playback, microphone input, and local experiments. Browser tab/system capture from this page is limited by browser secure-context rules because the ESP32 serves normal HTTP. For YouTube/Spotify tab audio, the extension is the better path.

## Experimental OSC Output

Patternflow can send lightweight OSC control messages over Wi-Fi for performance setups such as Ableton Live Suite with Max for Live. This is meant for knobs, buttons, pattern status, and heartbeat messages, not for streaming rendered pixels.

The full wire protocol is specified in [`docs/osc-spec.md`](../docs/osc-spec.md). A ready-made Max for Live bridge device (knobs → any Live parameters) lives in [`integrations/ableton/`](../integrations/ableton/).

OSC has two switches: **compile-time** (whether OSC code is linked into the firmware at all) and **runtime** (whether the linked-in code is currently sending/receiving). The K2 longpress info screen only controls the runtime switch — if the compile-time switch is off, the runtime toggle is inert.

### Compile-time: enable the build flag and provide Wi-Fi credentials
Copy `patternflow/patternflow_secrets.example.h` to `patternflow/patternflow_secrets.h` and edit the local copy:

```cpp
#define PF_OSC_ENABLED 1
#define PF_WIFI_SSID "your-wifi-name"
#define PF_WIFI_PASS "your-wifi-password"
```

You normally do **not** need to configure the laptop's IP: the device learns the remote host from the first valid OSC packet it receives (send `/patternflow/ping` — the M4L bridge's Connect button does this). Until then the K2 info screen shows `WAIT HOST`. For send-only setups where the host never sends anything, a static target can still be set:

```cpp
// optional, send-only setups
#define PF_OSC_REMOTE_HOST "192.168.0.10"  // laptop IP
#define PF_OSC_REMOTE_PORT 9000
```

`patternflow_secrets.h` is ignored by git so local Wi-Fi credentials do not get committed. The defaults for everything you leave unset live in `net_config.h`.

Without a `patternflow_secrets.h` file, OSC stays off (the default `PF_OSC_ENABLED 0` in `net_config.h` applies) and the K2 info screen will show `OFF (compile-time)` — meaning no rebuild can turn it on except by providing the secrets file and reflashing.

### Runtime: toggle from the device (no rebuild)
Once compiled in, OSC can be flipped on/off from the device itself via the K2 longpress info screen — no Arduino IDE round-trip needed. See the "Controls → Longpress actions" section above. The runtime state is saved in NVS, so the device boots into whatever it was last set to.

Then put the laptop and Patternflow on the same Wi-Fi network. OSC is a sidechannel: when enabled, knob, button, and status messages are sent continuously, whichever pattern is running. It does not change what is drawn on the LED matrix. In Max for Live, receive UDP on the same port and route these OSC addresses:

```text
/patternflow/knob/1/delta
/patternflow/knob/1/clicks
/patternflow/button/1/press
/patternflow/button/1/held
/patternflow/pattern/index
/patternflow/pattern/name
/patternflow/content/mode
/patternflow/app/mode
/patternflow/heartbeat
/patternflow/hello          (on connect / announce)
/patternflow/version        (on connect / announce)
/patternflow/ip             (on connect / announce)
```

In a Max patch, the receiving side is typically `udpreceive 9000` followed by `oscparse`, then route the address parts and map values to Live parameters with Max for Live devices such as `live.remote~`, `live.object`, or your own mapping patch.

### Receiving OSC (host → device)

The device also listens on `PF_OSC_LOCAL_PORT` (default 9001) so an external host can drive it back. Send any of these addresses from Ableton/Max:

```text
/patternflow/ping              (—)             — learn sender as remote host + reply with full announce
/patternflow/knob/N/delta      (int or float)  — virtual rotation on logical knob N (1..4)
/patternflow/pattern/index     (int or float)  — switch to pattern at this registry index
```

`/patternflow/content/toggle` is still accepted but does nothing — the Pattern/Video content-mode split was removed, so `/patternflow/content/mode` now always announces `0`. Both stay on the wire only so older hosts don't error; don't build against them.

Numeric arguments may be int or float (floats are rounded) — Max patches commonly send floats, and silently dropping them was a debugging trap. Knob deltas are applied on top of any physical encoder motion in the same frame, at the raw 1×-per-detent rate — the same rate physical knobs now use. Useful for Ableton automation lanes that drive a pattern parameter from a Live track. Unknown addresses (and `#bundle` packets) are ignored silently. Receive buffer is 256 bytes per packet; up to 8 datagrams are drained per frame so fast automation streams don't build up queue latency.

## Wireless update from the browser

Once the device is on Wi-Fi, it can flash itself from any browser on the same network — no Arduino IDE, no USB cable, no TLS setup ([#232](https://github.com/engmung/Patternflow/issues/232)).

1. Get a firmware `.bin`: build one on [patternflow.work](https://patternflow.work) and hit *Download .bin*, or export one locally (`arduino-cli compile --output-dir …` — use the app image, not a merged full-flash image).
2. Open `http://patternflow.local` — the device serves a small console (audio sync / firmware update) — and pick **Firmware Update**, or go straight to `/update`. If `.local` doesn't resolve (common on Android), use `http://<ip>/update`; the device shows its IP on the NETWORK screen (hold K2) and on the UPDATE screen.
3. Drop the `.bin` on the page. The panel shows flash progress; the device verifies, reboots, and comes back on the new firmware in about ten seconds.

Notes:

- **Uploads are accepted at any time by default** (`PF_WEBUPDATE_ALWAYS_ARMED 1`): drop a .bin whenever, no trip to the device. The flip side, stated plainly: anyone on the same Wi-Fi can flash the device from a phone browser — the same exposure ArduinoOTA's no-password default already has. On shared, office, or exhibition Wi-Fi, build with `#define PF_WEBUPDATE_ALWAYS_ARMED 0` in `patternflow_secrets.h`: uploads are then refused (`403`) unless the UPDATE screen is open on the device (hold **K2** → NETWORK, turn **K4**) — a physical arming switch only someone at the device can flip; leaving the screen (K4 click, or the 10-minute idle timeout) disarms it again.
- A failed or interrupted upload leaves the old firmware running — `Update.h` only switches the boot partition after a complete, verified image. Power loss *during* the flash write is the one case to avoid; the panel says so while flashing.
- Like all wireless paths, this capability has to arrive over USB once (it ships in the stock release).
- Set `#define PF_WEBUPDATE_ENABLED 0` in `patternflow_secrets.h` to compile it out.

## OTA Updates (For Developers)

The firmware includes `ArduinoOTA` for wireless flashing from the Arduino IDE — no USB cable, no port juggling.

### One-time setup
1. Copy `patternflow/patternflow_secrets.example.h` to `patternflow/patternflow_secrets.h` and fill in your local Wi-Fi credentials:
   ```cpp
   #define PF_WIFI_SSID "your-wifi-name"
   #define PF_WIFI_PASS "your-wifi-password"
   ```
   (You don't need to enable `PF_OSC_ENABLED` — OTA brings up Wi-Fi on its own. One secrets file now covers Wi-Fi, OTA, OSC, and audio-react.)
2. Flash once over USB as normal. On boot, the serial console should print:
   ```
   [OTA] Ready — hostname "patternflow.local", IP 192.168.x.x
   ```

### Subsequent uploads
1. In Arduino IDE, open **Tools → Port** — you should see `patternflow at 192.168.x.x (ESP32)` alongside the USB ports.
2. Select that network port and hit Upload. The IDE compiles, pushes over Wi-Fi, and the device reboots into the new firmware.
3. Progress prints to serial as `[OTA] 47%` etc.

If the network port doesn't appear, make sure your computer and the device are on the same Wi-Fi subnet, and that no firewall is blocking mDNS (UDP port 5353) or the OTA port (3232).

### The upload-password prompt (and how to avoid it)
The firmware ships with **no OTA password** (`PF_OTA_PASSWORD ""`), so the device never challenges for one. But **Arduino IDE 2.x always pops a password dialog for network ports and refuses an empty field** — that's an IDE limitation, not the firmware. Two ways around it:

- **Stay in the IDE:** type any dummy character in the prompt. With no-auth firmware the device ignores it, so the upload still succeeds.
- **Skip the prompt entirely (recommended for no-password):** upload from the command line, which never asks. With the ESP32 core's bundled `espota.py`:
  ```bash
  python espota.py -i patternflow.local -p 3232 -f /path/to/patternflow.ino.bin
  ```
  (no `-a` flag = no password). Or `arduino-cli upload -p patternflow.local -b esp32:esp32:<board> patternflow/`.

To require a password instead, set `#define PF_OTA_PASSWORD "your-secret"` in `patternflow_secrets.h`.

### Known issue: `invalid int value: '{upload.port.properties.port}'`
Arduino IDE 2.x's mDNS discovery for ESP32 core 3.3.8 doesn't populate the `{upload.port.properties.port}` placeholder, so espota receives the literal string and fails:
```
espota.exe: error: argument -p/--port: invalid int value: '{upload.port.properties.port}'
```

One-time fix — create a `platform.local.txt` next to the ESP32 core's `platform.txt` (the IDE auto-merges local overrides, so this survives ESP32 core updates):

- Path on Windows: `%LOCALAPPDATA%\Arduino15\packages\esp32\hardware\esp32\3.3.8\platform.local.txt`
- Path on macOS: `~/Library/Arduino15/packages/esp32/hardware/esp32/3.3.8/platform.local.txt`
- Path on Linux: `~/.arduino15/packages/esp32/hardware/esp32/3.3.8/platform.local.txt`

Contents (one line):
```
tools.esp_ota.upload.pattern={cmd} -i {upload.port.address} -p 3232 "--auth={upload.field.password}" -f "{build.path}/{build.project_name}.bin"
```

This hardcodes the OTA port to 3232 (which is what ArduinoOTA always listens on anyway). Restart the Arduino IDE after creating the file.

### Disabling / customizing
- Set `#define PF_OTA_ENABLED 0` in `patternflow_secrets.h` to compile OTA out entirely (no Wi-Fi stack pulled in unless OSC or audio-react is also enabled).
- Set `#define PF_OTA_HOSTNAME "yourname"` to advertise as `yourname.local` instead of `patternflow.local` — useful if multiple devices are on the same network.
- OTA ships with no password by default (`PF_OTA_PASSWORD ""`). Set `#define PF_OTA_PASSWORD "your-secret"` in `patternflow_secrets.h` to require one on a shared network. See "The upload-password prompt" above for the Arduino IDE 2.x quirk.

## Possible next steps

Things that fit cleanly on top of the current foundation. Not promises — just a record of what becomes easy once `PFCanvas`, `PFMath`, `PFColor`, `PFNoise`, and the OSC sidechannel are in place. Roughly ordered by value-per-effort.

### D. NVS preset save / restore (per pattern)
*Which* pattern was running now survives a reboot, but its knob values do not — patterns integrate `knobDeltas` into their own namespace statics and nothing can read those back out generically. Doing this properly means each pattern saving its own values on change (debounced) and loading them in `setup()`. The brightness and pattern slots already prove the NVS plumbing; the absolute param bus (`PFParams`) is the one existing path that could carry values in the other direction, for `absoluteReady` patterns.

### E. Merge `patternflow_stream` into the main firmware
`patternflow_stream/` is a separate sketch that receives pixels over WebSocket. With the new `ContentMode` shape it could be a third mode (`CONTENT_STREAM`) inside the main sketch, so one firmware build serves patterns, video, and live streaming. Larger change; worth it once a use case actually wants both.

## License

MIT - see root `LICENSE-MIT` file.
