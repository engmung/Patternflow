# Build Patternflow

Patternflow is not a single, rigid kit. It is a modular system divided into two core parts:

1. **Enclosure** — Choose how you house the device (3D printed, etc.).
2. **Electronics** — Choose how you wire the hardware (Custom PCB, etc.).

Once you build these two components, you simply flash the firmware to bring your Patternflow to life.

## Current Supported Path

| Enclosure | Electronics | Firmware | Status |
| --- | --- | --- | --- |
| [3D printed enclosure](enclosure/3d-print.md) | [Custom PCB, hand-soldered](electronics/pcb.md) | [Flash release firmware](firmware/flash-release.md) | Supported now |

This is the same path as the original build guide: PLA parts printed on a Bambu P1S or similar FDM printer, a hand-soldered Patternflow PCB, and the release firmware flashed from the browser.

## Build Combinations

| Enclosure | Electronics | Status |
| --- | --- | --- |
| 3D printed enclosure | Custom PCB | Supported now |
| Laser-cut enclosure | Custom PCB | Preparing |
| 3D printed enclosure | Breadboard / jumper-wire electronics | Preparing |
| Laser-cut enclosure | Breadboard / jumper-wire electronics | Preparing |

The preparing paths are meant to make Patternflow easier and cheaper to start. A breadboard build is not only a temporary prototype. If that form is enough for you, it is a valid Patternflow build. If you want a more polished object later, you can move to the PCB and enclosure paths.

The custom PCB path is stable. PCBA may become a later electronics path for people who want the same PCB with less hand assembly.

## Firmware Choices

- [Flash release firmware](firmware/flash-release.md) if you want the current official Patternflow OS with no toolchain setup.
- [Create custom patterns](firmware/custom-patterns.md) if you want to make your own pattern. Custom patterns require opening the firmware source in Arduino IDE, adding the pattern file, and compiling/uploading your own build.

## Legacy Guide

The full original walkthrough still lives at [docs/BUILD.md](../BUILD.md). It currently documents the supported PCB + 3D print path in detail.
