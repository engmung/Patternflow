# Changelog

All notable changes to Patternflow will be documented in this file.

## [3.0.0] - 2026-07

### Added
- **v3.0 board promoted to the recommended revision** (`hardware/pcb/gerber/patternflow_v3.0_gerber.zip`). Fabricated, assembled, and verified ([#114](https://github.com/engmung/Patternflow/issues/114)): hybrid power input — USB-C (`USB1` + 5.1k CC pull-downs) or a back-side 2-pin screw terminal (`J4`) as the beginner bypass — all-through-hole, no SMD passives. **Not size-compatible with v2.x cases (and vice versa).**
- **Machine-readable BOM** (`hardware/bom/bom_v3.0.csv`): every part by manufacturer part number, per-unit quantities, assembly-critical notes. The LED panel remains an AliExpress link (its mounting-screw positions match the case).
- **Firmware preset library + PFMem.** Curated patterns now live in `firmware/patternflow/presets/` — thirteen new presets (the June–July daily batch) join the library, and the three custom slots ship with fresh patterns. New `src/core_mem.h` (**PFMem**) allocates framebuffer-sized pattern state PSRAM-first, so a fully loaded preset image can no longer boot-loop the device on DRAM pressure. The browser-flasher image carries all of it and self-reports 3.0.0.
- **v3 build guide** — now the main `BUILD_GUIDE.md`: [PCB soldering](https://youtu.be/NZCjMBCsDAc) and [assembly-to-first-power-on](https://youtu.be/J9C9bZgkNKs) each covered by a full video walkthrough, photo-documented print/case/wiring steps, netlist-derived pin reference. The v2 guide moved to `BUILD_GUIDE_v2.md` for existing v2.x builds.

### Changed
- **`hardware/case/` reorganized by printer bed size**: `bed_256mm/encloser.stl` (the standard print — body frame, back panels, and LED-panel mount in one STL, ~10 h) and `bed_330mm/` (one-piece snap-fit); knobs print separately from `knobs/` in black, required for every build. `bed_256mm/for_other_panels/` holds the community divided variant with an adjustable LED-panel mount ([#169](https://github.com/engmung/Patternflow/issues/169)-tested) for panels other than the BOM-linked one. All v2.x-board cases moved to `case/legacy_v2/`. The snap-fit design adds two wall-mount holes and recesses for the panel's alignment bumps — no more nipper trimming ([#19](https://github.com/engmung/Patternflow/issues/19)).
- **Browser-flasher firmware refreshed** to the latest build — one image, compatible with both v2.x and v3.0 boards. The `patternflow_v2_firmware.zip` release asset on v2.1.0 was updated to match.
- The defective `easyfit` plate variant was removed ([#154](https://github.com/engmung/Patternflow/issues/154)); it remains at the v2.1.0 tag.
- Encoder shaft guidance neutralized: 15mm and 20mm are functionally identical; the BOM reference part (Bourns PEC11R-4220F-S0024) is 20mm.

### Fixed
- C11 schematic value typo (`1000uF/1.6V` → `1000uF/16V`).
- `bed_256mm/encloser.stl` briefly carried the **v2.1** cut of the enclosure; it now holds the v3.0 cut. The v2.1 version — print & assembly verified — moved to `legacy_v2/encloser_v2.1.stl` and is the recommended v2 print (replacing both the untested `divided_v2.1.stl` and the glued plates as the default v2 path).

## [2.1.0] - 2026-07

The final consolidation release of the v2.x line before v3.0. Everything a v2.x builder needs — the v2.1 board, the case options, the current firmware and web tools — is pinned here.

### Hardware — PCB

- **v2.1 Gerbers are the recommended board** (`hardware/pcb/gerber/patternflow_v2.1_gerber.zip`). Over v2.0: reworked ESP32↔J1 (HUB75) routing and silkscreen fixes (clearer C15/R10 reference positions). The build guide pins PCB orders to v2.1.
- **v3.0 test board** lives in `hardware/pcb/gerber/experiment/` — hybrid power input (USB-C plus a 2-pin screw terminal bypass for beginners), all-through-hole, DRC clean. **Unverified — do not order** ([#114](https://github.com/engmung/Patternflow/issues/114)). This absorbs the earlier v2.2 USB-C experiment.
- Schematic component placement tidied to mirror the physical board layout.

### Hardware — Case

- **One-piece snap-fit enclosure** (`print-ready/variants/oneshot_v2_1/2.stl`) promoted to a supported print option ([#113](https://github.com/engmung/Patternflow/issues/113)): single-piece body plus snap-fit closing part, no gluing. Needs a ~330 mm bed (H2S-class). Includes a wall-mount hanger hole; stable print confirmed.
- **`easyfit` main plate variant** with alignment tabs along the bond seam — ⚠️ current STL is missing the LED matrix divider slot; do not print as-is ([#154](https://github.com/engmung/Patternflow/issues/154)).
- **Divided snap-fit experiments** (`print-ready/experiment/`): the one-piece design split to fit 256 mm (P1S-class) beds, including the latest `v2.1_divided.stl`. Modeled but **not print-tested yet**.
- `oneshot_v3-wip/` quarantined — for the upcoming v3.0 board only, not compatible with v2.x.
- USB-C adapter clearance fixed after the encoder position change.
- STLs are stored as regular git files (not LFS) so GitHub's *Download ZIP* works; the Blender source stays in LFS and is attached to releases.
- v1 Blender/SVG source for the original laser-cut acrylic case added for reference.

### Firmware

- **Foundation refactor.** Patterns render through `PFCanvas` instead of touching the HUB75 driver directly; shared `core_math` / `core_color` / `core_noise` libraries; foundation modules moved into `src/`.
- **Color and refresh quality**: gamma LUT applied in `PFCanvas::present()`, per-channel white balance and saturation boost, panel refresh raised to ~240 Hz to eliminate phone-camera flicker bands.
- **Controls**: encoder acceleration; K1 long-press global brightness mode; K2 long-press OSC info screen and runtime toggle (persisted in NVS); K3 knob-map screen; K1/K2 logical mapping fixed; encoder direction corrected for Bourns PEC11R parts.
- **Two-way OSC as a sidechannel** (no longer a content mode): accepts knob, pattern, and content commands; `/patternflow/ping` full-announce for late-starting hosts; `/patternflow/version` sent with `hello`; remote host auto-learned from the last valid sender (`PF_OSC_REMOTE_HOST` now optional); up to 8 datagrams drained per frame; numeric args accepted as int or float.
- **Wireless workflows**: ArduinoOTA flashing (with Arduino IDE 2.x workaround documented) and Improv-Serial Wi-Fi provisioning from the browser flasher.
- **Live pattern preview** behind the SELECT screen.
- **Audio-react foundation**: WebSocket server routing browser audio analysis through virtual knobs (opt-in override).
- **Pattern system**: preset library plus reusable custom slots with a custom-first registry (Origin stays pattern 1); memory-for-math optimization toolkit (`fastPow`, LUTs, typed angle constants replacing Arduino macros).
- Video Baker `PFV1` playback support and a standalone rotary encoder test sketch.

### Web (patternflow.work)

- **Pattern Lab**: development harness with calibrated knobs and encoder buttons; in-app Gemini pattern generation (bring-your-own-key); color ramp + v-field mode with a gradient editor; Experiment tab — a layer-stack patch editor that compiles to pattern code, with knob bindings.
- **Video Baker** tool for baking patterns to `PFV1` video.
- **Live Editor**: hardened C++ conversion prompt (exact helper signatures, expensive-math decision table, pre-baked ramp LUTs, knob ranges and `@knobs` annotations carried through), collapsible preset library with shuffle, pattern sharing modal and links, source-aware Discord share.
- **Build globe**: community builds shown on an interactive globe inside the Inside viewer, with multi-link support per build.
- **Interactive project map** replacing the status page, including the project's origins (PCBWay sponsorship, Nam June Paik Art Center).
- **SEO / AI discoverability**: robots.txt, sitemap, JSON-LD, `llms.txt`.
- **Crowd Supply pre-launch funnel**: hero and mobile floating CTAs link to the campaign page.
- CI via GitHub Actions: web build, lint as a hard gate, Discord notifications.

### Integrations

- **Ableton Live integration** (`integrations/ableton/`). A Max for Live bridge device maps the four hardware knobs to any Live parameters over OSC (relative encoder deltas, per-slot sweep sensitivity, mappings saved with the Live set), plus guides for M4L/OSC pitfalls and a filming-with-synced-sound workflow.
- **OSC spec** (`docs/osc-spec.md`): the wire protocol as a versioned contract for third-party integrations.

### Docs

- **Build guide moved to the repo root** as `BUILD_GUIDE.md`, with an all-through-hole BOM and PCB orders pinned to the v2.1 Gerbers.
- **Breadboard-only build guide** — the no-PCB path is now documented and surfaced as available.
- HUB75 driver-IC selection and panel compatibility guidance.
- Pattern licensing stated: CC-BY-SA-4.0, inbound=outbound.
- Issue form templates, a "Share your build" discussion form, and a development workflow section in CONTRIBUTING.

### Known issues

- `easyfit` main plate STL missing the divider slot ([#154](https://github.com/engmung/Patternflow/issues/154)).
- Divided (256 mm bed) snap-fit enclosure not yet print-tested.
- LED matrix alignment bumps still require manual trimming ([#19](https://github.com/engmung/Patternflow/issues/19)).

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
- **Issue #19** -- LED matrix alignment bumps require manual trimming. Will be addressed when the LED diffuser variant ships.

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
