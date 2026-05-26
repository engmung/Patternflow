# Patternflow

[![Open Source Hardware](https://img.shields.io/badge/Open_Source-Hardware-blue?style=flat-square&logo=opensourceinitiative)](https://github.com/engmung/PatternFlow)
[![License: MIT](https://img.shields.io/badge/Code-MIT-green?style=flat-square)](./LICENSE-MIT)
[![License: CC BY-SA 4.0](https://img.shields.io/badge/Hardware-CC_BY--SA_4.0-orange?style=flat-square)](./LICENSE-CC-BY-SA)
[![Release](https://img.shields.io/badge/Release-v2.0.0-purple?style=flat-square)](../../releases)

> ⚠️ **Photosensitivity Warning**
> Patternflow displays rapidly changing light patterns that may trigger seizures in people with photosensitive epilepsy. Viewer discretion is advised. If you experience any discomfort, stop use immediately.

## Patternflow is an open-source LED synthesizer played with the fingertips.

Turning four physical knobs reshapes patterns from creative coding on an LED matrix in real time. The light is no longer a visual effect to be watched but a multisensory experience connected directly to the motion of the hand.

<p align="center">
  <img src="./docs/media/demo_part1_v2.webp" height="500" />
  <img src="./docs/media/demo_part2.webp" height="500" />
</p>

## At its core, this work is about **making things easy and sharing them.**

Audiences do not stop at appreciating a finished piece. Through the publicly released hardware files, firmware, 3D models, web preview, and AI prompts, anyone can build their own Patternflow, generate their own patterns, test them in the browser, and upload them to the device.

## Patternflow returns to Nam June Paik's *Participation TV* in the technological conditions of the present.

Where *Participation TV* showed that the audience could intervene in an electronic image, Patternflow proposes the step that comes after participation. The audience can move from operating the work to making, modifying, and sharing it as creators.

## **Patternflow** is therefore not a single luminous object.

It is a living system in which a physical experience extends outward into open-source making and community creation.

---

Build it from the files, or wait for the kit.

👉 **Ready to build?** Follow the **[Current Full Build Guide (docs/BUILD.md)](docs/BUILD.md)** to assemble your own Patternflow from scratch! You can also explore the modular **[Assembly Map (docs/assembly/README.md)](docs/assembly/README.md)** for alternative enclosure and electronics paths.

> **v2.0.0 is live.** Cold-boot fix, runtime pattern switching, browser flasher, Live Editor, journal, build map, and AI-assisted custom patterns.

## Make your own patterns

Patternflow ships with a prompt template designed for AI coding assistants (Claude, ChatGPT, etc.). To make a new pattern:

1. Go to the **Live Editor** in the **Pattern** section on [patternflow.work](https://patternflow.work) and click **Copy creation prompt**.
2. Paste it into your AI assistant (Claude, ChatGPT, etc.) along with a description of the look you want.
3. Copy the generated JavaScript code, paste it into the **Live Editor**, and turn the virtual knobs in the web preview to test the pattern.
4. Once you are happy with the visuals, click **Copy C++ prompt** in the editor and send it to your AI assistant.
5. Save the C++ output as a new `pattern_*.h` file in the `firmware/patternflow/` folder.
6. Register the namespace in `pattern_registry.h`.
7. Open `firmware/patternflow/patternflow.ino` in Arduino IDE and upload your custom build.

No GLSL or rendering pipeline knowledge needed. The template handles the encoder mapping, brightness curve, and HUB75 buffer interface; you describe the visuals.

Custom patterns require a local Arduino IDE compile/upload step for now.

## Patterns

PatternFlow OS v2.0.0 ships with two base patterns:

- **Origin** — concentric sine waves sampled by an emergent grid
- **Wave Saw** — rotated sawtooth waves with fractal noise distortion

**Long-press encoder 4 to switch between patterns on the device** — all bundled in a single firmware image, no reflashing needed.

Ongoing pattern studies are posted on [Instagram](https://www.instagram.com/patternflow.work). Every pattern shown there is mirrored on the [Discord](https://discord.gg/Vr9QtsxeTk) patterns channel with full JavaScript source, hardware-tested C++ header, and the design notes behind it — join Discord to grab a pattern from any post you liked.

## Why open source?

Everything about Patternflow began with **Origin**.

Two posts on r/arduino brought Patternflow to 150K combined views and 3.5K upvotes.

Hundreds of comments asked when it would be available, where to find the files, and how to build their own. **The community was not asking for a product. They were asking for the files.**

- [First r/arduino post](https://www.reddit.com/r/arduino/comments/1so9er5/)
- [Second r/arduino post](https://www.reddit.com/r/arduino/comments/1szettd/)

So Patternflow was opened — schematics, firmware, case, build guide, all of it in this repository. Hardware designs under CC-BY-SA 4.0; firmware and web code under MIT.

For the full story — failed prints, broken potentiometers, two weeks of debugging a strapping pin, the first PCB — see **[the 30-day journal](https://patternflow.work/journal/v1-30-days?lang=en)**.

## Links

- [patternflow.work](https://patternflow.work) — browser flasher, Live Editor, journal, build map
- [Releases](../../releases) — stable bundles
- [Discord](https://discord.gg/Vr9QtsxeTk) — questions, builds, custom patterns

## How it's built

Patternflow is built around a standalone ESP32-S3 driving a HUB75 RGB LED matrix at low resolution — each pixel reads as a discrete point of light, with its own brightness and color. Four rotary encoders feed firmware written in Arduino-compatible C++ around a modular pattern architecture: each pattern is a self-contained module with its own setup, update, and draw routines, while the shared framework handles input, LED rendering, mode transitions, and color calibration. The PCB was designed by the artist; the enclosure is 3D-printed by default, with stainless steel, transparent acrylic, and laser-cut variations in progress.

## Repository structure

- `firmware/` — Arduino code for ESP32-S3, plus the custom pattern template
- `hardware/` — enclosure files and electronics source files (case, PCB, Gerbers, schematic PDF)
- `web/` — Next.js site (landing, browser flasher, Live Editor, journal)
- `docs/` — build paths, build guide, media, license summary

## Documentation

- [Assembly Map](docs/assembly/README.md)
- [Current Full Build Guide](docs/BUILD.md)
- [Custom Patterns](firmware/CUSTOM_PATTERNS.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [License Summary](docs/LICENSE-SUMMARY.md)

## Migrating from v1

If you already built a v1 unit, it still works as-is. v2.0.0's only PCB-side change is a 10kΩ pullup on GPIO0 that resolves the v1 cold-boot issue (pressing RESET on power-up was the v1 workaround). If your v1 boots reliably — especially likely with a genuine Espressif module — you don't need to change anything. To bodge the fix onto a v1 board, see [Issue #16](https://github.com/engmung/PatternFlow/issues/16).

Firmware v2 is backward compatible with v1 hardware. Flash freely.

## Contributing

Guidelines for contributing to the repository are currently under preparation. In the meantime, please refer to the [`CONTRIBUTING.md`](CONTRIBUTING.md) file for more information.

## License

- Firmware & web — **MIT** ([LICENSE-MIT](./LICENSE-MIT))
- Hardware & designs — **CC-BY-SA 4.0** ([LICENSE-CC-BY-SA](./LICENSE-CC-BY-SA))

"Patternflow" is a trademark of SeungHun Lee.

The Patternflow series: LED Synthesizer (2026) · Origin (2026)
