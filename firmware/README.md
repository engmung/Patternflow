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
│
├── core_display.h           # HUB75 driver init
├── core_encoders.h          # Encoder ISRs + InputFrame contract
├── core_osc.h               # OSC sidechannel (UDP send when PF_OSC_ENABLED)
├── osc_secrets.example.h    # Template for local Wi-Fi credentials
│
├── core_canvas.h            # 128×64 RGB888 framebuffer, single LED output point
├── core_math.h              # PFMath:: sin LUT, fastSin/Cos, fract, approxLength
├── core_color.h             # PFColor:: hsvToRgb, ColorStop, sampleRamp
├── core_noise.h             # PFNoise:: perlin2D, fractal2D
│
├── pattern_registry.h       # Function-pointer table — register patterns here
├── pattern_origin.h         # Built-in pattern: radial sine grids
├── pattern_wave_saw.h       # Built-in pattern: directional saw bands
├── pattern_vector_fluid.h   # Built-in pattern: symmetry folds warp
└── pattern_video.h          # Built-in: PFV1 video playback from FATFS
```

The `core_*.h` files are the foundation that patterns build on. They are stateless utilities — no global state to coordinate, safe to include from any pattern.

## Foundation modules

Patterns should not duplicate trig tables, color converters, or noise functions. The foundation modules provide them once, shared across every pattern.

### `core_canvas.h` — PFCanvas
The single point of contact with the LED driver. Patterns write pixels into the canvas; the canvas pushes the frame to the HUB75 panel.

```cpp
PFCanvas::setPixel(x, y, r, g, b);   // inside the pixel loop
PFCanvas::present();                  // last line of draw()
```

Patterns must not call `dma_display->drawPixelRGB888()` directly. Global brightness, gamma, and any future post-processing live in `present()` — patterns that bypass the canvas miss those.

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
- `Vector Fluid`

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

## Experimental OSC Output

Patternflow can send lightweight OSC control messages over Wi-Fi for performance setups such as Ableton Live Suite with Max for Live. This is meant for knobs, buttons, pattern status, and heartbeat messages, not for streaming rendered pixels.

OSC is disabled by default. To test it, copy `patternflow/osc_secrets.example.h` to `patternflow/osc_secrets.h` and edit the local copy:

```cpp
#define PF_OSC_ENABLED 1
#define PF_WIFI_SSID "your-wifi-name"
#define PF_WIFI_PASS "your-wifi-password"
#define PF_OSC_REMOTE_HOST "192.168.0.10"  // laptop IP
#define PF_OSC_REMOTE_PORT 9000
```

`osc_secrets.h` is ignored by git so local Wi-Fi credentials do not get committed.

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

## OTA Updates (For Developers)

The firmware includes `ArduinoOTA` for wireless updates.
1. Connect the ESP32 to Wi-Fi by setting `WIFI_SSID` and `WIFI_PASS` in the `.ino` file.
2. The device will expose itself on the network as `patternflow.local`.
3. In Arduino IDE, select the network port (e.g., `patternflow at 192.168...`) and upload.

*Note: Future production releases will migrate to `esp_https_ota` with a local Web UI for parameter control.*

## License

MIT - see root `LICENSE-MIT` file.
