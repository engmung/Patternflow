# Create Custom Patterns

Status: supported now.

Use this path when you want to run your own pattern on Patternflow hardware.

The important distinction:

- The browser flasher installs the official release firmware.
- Custom patterns require a local Arduino IDE build.

## Workflow

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
