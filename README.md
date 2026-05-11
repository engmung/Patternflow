# Patternflow

[![Open Source Hardware](https://img.shields.io/badge/Open_Source-Hardware-blue?style=flat-square&logo=opensourceinitiative)](https://github.com/engmung/PatternFlow)
[![License: MIT](https://img.shields.io/badge/Code-MIT-green?style=flat-square)](./LICENSE-MIT)
[![License: CC BY-SA 4.0](https://img.shields.io/badge/Hardware-CC_BY--SA_4.0-orange?style=flat-square)](./LICENSE-CC-BY-SA)
[![Release](https://img.shields.io/badge/Release-v2.0.0-purple?style=flat-square)](../../releases)

> ⚠️ **Photosensitivity Warning**
> Patternflow displays rapidly changing light patterns that may trigger seizures in people with photosensitive epilepsy. Viewer discretion is advised. If you experience any discomfort, stop use immediately.

An LED synthesizer. Play light patterns with your fingertips.
An open-source reinterpretation of Nam June Paik's *Participation TV* (1963).

Build it from the files, or wait for the kit.

## What is this?

Patternflow is an open-source hardware instrument: four rotary encoders controlling generative light patterns on a 128×64 LED matrix, powered by ESP32-S3.

**Long-press encoder 4 to switch between patterns** — all bundled in a single firmware image, no reflashing needed.

<p align="center">
  <img src="./docs/media/demo_part1_v2.webp" height="500" />
  <img src="./docs/media/demo_part2.webp" height="500" />
</p>


> **v2.0.0 is live.** Cold-boot fix, runtime pattern switching, browser flasher, Live Editor, journal, build map, and AI-assisted custom patterns.

## Make your own patterns — no firmware build required

Patternflow ships with a prompt template designed for AI coding assistants (Claude, ChatGPT, etc.). To make a new pattern:

1. Copy the template from [`firmware/CUSTOM_PATTERNS.md`](firmware/CUSTOM_PATTERNS.md).
2. Paste it into your AI assistant along with a description of the look you want.
3. Save the output as a new `pattern_*.h` file in the firmware folder.
4. Flash via the browser flasher at [patternflow.work](https://patternflow.work).

No GLSL, no rendering pipeline knowledge needed. The template handles the encoder mapping, brightness curve, and HUB75 buffer interface; you describe the visuals.

## Patterns

PatternFlow OS v2.0.0 includes:

- **Origin** — concentric sine waves sampled by an emergent grid
- **Wave Saw** — rotated sawtooth waves with fractal noise distortion

## Why open source?

Everything about Patternflow began with **Origin**.

Two posts on r/arduino brought Patternflow to 150K combined views and 3.5K upvotes.

Hundreds of comments asked when it would be available, where to find the files, and how to build their own. **The community was not asking for a product. They were asking for the files.**

- [First r/arduino post](https://www.reddit.com/r/arduino/comments/1so9er5/)
- [Second r/arduino post](https://www.reddit.com/r/arduino/comments/1szettd/)

So Patternflow was opened — schematics, firmware, case, build guide, all of it in this repository. Hardware designs under CC-BY-SA 4.0; firmware and web code under MIT.

Patternflow is a reinterpretation of Nam June Paik's *Participation TV* (1963). Paik brought participation into art. Open-sourcing the design is an attempt to carry that gesture further, from participation into creation — not a finished object but a starting point. Build it, modify it, fork it, share it.

For the full story — failed prints, broken potentiometers, two weeks of debugging a strapping pin, the first PCB — see **[the 30-day journal](https://patternflow.work/journal/v1-30-days?lang=en)**.

## Links

- [patternflow.work](https://patternflow.work) — browser flasher, Live Editor, journal, build map
- [Releases](../../releases) — stable bundles
- [Discord](https://discord.gg/Vr9QtsxeTk) — questions, builds, custom patterns

## Repository structure

- `firmware/` — Arduino code for ESP32-S3, plus the custom pattern template
- `hardware/` — case (3D models + Blender source) and PCB (KiCad, Gerber, schematic PDF)
- `web/` — Next.js site (landing, browser flasher, Live Editor, journal)
- `docs/` — build guide, media, license summary

## Documentation

- [Build Guide](docs/BUILD.md)
- [Custom Patterns](firmware/CUSTOM_PATTERNS.md)
- [Changelog](CHANGELOG.md)
- [License Summary](docs/LICENSE-SUMMARY.md)

## Migrating from v1

If you already built a v1 unit, it still works as-is. v2.0.0's only PCB-side change is a 10kΩ pullup on GPIO0 that resolves the v1 cold-boot issue (pressing RESET on power-up was the v1 workaround). If your v1 boots reliably — especially likely with a genuine Espressif module — you don't need to change anything. To bodge the fix onto a v1 board, see [Issue #16](https://github.com/engmung/PatternFlow/issues/16).

Firmware v2 is backward compatible with v1 hardware. Flash freely.

## Contributing

PRs and issues welcome. The `.agents/` folder contains the project context, conventions, and skills that any AI coding assistant (Claude Code, Cursor, etc.) will pick up automatically when you fork the repo — so contributions stay consistent without you having to learn the codebase from scratch first.

## License

- Firmware & web — **MIT** ([LICENSE-MIT](./LICENSE-MIT))
- Hardware & designs — **CC-BY-SA 4.0** ([LICENSE-CC-BY-SA](./LICENSE-CC-BY-SA))

"Patternflow" is a trademark of SeungHun Lee.

The Patternflow series: LED Synthesizer (2026) · Origin (2026)
