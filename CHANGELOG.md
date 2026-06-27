# Changelog

All notable changes to Patternflow will be documented in this file.

## [2.0.0] - 2026-05

### Added
- **Custom pattern workflow.** New `firmware/CUSTOM_PATTERNS.md` with a prompt template and step-by-step guide for creating patterns using AI coding assistants. Drop in a new `pattern_*.h` file, register it, flash.
- **Web platform.** patternflow.work is now substantially complete: browser-based firmware flasher (Chrome/Edge), Live Editor, journal, and build map.
- **PCB R13** -- 10k pullup on GPIO0. Resolves the v1 cold-boot issue.
- **Silkscreen revisions** -- clear R/C designators, explicit encoder back-side marking.

### Changed
- **Unified versioning.** Project, firmware, PCB, and case are tracked as a single Patternflow version. v2.0.0 covers all of them.
- **Pattern naming canonicalized.** "Origin" and "Wave Saw" are the display names across firmware, web, and docs. Firmware filename `pattern_wave1.h` renamed to `pattern_wave_saw.h`.
- **Build guide reorganized.** Known Issues section split into "Fixed in v2.0," "Still open," and "Design notes."

### Fixed
- **Cold-boot unreliability** after extended power-off. Root cause: GPIO0 strapping pin floating. Full story: [Issue #16](https://github.com/engmung/Patternflow/issues/16). Credit to @idranoutof1d and u/Infrated on r/AskElectronics.

### Still open
- **Issue #4** -- LED matrix alignment bumps require manual trimming. Will be addressed when the LED diffuser variant ships.

### Deliberate non-changes
- **C11 (1000uF bulk cap)** retained despite USB inrush concerns. Patternflow is power-bank-powered, not desktop-USB-powered, and the cap improves boot transient stability.
- **Encoder direction** handled in firmware (sign inversion) rather than via PCB footprint re-spin. Transparent to users.

---

## [v1.1.0] - 2026-04 (Multi-pattern Update)

This update consolidates multiple patterns into a single firmware and introduces a runtime pattern selection mode.

### Firmware
- **Refactored Modular Architecture**: Patterns are now modularized (`pattern_*.h`) and registered in a central registry.
- **Unified Input Handling**: Introduced `InputFrame` to share normalized encoder and button states across patterns.
- **Pattern Selection Mode**: Long-press Encoder 4 (1 second) to enter/exit the pattern selection UI.
- **New Pattern**: Added `Wave1_Saw` (rotated sawtooth waves with fractal noise distortion).
- **Improved Performance**: Replaced macros with namespace-scoped constants and optimized LUT usage.

### Web
- **Consolidated Flasher**: The web flasher now provides a single "PatternFlow OS v1.1.0" image containing all patterns.
- **Simplified UI**: Removed individual pattern buttons in favor of the all-in-one OS build.

---

## [v1.0.0] - 2026-04 (initial public release)

The first publicly buildable version of Patternflow.

### Hardware
- 128x64 px HUB75 LED matrix (P2.5, 320x160 mm)
- ESP32-S3-WROOM-1 (N16R8 -- 16MB Flash, 8MB PSRAM)
- 4x EC11 rotary encoders with push-switches
- Custom PCB (KiCad) -- fabricated via PCBway sponsorship
- 3D-printed PLA case (white body, black knobs)
- Powered by user-supplied USB power bank, with internal mounting compartment

### Firmware
- Arduino-based firmware for ESP32-S3
- HUB75 DMA driver
- Default pattern set

### Documentation
- `docs/BUILD.md` -- full build guide with BOM and assembly walkthrough
- AliExpress affiliate sourcing links for all electronic components
- KiCad project files for PCB
- STL files for case (3 prints total)

### License
- Firmware & web: MIT
- Hardware & designs: CC-BY-SA 4.0
- "Patternflow" is a trademark of SeungHun Lee

### Known Issues
See [BUILD_GUIDE.md](BUILD_GUIDE.md) -- Known Issues section for full details.
- Reset button must be pressed once after power-up
- Rotary encoder direction reversed in PCB (compensated in firmware)
- Silkscreen ambiguity between 0805 caps and resistors
- LED matrix alignment bumps require trimming during assembly

### Acknowledgments
- **PCBway** -- for sponsoring v1.0 PCB fabrication
- **r/arduino community** -- 1.6k upvotes on the prototype thread that pushed this from "just a personal project" toward open source
- **Doyoon** -- for the suggestion that started the LED matrix direction
