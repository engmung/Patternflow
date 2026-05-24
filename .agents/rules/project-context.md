# Patternflow: Project Context

This document provides deep project context for AI agents working on Patternflow.

## Project overview

Patternflow is a physical LED synthesizer designed to make generative light patterns accessible and tactile. It uses four rotary encoders to allow users to interact physically with digital algorithms displayed on a high-resolution LED matrix. Inspired by Nam June Paik's pioneering work in video art (*Participation TV*, 1963), the project bridges the gap between hardware tinkering, artistic expression, and open-source collaboration.

The system is fully open source. It is designed to support multiple build paths over time: the current 3D printed enclosure + hand-soldered PCB path, plus planned laser-cut enclosure and breadboard / jumper-wire electronics paths. The project is split into firmware, hardware, web, and documentation domains.

## Tech stack

- **Firmware:** Arduino Core for ESP32. Libraries: `ESP32-HUB75-MatrixPanel-DMA`, `Adafruit GFX`.
- **Microcontroller:** ESP32-S3-WROOM-1 (specifically the **N16R8** variant with 16MB Flash, 8MB PSRAM).
- **Hardware (PCB):** KiCad 10.0.
- **Hardware (Case):** Blender 5.1.1. Printed in PLA (Bambu P1S default profile).
- **Web:** Next.js (React), TypeScript, deployed on Vercel at `patternflow.work`.

## Architecture per domain

### Firmware
The firmware is built around the `ESP32-HUB75-MatrixPanel-DMA` library to drive the 128x64 HUB75 LED panel. 
- **Pin Mapping:** Defined centrally in `firmware/patternflow/config.h`. Uses specific I2S pins for DMA output.
- **Encoders:** Four EC11 encoders read via interrupt-based logic. 
- **Pattern System:** Patterns live in `firmware/patternflow/pattern_*.h` and are registered in `pattern_registry.h`. Each pattern exposes `NAME`, `KNOB_LABELS`, `setup()`, `update()`, and `draw()`.

### Hardware (PCB)
The board topologically sits behind the LED matrix, interfacing via a 2x8 HUB75 box header (`J1`).
- **Core:** ESP32-S3 module on female headers.
- **Inputs:** 4× EC11 rotary encoders mounted on the *back* of the PCB (shafts facing forward).
- **Power Structure:** +5V from a user-supplied power bank enters at `J2`, and is internally routed on the PCB to `J3` which outputs +5V to the LED matrix. A 1000µF bulk capacitor (`C11`) smooths the power delivery.

### Hardware (Case)
The current enclosure is modeled in Blender and sliced into print-ready plates located in `hardware/case/print-ready/`:
1. `01_plate_main.stl`: White PLA body and back panel.
2. `02_plate_dividers.stl`: White PLA internal dividers.
3. `03_plate_knobs_15mm.stl`: Black PLA knobs for recommended 15mm encoder shafts.
4. `03_plate_knobs.stl`: Black PLA knobs for older/alternate 20mm encoder shafts.

### Web
A Next.js application residing in `web/`. It serves the landing page, browser firmware flasher, Pattern Lab / Live Editor, Video Baker, journal, and build map.

### Build Documentation
Build entry points now live under `docs/build/`:
- `docs/build/README.md` is the build map.
- `docs/BUILD.md` remains the detailed guide for the current 3D print + official PCB path.
- `docs/build/firmware/flash-release.md` explains browser flashing.
- `docs/build/firmware/custom-patterns.md` explains the Arduino IDE path for custom patterns.

## License structure

The project maintains a strict dual-license approach to accommodate the differing legal landscapes of software and hardware:
- **MIT License:** Covers all firmware (`firmware/`) and web source code (`web/`). The legal text is at `LICENSE-MIT`.
- **CC-BY-SA 4.0:** Covers all hardware source files, including KiCad PCB designs and Blender/STL case files (`hardware/`). The legal text header is at `LICENSE-CC-BY-SA`.

## Known issues and design notes

For full details, reference `docs/BUILD.md` §10. Summary:
1. **Cold boot reliability:** fixed in v2.0 with a 10k GPIO0 pullup.
2. **SMD silkscreen ambiguity:** fixed in v2.0.
3. **LED matrix alignment bumps:** still open; current workaround is trimming during assembly.
4. **Encoder direction:** handled in firmware.
5. **Encoder shaft length:** New builds should use 15mm EC11 shafts. 20mm shafts still work with the matching legacy knob STL.

## Conventions

- **File naming:** Strictly lowercase with underscores (e.g., `patternflow.ino`, `01_plate_main.stl`).
- **Brand naming layers:**
  - Body text: "Patternflow"
  - Physical engravings: "PATTERNFLOW"
  - Filenames/URLs: "patternflow"
- **Commit messages:** Short, imperative, prefixed with domain. Examples: `hardware: add gerber for v1.0`, `docs: update BUILD with J3 wiring`, `firmware: fix hue bounds`.

## What this project is NOT

- This is **not** a Eurorack module (it is standalone and powered by USB).
- This is **not** a video synthesizer in the traditional analog sense.
- This is **not** an audio synthesizer in v1.0 (though audio reactivity/sound is on the roadmap).

