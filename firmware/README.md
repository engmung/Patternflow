# Patternflow Firmware

Arduino-based firmware for the ESP32-S3 powering Patternflow v2.0.0.

The firmware handles the ESP32-S3 DMA driver for the HUB75 LED matrix, reads four rotary encoders to control generative patterns, and supports Arduino OTA for wireless updates.

## Setup

### Required board package
- ESP32 by Espressif Systems (latest)

### Arduino IDE board settings
- **Board:** ESP32S3 Dev Module
- **PSRAM:** OPI PSRAM
- **Flash Size:** 16MB
- **Partition Scheme:** 16M Flash with PSRAM-aware partition
- **USB CDC On Boot:** Disabled
- **Upload Mode:** UART0 / Hardware CDC

### Required libraries
Install these via the Arduino Library Manager:
- `ESP32-HUB75-MatrixPanel-DMA` (for driving the matrix)
- `Adafruit GFX Library` (dependency)

The experimental OSC output uses the ESP32 Arduino core's built-in `WiFi` and `WiFiUdp` libraries, so it does not require an extra OSC library.

## Project layout

```
firmware/patternflow/
├── patternflow.ino          # Main sketch: input routing, mode dispatch
├── config.h                 # Hardware configuration (pin mappings, limits)
├── pattern_registry.h       # Function-pointer table — register patterns here
├── pattern_origin.h         # Built-in pattern: radial sine grids
├── pattern_wave_saw.h       # Built-in pattern: directional saw bands
├── pattern_video.h          # Built-in: PFV1 video playback from FATFS
├── pattern_dev1.h           # Development pattern slot
├── pattern_dev2.h           # Development pattern slot
├── pattern_dev3.h           # Development pattern slot
└── src/                     # Foundation — not shown in the Arduino IDE tab bar
    ├── core_display.h       # HUB75 driver init
    ├── core_encoders.h      # Encoder ISRs + InputFrame contract
    ├── core_canvas.h        # 128×64 RGB888 framebuffer + gamma, single LED output point
    ├── core_math.h          # PFMath:: sin LUT, fastSin/Cos, fract, approxLength
    ├── core_color.h         # PFColor:: hsvToRgb, ColorStop, sampleRamp
    ├── core_noise.h         # PFNoise:: perlin2D, fractal2D
    ├── core_osc.h           # OSC sidechannel (UDP send when PF_OSC_ENABLED)
    └── osc_secrets.example.h # Template for local Wi-Fi credentials
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

Patterns must not call `dma_display->drawPixelRGB888()` directly. Global brightness, gamma, and any future post-processing live in `present()` — patterns that bypass the canvas miss those.

`present()` applies a 256-entry gamma LUT (γ ≈ 2.4) before pushing pixels. HUB75 panels are PWM-driven, so a linear 0–255 range crushes dark values; gamma correction lifts the shadow end into visibility. Patterns write linear RGB; the panel receives gamma-corrected RGB. Built once at first call, ~256 bytes RAM.

### `core_math.h` — PFMath
```cpp
PFMath::buildSinLUT();                       // call from setup() — idempotent
PFMath::fastSin(angle);                      // ~5x faster than sinf in pixel loops
PFMath::fastCos(angle);
PFMath::fract(x);                            // x - floor(x)
PFMath::lerp(a, b, t);
PFMath::approxLength(x, y);                  // ~5% accurate sqrt(x*x + y*y)
```

The sin LUT is 1 KB and shared. Do not build your own.

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

## Patterns

Current registered patterns:
- `Origin`
- `Wave Saw`

To add a new pattern, start with [`CUSTOM_PATTERNS.md`](CUSTOM_PATTERNS.md), then create a `pattern_new_name.h` with the standard namespace interface:
- `NAME`
- `KNOB_LABELS`
- `setup()`
- `update(float dt, const InputFrame& input)`
- `draw()` — draws via `PFCanvas::setPixel(...)` and ends with `PFCanvas::present();`

Then register it once in `patternflow/pattern_registry.h` by adding the include and one `PATTERN_ENTRY(NewPatternNamespace)` line.

The Live Editor at [patternflow.work](https://patternflow.work) has a "Copy C++ prompt" button that bundles your JavaScript pattern with a conversion prompt — the prompt already teaches the LLM these foundation conventions, so the generated C++ should use `PFCanvas`/`PFMath`/`PFColor`/`PFNoise` without any extra instruction.

## Configuration (`config.h`)

All hardware-specific pins and limits are centralized in `config.h`.
- **Pin Mapping:** Adjust the `R1_PIN`, `ENC1_A` etc. if you are not using the official Patternflow PCB.
- **Hardware Settings:** `INVERT_ENCODER` can be toggled depending on whether you mounted your encoders on the front or back of the PCB. `DEFAULT_BRIGHTNESS` controls the initial matrix brightness.

## Controls

The four rotary encoders control pattern-specific parameters. Each pattern exposes its own labels through `KNOB_LABELS`.

For the original defaults:
- **Encoder 1:** Hue
- **Encoder 2:** Speed
- **Encoder 3:** Mode/Preset
- **Encoder 4:** Frequency

### Longpress actions
- **Encoder 1 longpress (≥1s)** — enter/exit global brightness mode. While active, K1 rotation adjusts panel brightness (5–255, ~5 per detent), the active pattern does not see K1 input, and a "BRIGHTNESS XX%" overlay shows the current level. Exits on a second longpress or after 5 seconds of idle. Value persists across reboots via NVS.
- **Encoder 2 longpress (≥1s)** — enter/exit the OSC info screen (full-screen status view: OSC on/off, Wi-Fi state, local IP, configured remote host/port). Inside the screen, **K2 short press** toggles OSC send/receive on or off — the toggle persists in NVS, so the device reboots into the same state. Wi-Fi stays connected; toggling OSC only enables/disables traffic. If the firmware was built with `PF_OSC_ENABLED 0` the screen still shows up but the toggle is inert ("REBUILD WITH PF_OSC_ENABLED=1"). Exits on a second longpress or after 8 seconds of idle.
- **Encoder 3 longpress (≥1s)** — toggle between Pattern and Video content modes.
- **Encoder 4 longpress (≥1s)** — enter/exit pattern SELECT mode (only available in Pattern content mode). In SELECT mode, K4 rotation cycles patterns; longpress again to confirm.

### Encoder acceleration
Knob deltas are scaled by how quickly the encoder is turning. Fast spins multiply each detent ×2 to ×5 so one encoder can sweep a wide range quickly; slow turns stay at ×1 for fine control. Pattern step constants do not need to change — the acceleration is applied once in `readInputFrame()` before patterns receive their deltas.

### Short press (per-pattern, opt-in)
There is no global short-press handler. Each pattern decides what `K1..K4 short press` does for itself, by reading `input.btnPressed[i]` inside its `update()`. The built-in patterns (`Origin`, `Wave Saw`) use short press to reset the corresponding parameter to its default. Patterns that do not handle `btnPressed` (currently `pattern_dev1/2/3.h` and `pattern_video.h`) simply ignore short presses.

When you generate a new pattern from the Live Editor, the conversion prompt does not force a particular short-press convention — if you want one, either ask for it in the prompt ("K1 short press resets hue") or add the line by hand in `update()`.

## Experimental OSC Output

Patternflow can send lightweight OSC control messages over Wi-Fi for performance setups such as Ableton Live Suite with Max for Live. This is meant for knobs, buttons, pattern status, and heartbeat messages, not for streaming rendered pixels.

OSC has two switches: **compile-time** (whether OSC code is linked into the firmware at all) and **runtime** (whether the linked-in code is currently sending/receiving). The K2 longpress info screen only controls the runtime switch — if the compile-time switch is off, the runtime toggle is inert.

### Compile-time: enable the build flag and provide Wi-Fi credentials
Copy `patternflow/src/osc_secrets.example.h` to `patternflow/src/osc_secrets.h` and edit the local copy:

```cpp
#define PF_OSC_ENABLED 1
#define PF_WIFI_SSID "your-wifi-name"
#define PF_WIFI_PASS "your-wifi-password"
#define PF_OSC_REMOTE_HOST "192.168.0.10"  // laptop IP
#define PF_OSC_REMOTE_PORT 9000
```

`src/osc_secrets.h` is ignored by git so local Wi-Fi credentials do not get committed.

Without an `src/osc_secrets.h` file, OSC stays off (the default `PF_OSC_ENABLED 0` in `config.h` applies) and the K2 info screen will show `OFF (compile-time)` — meaning no rebuild can turn it on except by providing the secrets file and reflashing.

### Runtime: toggle from the device (no rebuild)
Once compiled in, OSC can be flipped on/off from the device itself via the K2 longpress info screen — no Arduino IDE round-trip needed. See the "Controls → Longpress actions" section above. The runtime state is saved in NVS, so the device boots into whatever it was last set to.

Then put the laptop and Patternflow on the same Wi-Fi network. OSC is a sidechannel: when enabled, knob, button, and status messages are sent continuously in every content mode (Pattern or Video). It does not change what is drawn on the LED matrix. In Max for Live, receive UDP on the same port and route these OSC addresses:

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
```

