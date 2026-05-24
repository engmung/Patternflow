# Flash Release Firmware

Status: supported now.

Use this path when you want the official Patternflow OS release with the built-in patterns. No Arduino IDE or local build setup is required.

## Browser Flash

1. Visit [patternflow.work](https://patternflow.work) on a desktop browser.
2. Connect the ESP32-S3 to your computer with a USB-C data cable.
3. Do not insert the ESP32-S3 into the PCB yet.
4. Open the Pattern section and click **Flash Patternflow**.
5. Select the correct serial port and follow the on-screen steps.
6. When flashing is complete, disconnect the USB-C cable.
7. Insert the flashed ESP32-S3 module into the PCB sockets.

Browser flashing uses Web Serial and works on desktop Chrome or Edge. Firefox, Safari, and mobile browsers do not support this flow.

## What This Installs

The release firmware installs the official bundled patterns and modes for the current release. It does not include your local custom patterns.

If you created a custom pattern in the Live Editor, follow [Create Custom Patterns](custom-patterns.md) instead.
