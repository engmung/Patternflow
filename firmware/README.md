# Patternflow Firmware

Arduino-based firmware for the ESP32-S3 powering Patternflow v1.0.

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

## Project layout

- `patternflow_v1/patternflow_v1.ino` - Main sketch for v1.0 hardware
- `patternflow_v1/pattern_registry.h` - Central pattern registry
- `patternflow_v1/pattern_*.h` - Individual generative patterns
- `patternflow_v1/config.h` - Hardware configuration (pin mappings, display resolution, limits)
- `examples/` - Minimal templates for adding new patterns

## Patterns

Current registered patterns:
- `Origin`
- `Wave1_Saw`
- `Vector Fluid`

To add a new pattern, create a `pattern_new_name.h` file with the standard namespace interface:
- `NAME`
- `KNOB_LABELS`
- `setup()`
- `update(float dt, const InputFrame& input)`
- `draw()`

Then register it once in `patternflow_v1/pattern_registry.h` by adding the include and one `PATTERN_ENTRY(NewPatternNamespace)` line.

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

## OTA Updates (For Developers)

The firmware includes `ArduinoOTA` for wireless updates.
1. Connect the ESP32 to Wi-Fi by setting `WIFI_SSID` and `WIFI_PASS` in the `.ino` file.
2. The device will expose itself on the network as `patternflow.local`.
3. In Arduino IDE, select the network port (e.g., `patternflow at 192.168...`) and upload.

*Note: Future production releases will migrate to `esp_https_ota` with a local Web UI for parameter control.*

## License

MIT - see root `LICENSE-MIT` file.