In a Max patch, the receiving side is typically `udpreceive 9000` followed by `oscparse`, then route the address parts and map values to Live parameters with Max for Live devices such as `live.remote~`, `live.object`, or your own mapping patch.

### Receiving OSC (host → device)

The device also listens on `PF_OSC_LOCAL_PORT` (default 9001) so an external host can drive it back. Send any of these addresses from Ableton/Max:

```text
/patternflow/knob/N/delta      (int)   — virtual rotation on logical knob N (1..4)
/patternflow/pattern/index     (int)   — switch to pattern at this registry index
/patternflow/content/toggle    (—)     — toggle PATTERN ↔ VIDEO
```

Knob deltas are applied on top of any physical encoder motion in the same frame, at the raw 1×-per-detent rate (no acceleration). Useful for Ableton automation lanes that drive a pattern parameter from a Live track. Unknown addresses are ignored silently. Receive buffer is 256 bytes per packet.

## OTA Updates (For Developers)

The firmware includes `ArduinoOTA` for wireless updates.
1. Connect the ESP32 to Wi-Fi by setting `WIFI_SSID` and `WIFI_PASS` in the `.ino` file.
2. The device will expose itself on the network as `patternflow.local`.
3. In Arduino IDE, select the network port (e.g., `patternflow at 192.168...`) and upload.

*Note: Future production releases will migrate to `esp_https_ota` with a local Web UI for parameter control.*

## Possible next steps

Things that fit cleanly on top of the current foundation. Not promises — just a record of what becomes easy once `PFCanvas`, `PFMath`, `PFColor`, `PFNoise`, and the OSC sidechannel are in place. Roughly ordered by value-per-effort.

### D. NVS preset save / restore (per pattern)
Each pattern's last knob values are lost on reboot. Save them to NVS on change (debounced), load them in each pattern's `setup()`. Patterns wake up where they left off. The brightness slot already proves the NVS plumbing.

### E. Merge `patternflow_stream` into the main firmware
`patternflow_stream/` is a separate sketch that receives pixels over WebSocket. With the new `ContentMode` shape it could be a third mode (`CONTENT_STREAM`) inside the main sketch, so one firmware build serves patterns, video, and live streaming. Larger change; worth it once a use case actually wants both.

## License

MIT - see root `LICENSE-MIT` file.
