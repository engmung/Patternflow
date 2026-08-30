# Patternflow — AI Agent Context

This file provides persistent project context for AI coding agents (Antigravity, Cursor, Claude Code). It is loaded automatically at the start of every session.

## What this project is
Patternflow is an open-source hardware instrument: four rotary encoders controlling generative light patterns on a 128×64 LED matrix, powered by an ESP32-S3. It is an open-source reinterpretation of Nam June Paik's *Participation TV* (1963). The project is multi-domain, encompassing Arduino-based firmware, KiCad/Blender hardware designs, a Next.js web ecosystem, and comprehensive documentation.

## Repository map
- `docs/` — license summary, releasing guide, assembly map (`docs/assembly/`), manifesto, and media (build-guide images in `docs/build-guide/`). The main hardware build guide is `BUILD_GUIDE.md` at the repo root; the pattern workflow is `PATTERN_GUIDE.md`. The live roadmap is patternflow.work/journal and the `/roadmap` page.
- `firmware/` — Arduino code for the ESP32-S3. Main sketch folder: `firmware/patternflow/` with `patternflow.ino`, `config.h` (pin mappings, brightness, limits), `net_config.h` (Wi-Fi / OTA defaults, plus settings that TUNE a feature if the build has one — they never add it; per-device secrets in gitignored `patternflow_secrets.h`), and `pattern_registry.h` (function-pointer pattern table). Shared engine code lives in `firmware/patternflow/src/` (`core_display.h` HUB75 driver, `core_encoders.h`, canvas/color/math/noise helpers, Wi-Fi/OTA/web-console modules) — core only: OSC, audio, MQTT, weather and shows all moved out to `features/`. Curated patterns live in `firmware/patternflow/presets/` (`preset_origin.h`, `preset_wave_saw.h`, dated presets), each using its own pattern namespace; user patterns are `.pfm` modules uploaded to the device over Wi-Fi, built from `firmware/modules/` via `firmware/toolchain/build_module.py` (the old `custom1.h`–`custom3.h` root slots are gone). Features attach through `firmware/patternflow/features/` (named `addons/` until 2026-08-30; legacy spellings are shimmed for out-of-tree bundles — see docs/EDITIONS.md) — a directory and a descriptor of function pointers, with the core naming none of them (see its README). `firmware/bundles/` names firmwares built from the same tree: two files each, saying which features compile in and what the build calls itself; `firmware/bundles/build.sh` builds the default or a named one. Also: `firmware/patternflow_stream/` (streaming variant), `firmware/encoder_test/`, `firmware/tools/` (PFV upload script), and `firmware/CUSTOM_PATTERNS.md` (pattern authoring guide).
- `hardware/` — Hardware designs. Contains `case/` (Blender source, STL option folders in `case/`) and `pcb/` (KiCad 10.0 source, Gerbers, schematic PDF).
- `web/` — Next.js site at patternflow.work: landing page, Live Editor, browser flasher, journal, roadmap, and internal tools (`/pattern-lab`, `/video-baker`). Architecture doc: `web/ARCHITECTURE.md`. The JS presets in `web/src/lib/presets/` are the source of truth for firmware preset headers.
- `tools/` — desktop-side helpers, including the experimental audio-react browser extension (`tools/patternflow-audio-extension`).
- `integrations/` — host-software integrations, each with its own README. `integrations/ableton/` is the Max for Live bridge (knobs → Live parameters over OSC). `integrations/homeassistant/` is a Home Assistant custom component plus a Lovelace card; the card's source lives in `web/src/ha-card/` and is built by `web/scripts/build-ha-card.ts` into the component's `www/`, because it shares the knob-scale constants in `web/src/lib/patternflowControls.ts` and must not drift from them. Two wire protocols are specified as contracts and integrations are built against those files, not against the firmware source: `docs/osc-spec.md` (OSC over UDP — low-latency performance control) and `docs/rest-api.md` (the device HTTP API — state, patterns, sleep, Wi-Fi, firmware). `docs/rest-api.md` also has the table for choosing between HTTP, OSC and MQTT, and the rules that make the device's single-connection web server easy to knock over.
- `.agents/` — AI harness configuration (skills, workflows, rules).

## Hard rules (do not violate)
1. Founders boards (#001–#005) are private. The KiCad project in `hardware/pcb/kicad/` is the public version with silkscreen reading "PATTERNFLOW v1.0". Never commit founders artifacts to this repo.
2. BOM in `BUILD_GUIDE.md` must always match the schematic in `hardware/pcb/schematic.pdf`. If you change one, check the other.
3. License split is strict: firmware and web code = MIT; hardware designs (PCB, case STLs, Blender source) = CC-BY-SA 4.0. Two separate license files at root: `LICENSE-MIT` and `LICENSE-CC-BY-SA`. Do not merge them.
4. Brand naming: body text = "Patternflow", physical engravings (PCB silkscreen, future case engravings) = "PATTERNFLOW", filenames = lowercase "patternflow". Never mix these in a single context.
5. Known PCB v1.0 issues and v2.0 design notes are documented in `BUILD_GUIDE.md` section 10. Reference that section instead of restating the issues.
6. **The firmware core is not the place to put a feature.** `firmware/patternflow/patternflow.ino` and `firmware/patternflow/src/` are the device itself — panel, encoders, pattern loader, Wi-Fi, sleep, console — and every published firmware compiles them **unchanged**. They change for a bug or a real improvement to the device, and nothing else; a feature bends to fit the core, never the reverse. Features attach through the hooks in `firmware/patternflow/features/pf_feature.h`, and the core names none of them — no `#include`, no `#if PF_<FEATURE>_ENABLED`, not even a feature's name in a string on the screen. Before editing the core, ask whether the edit would still be correct on a build that does not contain the feature you are working on; if not, it belongs in `features/`. The full reasoning is [`docs/EDITIONS.md`](docs/EDITIONS.md), and the header comment of `patternflow.ino` lists the regressions this rule exists because of.

## Common commands
- Web dev server: `npm run dev` (inside the `web/` directory)
- Web production build: `npm run build` (inside the `web/` directory)
- Firmware compilation: `./firmware/bundles/build.sh` (PlatformIO, bundled toolchain — not the Arduino IDE). That builds the default: the device with no features. Named editions are `./firmware/bundles/build.sh audio` and `./firmware/bundles/build.sh performance`. `./firmware/bundles/build.sh all` builds every composition and scans each binary for per-feature marker strings, proving each image carries exactly its features — run it before pushing anything that touches firmware.
- **Changing anything in the firmware core means building all three** — `build.sh all` is that rule as one command. A hook change that compiles against the default is not tested; the default has no features to break. The boundary rule itself is enforced by `firmware/toolchain/check_boundaries.py` in CI: core referencing a feature namespace, including from `features/`, or branching on a feature flag fails the build.
- KiCad exports: Export Gerbers from `hardware/pcb/kicad/patternflow.kicad_pcb`. Export STLs from `hardware/case/source/patternflow_case.blend`.

## Versioning
- Project: v3.7.0 (current), using unified semantic versioning across firmware, hardware, web, and docs. Current hardware is the v3.0 board; v3.1 and v3.2 were firmware/web releases on unchanged hardware.
- Firmware source lives in `firmware/patternflow/`; use release tags for versioning instead of encoding the release in the folder name.
- Use semantic-style tags: `v1.0.0`, `v1.0.1`, etc.

## Documentation entry points
- New users: `README.md` → `BUILD_GUIDE.md`
- Contributors: this file → `.agents/rules/project-context.md`
- Version history: `CHANGELOG.md`
