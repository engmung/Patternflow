# Patternflow

[![Open Source Hardware](https://img.shields.io/badge/Open_Source-Hardware-blue?style=flat-square&logo=opensourceinitiative)](https://github.com/engmung/Patternflow)
[![License: MIT](https://img.shields.io/badge/Code-MIT-green?style=flat-square)](./LICENSE-MIT)
[![License: CC BY-SA 4.0](https://img.shields.io/badge/Hardware-CC_BY--SA_4.0-orange?style=flat-square)](./LICENSE-CC-BY-SA)
[![Release](https://img.shields.io/github/v/release/engmung/Patternflow?style=flat-square&color=purple&label=Release)](../../releases)
[![Crowd Supply](https://img.shields.io/badge/Crowd_Supply-Pre--launch-d4502b?style=flat-square)](https://www.crowdsupply.com/engmung/patternflow)

> ⚠️ **Photosensitivity Warning**
> Patternflow displays rapidly changing light patterns that may trigger seizures in people with photosensitive epilepsy. Viewer discretion is advised. If you experience any discomfort, stop use immediately.

<p align="center">
  <a href="https://youtu.be/BPMhTChY9vg">
    <img src="https://img.youtube.com/vi/OXt-yg_7qdk/maxresdefault.jpg" width="100%" alt="Patternflow demo video" />
  </a>
</p>
<p align="center">
  <a href="https://youtu.be/BPMhTChY9vg"><b>▶ Watch the demo on YouTube</b></a>
</p>

**Patternflow is an open-source LED synthesizer.** Play light patterns with your fingertips — four physical knobs reshape generative light on an LED matrix in real time. A pattern is just a small file, so **every Patternflow plays every pattern we make.**

### Four ways in

- 🔨 **Build it** — follow the **[Full Build Guide](BUILD_GUIDE.md)** (official PCB + 3D-printed enclosure), or go solder-free with the **[Breadboard Build Guide](https://patternflow.work/build/breadboard)** — no PCB, no soldering iron, same Patternflow. More paths in the **[Assembly Map](docs/assembly/README.md)**.
- 📦 **Get one ready-made** — Patternflow is in **[pre-launch on Crowd Supply](https://www.crowdsupply.com/engmung/patternflow)**. Subscribe to be notified the moment the campaign goes live.
- 🎛️ **Try it right now** — the **[Live Editor](https://patternflow.work/pattern)** runs a virtual Patternflow in your browser. Same knobs, same patterns, no hardware. Want the full studio? **[Pattern Lab](https://patternflow.work/pattern-lab)** adds batch AI generation, color ramps, and one-click firmware builds.
- 🌀 **Share what you make** — the **[Community](https://community.patternflow.work/community)** is where patterns get published, remixed and forked. Browse and edit anyone's pattern in the browser with no account; sign in only when you want to publish your own.

> **Moving fast.** [**v3.0.0 is out**](https://github.com/engmung/Patternflow/releases/tag/v3.0.0) — hybrid USB-C / screw-terminal power, zero SMD passives, a snap-fit enclosure with no more panel trimming, and a [video-first build guide](BUILD_GUIDE.md). On v2.x hardware? Everything you need stays bundled at [v2.1.0](https://github.com/engmung/Patternflow/releases/tag/v2.1.0). Follow the [changelog](CHANGELOG.md) and the [journal](https://patternflow.work/journal) for what's current.

## Quick facts

| | |
| :--- | :--- |
| **Display** | 128 × 64 HUB75 RGB LED matrix, P2.5 (320 × 160 mm) |
| **Brain** | ESP32-S3-WROOM-1 **N16R8** (16 MB flash, 8 MB PSRAM) — standalone, no sending card |
| **Input** | 4× EC11 rotary encoders with push-switch; long-press encoder 4 to switch patterns |
| **Power** | 5 V over USB from any power bank — about **4 h per 10,000 mAh** at max brightness (see [runtime](#power--runtime)) |
| **Size / weight** | 245 × 325 × 36 mm (9.6 × 12.8 × 1.4 in) · 933 g (2.06 lb) |
| **Firmware** | Arduino-compatible C++, modular pattern architecture, runtime switching (no reflash) |
| **Flashing** | Everything from the browser (Chrome/Edge) — stock firmware, and custom patterns compiled by the build server; after the first USB flash, new builds can go over Wi-Fi. Arduino IDE only for firmware development or other matrix resolutions |
| **Connectivity** | Wi-Fi — bidirectional OSC (Ableton/Max/TouchDesigner) and audio-react WebSocket · USB |
| **Build** | ~1 h hands-on (≈30 min soldering + ≈30 min assembly — first-build friendly) + ~10 h 3D printing · around US$100 in parts ([BOM](BUILD_GUIDE.md#1-bill-of-materials-bom)) |
| **License** | MIT (firmware & web code) · CC-BY-SA 4.0 (hardware, docs, bundled patterns) · community patterns are licensed by their authors ([summary](docs/LICENSE-SUMMARY.md)) |

### Power & runtime

Patternflow runs off any standard USB power bank that can supply a couple of amps at 5 V — no wall adapter needed, so it stays portable. In testing, a 40,000 mAh bank dropped about 13% over 2 hours at **full brightness**, which is roughly **15 hours on a full charge**, or about **4 hours per 10,000 mAh**:

| Power bank | Approx. runtime (max brightness) |
| :--- | :--- |
| 10,000 mAh | ~4 hours |
| 20,000 mAh | ~8 hours |
| 40,000 mAh | ~15 hours |

These are worst-case numbers measured with a bright pattern at maximum brightness. Most patterns draw less, and lowering the brightness (long-press encoder 2) extends runtime well beyond these figures.

## Patterns

The **[Live Editor](https://patternflow.work/pattern)** opens with a preset library of **42 patterns** — months of daily pattern-making, each loadable in one click and remixable right in the browser. The stock firmware, presets included, flashes to the device straight from the browser; your own remixes go into a custom slot (see below).

On the device, the firmware bundles **34 curated presets** plus **three reusable custom slots** for your own patterns — all in a single image, switchable without reflashing.

- It boots into **Origin** — concentric sine waves sampled by an emergent grid.
- **Long-press encoder 4** to cycle through the patterns on the device.

### Where patterns are shared

The **[Community](https://community.patternflow.work/community)** is the home for patterns people make. Open anyone's pattern, turn its knobs, edit the code and watch it change — all without an account. Take one into Pattern Lab to remix it and publishing it back records the fork, so you can see what grew out of what. Patterns that carry a hardware-tested `.h` header are marked, and you can filter for them when you want something to flash right now.

Signing in is username and password only, with email optional — it never routes through a service that might be blocked where you are.

New pattern studies also go up on [Instagram](https://www.instagram.com/patternflow.work) almost daily, and the [Discord](https://discord.gg/Vr9QtsxeTk) **patterns** channel remains a good place to hang around and talk about them. **Come for a pattern you saw on a post, stay to share your own.**

## Make your own patterns

Patternflow ships with prompt templates designed for AI coding assistants (Claude, ChatGPT, Gemini, etc.), and the whole journey from idea to hardware runs in the browser — no toolchain.

**Start in the [Live Editor](https://patternflow.work/pattern)** — the quick taste:

1. Click **Copy creation prompt** and paste it into your AI assistant along with a description of the look you want.
2. Paste the JavaScript it returns into the editor and turn the virtual knobs to test the pattern live.

**Go deeper in [Pattern Lab](https://patternflow.work/pattern-lab)** — the full studio, and where patterns become firmware:

- Generate variations **in batches**, in-app (bring your own free Gemini key) or via copy-paste prompts.
- Shape **color ramps**, retune knob ranges, and compose for **custom matrix sizes**.
- **Build firmware** — the build server compiles a complete firmware image with your pattern in it (about 30 seconds) and your browser writes it to the board over USB (desktop Chrome/Edge, Web Serial). Nothing to install: no IDE, no board package, no editing the pattern registry by hand. The first flash sets up Wi-Fi too, and from then on **Send over Wi-Fi** pushes new builds to the device without a cable.
- **Share to Community** — publish it; remixes and forks get recorded, so you can see what grew out of what. Community patterns marked `.h` skip conversion entirely and offer **Flash to my board** directly.

**From the Arduino IDE** — only needed for firmware feature development or targeting an LED matrix with a different resolution. Open `firmware/patternflow/patternflow.ino`, paste the C++ into `custom1.h` (or `custom2.h` / `custom3.h`) **as-is**, add the namespace from the bottom of the file to that slot's `PATTERN_ENTRY(...)` line in `pattern_registry.h`, and flash. See [`firmware/patternflow/README.md`](firmware/patternflow/README.md).

No GLSL or rendering pipeline knowledge needed. The template handles the encoder mapping, brightness curve, and HUB75 buffer interface; you describe the visuals.

Either way you are flashing a whole firmware image, so the custom slots are replaced — the preset library always comes along.

## The website

[patternflow.work](https://patternflow.work) is not a companion page — it's half the instrument. Everything below runs in the browser, no account, no install.

<p align="center">
  <img src="./docs/media/web-live-editor.png" width="49%" alt="Live Editor — a full Patternflow simulator in the browser" />
  <img src="./docs/media/web-build-map.png" width="49%" alt="Build map — a globe of Patternflows built around the world" />
</p>

**[Live Editor](https://patternflow.work/pattern)** — a full Patternflow simulator. You don't need the hardware to start: turn the virtual knobs and the on-screen device behaves exactly like the real one, down to the encoder detents. Browse the presets, copy the AI prompts, test your pattern live, and flash the stock firmware over USB — all from the same page.

**[Pattern Lab](https://patternflow.work/pattern-lab)** — the professional pattern studio: batch AI generation, color ramps, custom frames, knob-range tuning, ESP32 C++ conversion, and one-click firmware builds. This is where Patternflow's creation tools keep growing.

**[Community](https://community.patternflow.work/community)** — patterns published, remixed and forked, each fork recorded so you can see what grew out of what. It's growing toward a marketplace where creators can trade patterns and earn inside the Patternflow ecosystem.

**[Build map](https://patternflow.work/inside)** — a globe of Patternflows built around the world, and the goal is simple: cover it with pins. If you've made one — any material, any variation — share it in Discord and your build gets added to the map.

**[Journal](https://patternflow.work/journal)** — Patternflow is treated as art, so the whole process is documented transparently: the events, the emotions, and the thinking behind every step, written up at least once a week since the beginning. If you want to know why this project exists — and what it costs to keep it alive — start there.

## OSC & audio-react

**Bidirectional OSC.** Over Wi-Fi, Patternflow speaks OSC in both directions: knob turns, button presses, and pattern switches stream out to a remote host (Ableton Live, Max/MSP, TouchDesigner — anything that speaks OSC), and incoming OSC messages drive the device exactly like physical encoder motion. Play Patternflow as a controller for your set, let your set drive the light, or both at once. If you play MIDI instruments, this will feel like home. For Ableton Live Suite there's a ready-made Max for Live bridge in [`integrations/ableton`](integrations/ableton) — click Connect, map the four knobs to any Live parameters, done. The wire protocol is documented in [`docs/osc-spec.md`](docs/osc-spec.md).

**Audio-react.** Patternflow can also react to browser audio: the experimental Chrome/Edge extension in [`tools/patternflow-audio-extension`](tools/patternflow-audio-extension) captures the current tab's audio, analyzes four FFT bands, and sends lightweight WebSocket knob values to the device. The firmware converts those into virtual encoder motion, so every encoder-driven pattern responds — no audio code needed in the patterns themselves.

## How it's built

Patternflow is built around a standalone ESP32-S3 driving a HUB75 RGB LED matrix at low resolution — each pixel reads as a discrete point of light, with its own brightness and color. Four rotary encoders feed firmware written in Arduino-compatible C++ around a modular pattern architecture: each pattern is a self-contained module with its own setup, update, and draw routines, while the shared framework handles input, LED rendering, mode transitions, and color calibration. The PCB was designed by the artist; the enclosure is 3D-printed by default, with stainless steel, transparent acrylic, and laser-cut variations in progress.

## The idea

**Make it easy. Make it fun. Make it yours.** Interactive media art usually demands serious capital, custom engineering, and years of specialized skill — an entry fee paid long before anyone gets to participate in anything. Patternflow removes it: the hardware files, firmware, 3D models, browser editor, and AI prompts are all public, so anyone can build their own, make their own patterns, test them in the browser, and load them onto the device.

This is a contemporary reinterpretation of Nam June Paik's *Participation TV* (1963). Paik let the audience change the image; Patternflow lets you make it — and give it away. That is the step after participation: from intervening in a work to making, modifying, and sharing it.

So Patternflow is not a single luminous object. It is a living system in which a physical experience extends outward into open-source making and community creation. **We're not making art easier to watch. We're making it easier to make.** The longer version lives in the [manifesto](docs/manifesto.md) and the [journal](https://patternflow.work/journal).

## Repository & documentation

| Folder | Contents |
| :--- | :--- |
| `firmware/` | Arduino code for ESP32-S3, plus the custom pattern template |
| `hardware/` | Enclosure files and electronics source files (case, PCB, Gerbers, schematic PDF) |
| `web/` | Next.js site (landing, Live Editor, Pattern Lab, community, browser flasher & build server, journal) |
| `docs/` | Assembly map, build-guide media, manifesto, license summary |
| `tools/` | Desktop-side helpers, including the audio-react browser extension |
| `integrations/` | Host-software bridges — Ableton Live / Max for Live (OSC knob mapping) |

**Docs:** [Full Build Guide](BUILD_GUIDE.md) · [Assembly Map](docs/assembly/README.md) · [Custom Patterns](firmware/CUSTOM_PATTERNS.md) · [Changelog](CHANGELOG.md) · [License Summary](docs/LICENSE-SUMMARY.md)

**Links:** [patternflow.work](https://patternflow.work) · [Community](https://community.patternflow.work/community) · [Crowd Supply](https://www.crowdsupply.com/engmung/patternflow) · [Releases](../../releases) · [Discord](https://discord.gg/Vr9QtsxeTk) · [Instagram](https://www.instagram.com/patternflow.work)

## Contributing

Builds, documentation fixes, part sourcing tips, and custom patterns are all welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how contributions flow (including the inbound = outbound pattern licensing).

Patterns go to the **[Community](https://community.patternflow.work/community)**, builds and questions to **[Discussions](../../discussions)** or the **[Discord](https://discord.gg/Vr9QtsxeTk)** — whichever you can reach. Show a build in Discussions or Discord to get it pinned on the [build map](https://patternflow.work/inside).

## Story so far

| When | Milestone |
| :--- | :--- |
| **Jan 2026** | *Patternflow: Origin* — the first work as a new media artist, built around 3D-printed forms and the seed of what became Patternflow · visited the Nam June Paik Art Center |
| **Mar 2026** | The Origin pattern ran on a physical LED matrix with four knobs for the first time |
| **Apr 2026** | Instagram and the Arduino subreddit responded strongly — **150,000+ views and 3,700 upvotes** — and the community asked for the files, not a product, so Patternflow went open source · first PCB fabricated *(sponsored by PCBWay)* · website live |
| **May 2026** | Reached **100 GitHub stars** · the first collaborator joined · Crowd Supply agreement · Discord community growing |
| **Jun 2026** | [Crowd Supply pre-launch page](https://www.crowdsupply.com/engmung/patternflow) live, backed by countless refinements toward mass production · Instagram passed **1,000 followers** · first community-made pattern shared |
| **Jul 2026** | Refining the design for mass production · growing an active community · outreach and promotion |
| **Next** | Run the Crowd Supply campaign at the lowest sustainable price · send Patternflow further out into the world · collaborate with more artists · earn academic recognition |
| **2028** | Grow Patternflow into a self-sustaining community and ecosystem — then move on to the next project |

📖 Longer write-ups and the full story behind each step live on the **[journal](https://patternflow.work/journal)**.

### Sponsor

<a href="https://www.pcbway.com/"><img src="./docs/media/pcbway-logo.png" width="150" alt="PCBWay" /></a>

Patternflow's PCB fabrication and 3D-printed enclosure are sponsored by **[PCBWay](https://www.pcbway.com/)**. The first PCB came back clean and on-spec, ordering was straightforward, and the team has been genuinely responsive throughout — the support that made these milestones possible.

<img src="./web/public/journal/v1-30-days/first-pcb.jpg" width="160" alt="First Patternflow PCB fabricated by PCBWay" />

<sub><i>The first Patternflow PCB, fabricated by PCBWay.</i></sub>

## License

The SPDX header inside a file is the authority — folders are not license boundaries. Full breakdown in the **[License Summary](docs/LICENSE-SUMMARY.md)**.

- Firmware & web code — **MIT** ([LICENSE-MIT](./LICENSE-MIT))
- Hardware, designs & docs — **CC-BY-SA 4.0** ([LICENSE-CC-BY-SA](./LICENSE-CC-BY-SA))
- Bundled patterns (the presets shipped in the firmware and the editor) — **CC-BY-SA 4.0**, per-file SPDX headers.
- Patterns contributed *to the repository* — inbound = outbound: by sending a pattern as a PR, issue or Discord post you license it under CC-BY-SA 4.0, attribution kept in the code header (no CLA). See [CONTRIBUTING.md](CONTRIBUTING.md).
- Patterns published *to the Community* — **licensed by their author**, either **CC-BY-SA 4.0** (default) or **CC-BY-4.0**. Both permit commercial use with credit; CC-BY-SA additionally requires adaptations to stay under the same license. A fork can never be looser than what it came from, and carries a `Based on:` credit to the original author in its source.

"Patternflow" is a trademark of SeungHun Lee.

The Patternflow series: LED Synthesizer (2026) · Origin (2026)
