# Changelog

All notable changes to Patternflow will be documented in this file.

## [Unreleased]

### Added
- **[LED panel compatibility guide](docs/panel-compatibility.md)** ([#258](https://github.com/engmung/Patternflow/pull/258), [#259](https://github.com/engmung/Patternflow/issues/259)): a panel matching our spec line for line can still stay completely black, because HUB75E is a connector and not a protocol — the driver ICs decide. The catch is that the driver IC is essentially never in the listing (we audited our own: it appears in the title, spec table, marketplace AI summary and attached PDF manual zero times), so the guide leads with what actually works — reading buyer reviews for anyone running it off an ESP32 — then asking the seller, with the chip taxonomy kept as reference for a panel already in hand. Includes a verified-panel table with photos, how to tell the LED driver from the buffer and the row driver on a board, and a symptom→cause table. Opened up by **[@SimonePDA](https://github.com/SimonePDA)**, who hit the failure and researched it properly.
- **`PANEL_PROFILE` covers all six library drivers** instead of two — `PANEL_STANDARD`, `PANEL_HIGHREFRESH`, `PANEL_FM6124`, `PANEL_ICN2038S`, `PANEL_MBI5124`, `PANEL_DP3246`. Existing values keep their numbers and the default is unchanged.

### Changed
- **Encoder acceleration removed — one detent, one step** ([#262](https://github.com/engmung/Patternflow/pull/262)). A fast spin used to multiply each detent ×2 to ×5. Compared against a linear build with a temporary per-knob tuning page (four curves live at once) and linear won outright — the multiplier was worst on the parameter that most needs landing on a value, since Origin's Mode knob picks a discrete preset and a quick turn skipped five at a time. OSC deltas had already been routed around it for that reason, which was the tell.
- **Knob travel now derives from the parameter's range.** It was a fixed per-knob constant that never looked at min/max — so a 0..1 knob crossed in one turn while a 0..100 knob needed a hundred, and the step handed to the C++ conversion inherited the same blind spot (which is why ~80 of ~120 step constants in the preset library are the identical `0.05f`). Travel is now `(max - min)` per two turns, so every knob crosses its range in the same motion whatever it drives. **Existing presets keep their compiled-in constants** — this lands on patterns generated from here on.

### Fixed
- **Encoder decoder resynced onto bounced states** ([#262](https://github.com/engmung/Patternflow/pull/262)). The quadrature ISR updated its reference state on transitions that cannot physically happen, so a bounced jump moved the decoder to the wrong phase and the following clean edges read as a missed detent or a step in the wrong direction. Illegal transitions are now discarded, plus a `ENC_BOUNCE_US` time filter — the A/B lines have no RC filter and only the ESP32's weak internal pull-ups, so the decoder has to do that work itself.
- **`ENCODER_CLICKS_PER_TURN` was 20; the reference encoder has 24.** It sat next to a comment promising one web rotation equals one physical turn, so the preview it claimed to mirror was 20 % out of step. The BOM part is a Bourns PEC11R-4220F-S0024 — the `S0024` suffix means 24 detents, confirmed across five distributors. Sourcing a different encoder? Generic EC11s ship as 20, 24 or 30, and this constant has to match what is actually in the build.
- **Panel-profile guidance was backwards.** `config.h` advised setting `PANEL_HIGHREFRESH` for an FM6126A/FM6124 panel — which would send anyone holding the reference panel to change a setting they don't need, since its `FM6124EJ` runs on `PANEL_STANDARD` with no init at all. The rule is now empirical: stay on the default unless the panel comes up completely dark. It also advised "swap to FM6124 if dark/distorted"; `FM6124`, `FM6126A` and `ICN2038S` all dispatch to the same `fm6124init()` with no per-chip branch, so that swap does nothing.
- **"Walk away if the listing mentions a receiving card"** would have rejected our own verified panel — that sentence is factory boilerplate in every LED module manual. The red flag is now scoped to the listing, not the PDF.
- Brightness is **K1** long-press, not K2 (`README.md`).
- Removed the Pattern/Video content mode from the docs — it was deleted from the firmware, but `firmware/README.md`, `docs/osc-spec.md` and the OSC address tables still described it. `/patternflow/content/toggle` is now documented as an accepted no-op.
- `firmware/README.md` long-press reference rewritten against the code: the K2 screen is NETWORK (not "OSC info"), its toggles are knob **rotation** not clicks, and K3 long-press is the KNOB MAP screen.
- `CUSTOM_PATTERNS.md` file tree updated to the `presets/` layout; `firmware/patternflow/README.md` no longer describes the removed hand-edited `custom1..3` slots or enumerate a preset list that had fallen thirteen behind.
- v2 build guide realigned to the current firmware: **USB CDC On Boot enabled**, browser flashing on the left/native USB port and Arduino IDE on the right. One image serves every board generation, and the site can't ship a per-version build.
- Panel mounting screws are **6–12**, not 6 (v2) or 12 (v3) — all 12 holes is the exact fit, 6 holds it firmly.
- The v2 BOM said the panel's ribbon and power cable are "both used as-is" while §6.2 tells you to cut the power cable.

## [3.2.0] - 2026-07

Patterns stop needing a firmware build. **Hardware unchanged** — v3.0 board and case carry over as-is.

### Added
- **Loadable pattern modules (`.pfm`)** ([#232](https://github.com/engmung/Patternflow/issues/232), [#242](https://github.com/engmung/Patternflow/pull/242)): a pattern compiles to a relocatable Xtensa ELF of a few KB, is sent to the device over Wi-Fi, and appears in the list immediately — no reflash, no reboot, no 1 MB image for a 6 KB pattern. Design and the working proof of concept came from **Simone Majocchi ([@SimonePDA](https://github.com/SimonePDA))**: a frozen C ABI between host and module, a linker script collapsing each module to four sections, and an on-device relocator. Switching patterns costs 6–11 ms; up to **128** modules can be installed, and installing costs nothing at runtime.
- **Module cart**: collect patterns across the community — from a card's own button or the pattern page — and build the lot in one request. "Send over Wi-Fi" points the device's pattern manager at the result and it fetches and installs every file itself.
- **Pattern manager on the device** (`/patterns`): install, list, multi-select delete, and format the pattern partition, with a per-file queue showing progress, retries and per-file results. Console navigation now spans every device page.
- **Pattern Lab: a staged hardware flow.** `To hardware` converts the composition to a `.h` first — one prompt for a single layer, a deterministic scaffold with a prompt per layer for a stack — then offers what a header makes possible: install it as a module, build a full image, or publish it to the community with the header attached so the pattern lands hardware-ready.
- **Recent works in Pattern Lab**: opening someone else's pattern replaces the canvas instead of stacking its layers onto yours, and what was in progress is parked in a ring of three.
- **Pattern Lab rebuilt as a layered, dockable editor platform.** The single-pattern lab is now a workspace for compositions:
  - **Layer stack** — code-pattern layers and pixel-art layers composite bottom-to-top, each with visibility, opacity, and a blend mode (normal / add / multiply / screen). Layers select, rename, duplicate, reorder (drag), and report their runtime errors in place.
  - **Layer masks** — any layer can flip from painting to masking the layer directly below it, binary on purpose (one compare per pixel on the ESP32): a pixel-art mask reveals wherever something is drawn, a code mask reveals where its ramp-colored output crosses 0.5 luminance — so the color ramp is the mask control. Invertible, stackable (masks intersect), and replicated 1:1 in flattened exports.
  - **Per-layer color ramps with alpha** — the ramp is chained to its code layer (two stacked patterns keep their own palettes), and ramp stops carry an alpha value drawn over a checkerboard: a value field can fade to transparent and reveal the layers beneath ("Fade low" sets that up in one click). Recolor maps alpha by luminance too, so RGB patterns can become translucent layers. The default ramp is neutral black→white (Reset restores it), which maps a value field straight onto the mask threshold.
  - **Pixel panel** — draw straight onto the matrix: pencil/eraser/line/rect/ellipse/fill with brush sizes, eyedropper (alt-click anywhere), a magic eraser with tolerance for background removal (contiguous or whole-layer chroma cut), undo/redo, zoom with middle-drag panning, pixel grid, and a live onion backdrop of the other layers for alignment. A select tool lifts a boxed region to move it (drag or arrow keys) and rescale it nearest-neighbour — pixels stay crisp — before stamping it back down. Image import places in context: the other layers animate behind the preview while you drag the image into position and scale it (wheel or slider), with fit modes, nearest/smooth scaling and source-corner background removal — Apply stamps over the layer's existing pixels.
  - **Dockable panels** (dockview) — Preview, Layers, Code, Pixel, Gallery, Knobs, and Color Ramp move like Photoshop panels: drag tabs between groups, split, float. The arrangement persists to localStorage, with a Panels menu and one-click layout reset.
  - **Flattened exports** — publishing flattens the visible stack into one standalone JS pattern: each ramp baked as an RGBA lookup table, pixel art embedded as base64 with a small portable decoder, blend/opacity/mask compositing inlined. The community sandbox and fork lineage consume it unchanged.
  - **Compositions that survive sharing** — the published code also carries the FULL layer project as one `// @stack` comment line (deflate-compressed, size-guarded): the sandbox ignores it, but "Open in Pattern Lab" — or pasting the code — restores every layer, ramp, mask and pixel bitmap as an editable stack on top of whatever is in progress, with fork lineage intact.
  - **Firmware .h for layer stacks, the safe way** — a deterministic C++ scaffold generator plus per-layer AI translation. Pattern Lab emits finished code for everything mechanical (layer buffers, one shared knob accumulator, RGBA ramp LUTs byte-for-byte, pixel art as RLE data, mask tests, blend compositing — same math as the preview) with compiling no-op stubs in marked slots; each code layer gets its own small conversion prompt whose output is just one `namespace L<i>` block that the export wizard validates and swaps in. The model never sees the machine data it used to corrupt, and the two historic conversion bug classes — hand-rolled knob delta accumulation and reproduced color LUTs — are gone from the prompt entirely. The assembled header flows straight into the existing browser build + flash pipeline.
  - **One shared knob set** — the four knobs stay global, like the four physical encoders: every code layer reads the same input (per-layer knob targeting stays open as a future mode). `@knobs` lines retune the shared set on load; range digit-dragging and encoder push buttons carry over, and the previous draft migrates into a one-layer project on first open. Gallery cards can also stack a generated variant as a new layer.

### Fixed
- **The browser flasher was shipping firmware without the module loader.** It served the image built for 3.1.0, so anyone who flashed from the site got a board that could not receive a single pattern from the community. The stock image is now built from the release source and version-stamped per release.
- **A pattern named "Dynamic Moiré" could neither build nor load** — three separate faults, all from one non-ASCII character in a name: the toolchain scripts crashed printing it on a cp949 console, a loader guard tested names for printable ASCII and called anything else a relocation bug, and the panel's ASCII font drew it as mojibake. Names are UTF-8 everywhere now; only the panel folds them.
- **A pattern that fails to load says why.** `/api/status` reports `loadError` and the panel draws the reason, instead of a torn frame that reads as "the pattern is broken".
- **"Uploaded" means "verified"** — after writing a `.pfm` the device reopens it and checks it is structurally a module, which is what catches truncation. Bad files are deleted and reported rather than counted as success.
- **A never-used board can start.** The pattern partition ships unformatted; `/patterns` offers an explicit Format button exactly when the volume will not mount. Formatting is never automatic — an earlier auto-format wiped every installed module after a crash corrupted the FAT.

### Known issues
- **Repeated uploads can wedge the device**, and the way out is a power cycle. Seen while installing many modules in a row. Not diagnosed — `/update/status` now reports `lastError`, `received`/`expected` and an attempt counter, so the next occurrence can be read rather than guessed at.
- **A firmware upload from the browser occasionally aborts partway** ("Connection lost during upload", ~29 % in the observed case) and succeeds on a retry. Two candidate causes were tested on hardware and disproved: request contention (an upload completes normally with another client polling every 2 s) and the page's own status poll. Same instrumentation applies.
- **Opening a console page still pauses the running pattern.** A resident module holds ~7 KB of the ~15 KB internal heap, dropping the largest free block to ~3 KB, and lwIP cannot deliver a 16 KB page from there. Three fixes were tried and are recorded in `firmware/README.md`; an async server would not help, since it shares the same heap.
- **A module runs ~20 % slower** than the same source compiled into the firmware — the cost of the relocatable code model, not something a compiler flag reaches.

## [3.1.0] - 2026-07

A software, safety-guidance, and docs release — **hardware unchanged**: the v3.0 board and case carry over as-is (the Gerber keeps its `v3.0` name).

### Safety
- **USB-C power input withdrawn from service** ([#221](https://github.com/engmung/Patternflow/issues/221)): a USB-C-powered board ran fine for 20–30+ minutes, then smoked at a connector pin, destroying the receptacle and power path. Power through the `J4` screw terminal only and leave `USB1`/`R1`/`R2` unpopulated until the redesign passes. Guide §2, the assembly map, and the v3.0.0 release notes all carry the hold now.
- The USB-C solder-joint comparison photos returned to the guide (§5) — the safety reference stays visible while soldering, video or not.

### Added
- **Pattern Community** ([community.patternflow.work](https://community.patternflow.work/community)): a paged feed with hover-to-play live previews and scroll-wheel knob control, detail pages with in-place code editing and live knobs, publishing with recorded fork lineage, likes and sorting, comments, user profiles, and a Discussions text board ([#217](https://github.com/engmung/Patternflow/pull/217)). Patterns shipping a hardware-verified `.h` are flagged and filterable; licence headers (CC-BY-SA, inbound = outbound) are baked into the shared source. Browse and edit without an account — username + password only to publish. A self-hosting deployment guide is included.
- **Browser firmware builds** ([#230](https://github.com/engmung/Patternflow/issues/230)): a build queue + worker compiles a complete firmware image containing your pattern (~30 s) and the browser flashes it over Web Serial — no IDE, no board package, no registry editing. OSC ships enabled by default ([#231](https://github.com/engmung/Patternflow/issues/231)).
- **Send over Wi-Fi** ([#232](https://github.com/engmung/Patternflow/issues/232)): finished builds hand off to the device's own update page — after the first USB flash (which also sets up Wi-Fi), new patterns go over the air.
- **Pattern frames, end to end**: a pattern declares the matrix it was composed for (`// @matrix`) and that single fact travels through Pattern Lab, the community sandbox, and the firmware conversion — portrait and custom resolutions render correctly everywhere, and Pattern Lab accepts any frame typed directly.
- **Pattern Lab**: in-app batch AI generation (bring-your-own Gemini key), session autosave to localStorage, and a mobile Copy prompt / Paste response action bar.
- **Interactive project roadmap** at [/roadmap](https://patternflow.work/roadmap): the whole project on one zoomable map, with a Korean toggle and a media/press lane.
- **Build map**: every pin gets its own link, collaboration credits, a photo lightbox, and a phone layout.
- **MakerWorld listing** for the case, with tuned print profiles; the same 4-plate Bambu Studio project ships in the repo as `hardware/case/patternflow_v3.3mf`. Linked from the build guide §4 and the case README.

### Changed
- **Landing pattern section rebuilt** around the current flow: a preset jump bar above the editor (42 presets, numbered), Pattern Lab promoted beside Community, the wired first-flash folded into the how-to steps with an accented Flash button, and Pattern Lab / Community vision cards replacing the outdated Arduino/Discord guide. The build section gained a cost & time reality check (~US$100 in parts · ~1 h hands-on · first-build friendly) and a spotlighted Build Guide v3.0.0 card with PCBWay / MakerWorld / release-bundle shortcuts.
- **Pattern Lab decluttered**: snapshots, sweep, the Experiment layer stack, Copy JSON, pause, and the Discord share flow removed; Share to Community and Build firmware remain. Mobile UI reworked across Pattern Lab and the community feed (full-width knob rows, dense static-thumbnail feed on phones).
- **Docs caught up with the product**: the main README (browser build server, Wi-Fi updates, 42 Live-Editor / 34 firmware preset counts, Pattern Lab & Community sections), the assembly map (v2/v3 distinction with release bundles, corrected power guidance), and the BUILD_GUIDE intro (no soldering experience needed; ~30 min soldering + ~30 min assembly).

### Fixed
- Community feed thumbnails rendered at the wrong frame size (a shadowed loop variable in the sandbox's still renderer) — non-default-frame patterns now preview correctly.
- Build service: `patternflow_secrets.h` is synced into the sketch directory on slot updates, and board build options are pinned so server builds match the IDE.

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
