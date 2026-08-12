# Create Custom Patterns

Status: supported now.

Use this path when you want to run your own pattern on Patternflow hardware.

Two routes:

- **From the browser** — the server compiles your pattern into a loadable module and it goes to the device over Wi-Fi. Nothing to install, no cable.
- **From the Arduino IDE** — a local build. Still the route for firmware development, config changes, or working offline.

## Workflow — from the browser

1. Open the Patternflow Live Editor at [patternflow.work](https://patternflow.work).
2. Make or tune a JavaScript pattern.
3. Click **Copy C++ prompt** and use an AI assistant to convert the pattern.
4. In **Pattern Lab**, press **To hardware**, paste the C++, and press **Apply to my Patternflow**. Takes about half a second.
5. Press **Send over Wi-Fi**. The pattern appears in the device's list immediately.

Needs the device powered on and on the same Wi-Fi as your computer. A community pattern already marked `.h` skips steps 2–4 and offers **Send to my Patternflow** directly.

## Workflow — from the Arduino IDE

1. Open the Patternflow Live Editor at [patternflow.work](https://patternflow.work).
2. Make or tune a JavaScript pattern.
3. Click **Copy C++ prompt** and use an AI assistant to convert the pattern.
4. Save the generated C++ as a new `pattern_*.h` file in `firmware/patternflow/`.
5. Register the pattern in `firmware/patternflow/pattern_registry.h`.
6. Open `firmware/patternflow/patternflow.ino` in Arduino IDE.
7. Select the ESP32-S3 board settings described in `firmware/README.md`.
8. Compile and upload the sketch to your ESP32-S3.

The full custom pattern guide is here:

[Open firmware/CUSTOM_PATTERNS.md](../../../firmware/CUSTOM_PATTERNS.md)

## Pattern Contributions

For now, custom patterns and official built-in patterns are separate. You can share patterns with the community, but only selected patterns will be bundled into official firmware releases.
