# Patternflow — AI Agent Context

This file provides persistent project context for AI coding agents (Antigravity, Cursor, Claude Code). It is loaded automatically at the start of every session.

## What this project is
Patternflow is an open-source hardware instrument: four rotary encoders controlling generative light patterns on a 128×64 LED matrix, powered by an ESP32-S3. It is an open-source reinterpretation of Nam June Paik's *Participation TV* (1963). The project is multi-domain, encompassing Arduino-based firmware, KiCad/Blender hardware designs, a Next.js web ecosystem, and comprehensive documentation.

## Repository map
- `docs/` — license summary, releasing guide, assembly map (`docs/assembly/`), manifesto, and media (build-guide images in `docs/build-guide/`). The main hardware build guide is `BUILD_GUIDE.md` at the repo root. `docs/ROADMAP.md` is a stub — the live roadmap is patternflow.work/journal and the `/roadmap` page.
- `firmware/` — Arduino code for the ESP32-S3. Main sketch folder: `firmware/patternflow/` with `patternflow.ino`, `config.h` (pin mappings, brightness, limits), `net_config.h` (Wi-Fi / OTA / OSC / audio-react config + defaults; per-device secrets in gitignored `patternflow_secrets.h`), and `pattern_registry.h` (function-pointer pattern table). Shared engine code lives in `firmware/patternflow/src/` (`core_display.h` HUB75 driver, `core_encoders.h`, canvas/color/math/noise helpers, Wi-Fi/OTA/OSC/audio modules). Curated patterns live in `firmware/patternflow/presets/` (`preset_origin.h`, `preset_wave_saw.h`, dated presets); user slots are `custom1.h`–`custom3.h` at the sketch root, each using its own pattern namespace. Also: `firmware/patternflow_stream/` (streaming variant), `firmware/encoder_test/`, `firmware/tools/` (PFV upload script), and `firmware/CUSTOM_PATTERNS.md` (pattern authoring guide).
- `hardware/` — Hardware designs. Contains `case/` (Blender source, STLs in `case/print-ready/`) and `pcb/` (KiCad 10.0 source, Gerbers, schematic PDF).
- `web/` — Next.js site at patternflow.work: landing page, Live Editor, browser flasher, journal, roadmap, and internal tools (`/pattern-lab`, `/video-baker`). Architecture doc: `web/ARCHITECTURE.md`. The JS presets in `web/src/lib/presets/` are the source of truth for firmware preset headers.
- `tools/` — desktop-side helpers, including the experimental audio-react browser extension (`tools/patternflow-audio-extension`).
- `.agents/` — AI harness configuration (skills, workflows, rules).

## Hard rules (do not violate)
1. Founders boards (#001–#005) are private. The KiCad project in `hardware/pcb/kicad/` is the public version with silkscreen reading "PATTERNFLOW v1.0". Never commit founders artifacts to this repo.
2. BOM in `BUILD_GUIDE.md` must always match the schematic in `hardware/pcb/schematic.pdf`. If you change one, check the other.
3. License split is strict: firmware and web code = MIT; hardware designs (PCB, case STLs, Blender source) = CC-BY-SA 4.0. Two separate license files at root: `LICENSE-MIT` and `LICENSE-CC-BY-SA`. Do not merge them.
4. Brand naming: body text = "Patternflow", physical engravings (PCB silkscreen, future case engravings) = "PATTERNFLOW", filenames = lowercase "patternflow". Never mix these in a single context.
5. Known PCB v1.0 issues and v2.0 design notes are documented in `BUILD_GUIDE.md` section 10. Reference that section instead of restating the issues.

## Common commands
- Web dev server: `npm run dev` (inside the `web/` directory)
- Web production build: `npm run build` (inside the `web/` directory)
- Firmware compilation: Open `firmware/patternflow/patternflow.ino` in Arduino IDE.
- KiCad exports: Export Gerbers from `hardware/pcb/kicad/patternflow.kicad_pcb`. Export STLs from `hardware/case/source/patternflow_v1.blend`.

## Versioning
- Project: v2.0.0 (current), using unified semantic versioning across firmware, hardware, web, and docs.
- Firmware source lives in `firmware/patternflow/`; use release tags for versioning instead of encoding the release in the folder name.
- Use semantic-style tags: `v1.0.0`, `v1.0.1`, etc.

## Documentation entry points
- New users: `README.md` → `BUILD_GUIDE.md`
- Contributors: this file → `.agents/rules/project-context.md`
- Version history: `CHANGELOG.md`
