# Patternflow

[![Open Source Hardware](https://img.shields.io/badge/Open_Source-Hardware-blue?style=flat-square&logo=opensourceinitiative)](https://github.com/engmung/PatternFlow)
[![License: MIT](https://img.shields.io/badge/Code-MIT-green?style=flat-square)](./LICENSE-MIT)
[![License: CC BY-SA 4.0](https://img.shields.io/badge/Hardware-CC_BY--SA_4.0-orange?style=flat-square)](./LICENSE-CC-BY-SA)
[![Release](https://img.shields.io/badge/Release-v2.0.0-purple?style=flat-square)](../../releases)

> **Photosensitivity Warning**  
> Patternflow displays rapidly changing light patterns that may trigger seizures in people with photosensitive epilepsy. Viewer discretion is advised. If you experience any discomfort, stop use immediately.

An LED synthesizer. Play light patterns with your fingertips.  
An open-source reinterpretation of Nam June Paik's *Participation TV* (1963).

Build it from the files, or wait for the kit.

## What is this?

Patternflow is an open-source hardware instrument: four rotary encoders controlling generative light patterns on a 128x64 LED matrix, powered by ESP32-S3.

**Long-press encoder 4 to switch between patterns** -- all bundled in a single firmware image, no reflashing needed.

<p align="center">
  <img src="./docs/media/demo_part1_v2.webp" height="500" />
  <img src="./docs/media/demo_part2.webp" height="500" />
</p>

**[See it in action on r/arduino](https://www.reddit.com/r/arduino/comments/1so9er5/)** -- 1.6k+ upvotes.

> **v2.0.0 is live.** PCB-level cold-boot fix (10k pullup on GPIO0), unified PatternFlow OS with runtime pattern selection, a substantially complete web platform (browser flasher, Live Editor, journal, build map), and an AI-assisted custom-pattern workflow.

## Make your own patterns -- no firmware build required

Patternflow ships with a prompt template designed for AI coding assistants (Claude, ChatGPT, etc.). To make a new pattern:

1. Copy the template from [`firmware/CUSTOM_PATTERNS.md`](firmware/CUSTOM_PATTERNS.md).
2. Paste it into your AI assistant along with a description of the look you want.
3. Save the output as a new `pattern_*.h` file in the firmware folder.
4. Flash via the browser flasher at [patternflow.work](https://patternflow.work).

No GLSL, no rendering pipeline knowledge needed. The template handles the encoder mapping, brightness curve, and HUB75 buffer interface; you describe the visuals.

## Links

- [patternflow.work](https://patternflow.work) -- browser flasher, Live Editor, journal, build map
- [Patternflow in 30 days](https://patternflow.work/journal/v1-30-days?lang=en) -- build log from tangled wires to open source
- [Releases](../../releases) -- stable bundles (v2.0.0)
- [Discord](https://discord.gg/Vr9QtsxeTk) -- questions, builds, custom patterns

## Repository structure

- `firmware/` -- Arduino code for ESP32-S3, plus the custom pattern template
- `hardware/` -- case (3D models + Blender source) and PCB (KiCad, Gerber, schematic PDF)
- `web/` -- Next.js site (landing, browser flasher, Live Editor, journal)
- `docs/` -- build guide, media, license summary

## Patterns

PatternFlow OS v2.0.0 includes:

- **Origin** -- concentric sine waves sampled by an emergent grid
- **Wave Saw** -- rotated sawtooth waves with fractal noise distortion

Switch between patterns by long-pressing encoder 4 (1 second). Add your own via [the custom pattern workflow](firmware/CUSTOM_PATTERNS.md).

## Documentation

- **[Build Guide](docs/BUILD.md)** -- full assembly instructions
- **[Custom Patterns](firmware/CUSTOM_PATTERNS.md)** -- make your own with AI assistance
- **[Changelog](CHANGELOG.md)** -- version history
- **[License Summary](docs/LICENSE-SUMMARY.md)** -- what's MIT, what's CC-BY-SA

## Migrating from v1

If you already built a v1 unit, it still works as-is. v2.0.0's only PCB-side change is a 10k pullup on GPIO0 that resolves the v1 cold-boot issue (pressing RESET on power-up was the v1 workaround). If your v1 boots reliably -- especially likely with a genuine Espressif module -- you don't need to change anything. To bodge the fix onto a v1 board, see [Issue #16](https://github.com/engmung/PatternFlow/issues/16).

Firmware v2 is backward compatible with v1 hardware. Flash freely.

## AI-assisted development

This project uses Google Antigravity with version-controlled harness configuration in `.agents/`. The configuration is compatible with Cursor and Claude Code via the standard `AGENTS.md` format.

If you fork or contribute, your AI coding agent will pick up the same project context, conventions, and skills automatically. The harness is part of the open-source release -- it codifies how to work on Patternflow, not just what Patternflow is.

See `.agents/rules/project-context.md` for full project context.

## License

- Firmware & web -- **MIT** ([LICENSE-MIT](./LICENSE-MIT))
- Hardware & designs -- **CC-BY-SA 4.0** ([LICENSE-CC-BY-SA](./LICENSE-CC-BY-SA))

"Patternflow" is a trademark of SeungHun Lee.

The Patternflow series: LED Synthesizer (2026) - Origin (2026)
