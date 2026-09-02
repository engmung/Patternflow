# Changelog

All notable changes to Patternflow will be documented in this file.

## [Unreleased]

### Added — Audio edition v0.5.0
- **The panel is a MIDI device.** A new `midi` feature (`features/midi/`) makes it an RTP-MIDI port over Wi-Fi — macOS/iOS natively, Windows through rtpMIDI. CC 20–23 pin the four knobs absolutely (the same controllers the Director's `.mid` export writes, so a Live clip made from a show now drives the panel), CC 24–27 turn them relatively, notes 60–63 are the buttons, Program Change picks the pattern; the encoders, buttons and pattern changes go back out the same way. `POST /api/midi?outDiv=N` sets how many detents make one outbound step (1–16, persisted) — one per detent was a lot of parameter per wrist in the first Live session. Contract: `docs/midi-spec.md`. Costs ~6 KB of internal RAM on the audio edition. A `tools/rtpmidi-probe/` script exercises the whole map from a PC with no MIDI driver.
- **A Bluetooth Wi-Fi-setup feature, in the tree but in no edition.** `features/ble/` speaks Improv-BLE (the flasher's Improv-Serial RPC on a GATT service) and its lifecycle works on hardware: advertise only while the panel cannot join, take credentials after a touch on the panel, join, then stop the stack and return the controller's memory. It is not composed anywhere: linking it costs ~12 KB of internal RAM (libbt's IRAM code) and ~36 KB more while advertising, and the one phone it was tried with never listed the panel in Chrome's chooser. Left as an opt-in for whoever wants to finish it; the header records what was measured and the two traps below.
### Added — core
- **The panel answers to more names.** `http://patternflow/` over NetBIOS for Windows machines whose mDNS is broken or blocked, and a per-panel mDNS alias `patternflow-<4 hex of the MAC>.local` (`hostAlias` in `/api/status`) so two panels on one network stop fighting over one name. Both re-announced on every reconnect. And every link from the console to patternflow.work now carries `?device=<ip>`, which the site stores where its "Send over Wi-Fi" buttons look — so anyone who has opened the console once, by any route, gets uploads that never depend on `.local` resolving. The Android case, which no firmware can fix at the resolver, is fixed at the link.

### Notes
- Two traps found on the way, recorded in `features/ble/core_ble_improv.h`: the coexistence module aborts if Bluetooth starts while Wi-Fi power save is off (the core runs `WIFI_PS_NONE`), so modem sleep is switched on for the radio's lifetime; and NimBLE 2.x deletes callback objects it was handed, so they are heap-allocated.
- **Two guides** landed after the release: `AUDIO_GUIDE.md` (the extension, the mapping editor, building the on-board microphone, OSC, MIDI) and `FEATURE_GUIDE.md` (writing a feature or cutting an edition).
- **`shelf.sh` refuses an image that does not carry the version it is being published as** — Audio v0.4.0 had shipped still believing it was v0.3.1.
- **Pattern Lab's Graphic Export renders posters with a renderer of their own** — a print is not an LED panel, so the poster path stops pretending to be one.
- **Housekeeping (2026-09-03).** Removed the frozen `firmware/patternflow_stream/` sketch, `firmware/tools/` (a `.pfv` uploader for a Video pattern that no longer exists), retired toolchain scripts, the pre-`features/` agent skills under `.agents/`, dead web components, and every flasher image folder the manifest no longer serves (older images stay on their release tags). Documentation that still described the pre-editions tree — `firmware/README.md`'s layout, library list, OSC default and LED calibration values, `AGENTS.md`'s version and hard rules, `hardware/pcb/README.md`'s USB-C wording — was brought in line with the code.

## [3.8.0] - 2026-08-31

One instrument, three editions. The firmware split into **editions**: compositions of features over one unchanged core, installable in one click from [patternflow.work/variants](https://patternflow.work/variants) and switchable any time without losing patterns, networks or settings.

### Added
- **Editions.** `firmware/patternflow/features/<name>/` holds every feature behind one hook struct (`pf_feature.h`); the core names none of them. An edition is two files under `firmware/bundles/<name>/` — which features compile in, and what the build calls itself. Three ship: **Patternflow** (core: patterns, four knobs, and the most contiguous memory a pattern can get), **Patternflow Audio** (on-board PDM microphone, OSC, the browser and phone audio paths), **Patternflow Performance** (sequences, MQTT in every role, FlowLocal and the Director, weather — Simone Majocchi's work, running as a composition of this tree). The full reasoning is `docs/EDITIONS.md`.
- **The tree speaks the vocabulary EDITIONS defined.** `addons/` became `features/`, `PFAddon` became `PFFeature`; the old spellings are shimmed for out-of-tree bundles.
- **The boundary grows teeth.** `firmware/toolchain/check_boundaries.py` fails CI when the core references a feature namespace or branches on a feature flag — and caught its first violation on its first day. `check_abi_freeze.py` locks the module ABI; what the core promises modules is now written down under `firmware/patternflow/abi/`.
- **The default build stops claiming features it does not have.** The console's edition card, `/api/status` and the panel's info screens describe the firmware that is actually running.
- **A new board and the shelf install the same thing.** The browser flasher and the one-click edition install draw from one set of images, staged by `firmware/bundles/shelf.sh`.
- **The on-board microphone works in the actual device**, with a gain stage (Espressif's PDM path is quiet), auto-ranged bands over a measured noise gate, and bands that ride their own envelopes.
- **The mapping editor.** Bands are boxes drawn on the live spectrum; response curves — rise, fall, gate, steps, arch, hand-drawn — bake to 33-point tables the firmware only interpolates. Glide ballistics (attack and damping, set separately) and an in-editor preview that runs test signals through the chain. The device's `/audio-in` console page is assembled from the extension's editor, so the two cannot drift.
- **An Android capture app** (`tools/patternflow-audio-android`): what the phone plays drives the panel, with the mapping fetched from the device.

### Fixed
- **The input frame was never initialised**, and only the edition split made it show: a build without a feature that happened to zero it read garbage on the first frame.
- The console's old `/audio` page, which could never have worked against the port-80 server, is gone; `/audio-in` is the page.

### Changed
- `PF_IMPROV_FW_VERSION` is `3.8.0`; the Audio edition ships as v0.4.0 and Performance as v0.2.1, on their own version lines.

## [3.7.1] - 2026-08-28

The 3.7.0 seam shipped without the line that runs it.

### Fixed
- **Every addon's per-frame hook was dead.** `PFAddons::loop()` is not called anywhere in 3.7.0. The addon port moved the per-frame work out of the sketch — correctly, it belongs to the addons — removed the concrete calls that used to do it, and never added the dispatcher that replaced them. Two orphaned comments were left where the calls had been. So the show player never ticked, MQTT never pumped, weather never fetched, and the audio websocket never completed a handshake. **Nothing failed loudly:** `onNetwork` still ran, so routes registered and port 81 opened, TCP connected, and the console's audio page loaded and said DISCONNECTED forever. Every addon was present, initialised, and frozen. On-board audio was the exception — `audio_in` runs on a Core 0 task, not the loop hook — which is why this read as an audio problem rather than a seam one. Verified on hardware: a raw websocket handshake was an 8 s timeout before and `HTTP/1.1 101 Switching Protocols` in 121 ms after; `/api/shows`, `/api/weather` and `/api/mqtt` all answer again.
- **The audio page's file picker worked exactly once per load.** `createMediaElementSource()` can be called once per media element, ever; calling it for a second file throws, so the first track analysed and every one after it did nothing while still playing.
- **One empty FFT bin froze the audio meters for the session.** `getFloatFrequencyData` returns `-Infinity` for a bin with no energy, which makes the band average `-Infinity` and then NaN inside the smoother — and NaN is absorbing, so nothing recovered until a reload.
- **The connected-client count only ever went up.** It was kept by hand and a client whose TCP died without a close frame never produced the event that decremented it, so an idle panel reported one client connected. The websocket library already knows; it is asked now.

### Added
- **`/api/status` reports `audioRuntime` and `audioClients`.** Whether audio was switched on at all was invisible from outside the device: a browser could hold a socket open, send knob messages, and have every one dropped because the AUD row on the panel was off, with nothing anywhere saying so.

## [3.7.0] - 2026-08-27

The release where a firmware can have a name. Everything Patternflow does still ships on the board — MQTT, sequences, weather, OSC, audio, all of it — and now the same tree can also publish *named* firmwares for the things the default cannot carry: a microphone that needs four wires soldered on, a radio setting that must not be universal, a build somebody needs pinned so a show behaves the same at the next gig.

**Nothing left the core, and nothing is going to.** An earlier plan would have moved features out into separately-owned repositories; that was withdrawn before it happened, and the measurement that killed it is in the changelog below.

### Added
- **A named firmware is two files, and it never edits a core one.** `addons_local.h` says which addons a firmware has, in what order, and may drop or reorder the defaults; `overrides.h` reaches any `#ifndef`-guarded setting — transmit power, panel clock, the firmware's own name — because it is included before any default applies. Both are gitignored here and belong to whoever built the variant, which makes taking a core update a file copy rather than a merge, forever. Measured three ways: default 1,412,457 B, a sound-only build 1,133,925 B, `PF_ADDONS_NONE` 1,094,813 B.
- **A panel says which firmware it is running.** `/api/status` reports `variant` and `variantVersion`, and the console wears the variant's name as a badge next to the wordmark on every page, linking to its entry on the new [variants shelf](https://patternflow.work/variants). Core shows nothing — it is the default and a badge on every panel would say nothing. The core version is now labelled `core v` beside it, because unlabelled it read as the variant's and was wrong.
- **The update banner stays quiet on a variant.** The manifest here describes *core* releases; offering one to a panel running somebody else's firmware would talk a person into flashing away the thing they chose, on a version comparison that means nothing across two release lines.
- **`/api/status` reports knob positions, the parameter bus and transmit power.** Knob state used to be readable only through `GET /api/mqtt` — inside an addon — so a build without MQTT could be written to but not read, and an HTTP-only integration would have lost it the day MQTT moved out. `txDbm` joins it because a variant can now change the radio.
- **A shelf you can install from.** [patternflow.work/variants](https://patternflow.work/variants) lists core and every listed variant as a card, with one-click install for images served from here — the panel's own `/update` page does the fetching, the same trick the core updater already used. Hosted copies are checked against the maintainer's latest GitHub release and stand down when they have drifted.

### Changed
- **The split was withdrawn before it shipped.** Steps 1–4 of the RFC were right and they are in this release; step 5 — deleting features from the core — is cancelled. A build with three addons removed was measured beside the full one: the ceiling on loadable patterns is **identical** — 73,716 bytes either way — on a board using 45 % of its flash. Stripping all five moves it 18.4 KB, in a build with no shows, no MQTT, no weather, no OSC and no sound that nobody would ship; the largest pattern module anyone has built is 29 KB — the 42-pattern community library tops out at 17.5 KB — against a ceiling already two and a half times that. The case for a slim core rested on headroom that was never scarce. It would also have redefined a product already sold — the funded page lists MQTT and bidirectional OSC as things the device does — and, worse for the stated motive, a separate repository is precisely where trees drift apart. In this tree, widening `observeFrame` for OSC broke MQTT in the compiler a second later and was fixed in the same commit. Elsewhere it would have rotted in silence.
- **The formats are frozen.** The `.pfm` ABI and the `.pfs` show format do not move: fields are appended, never reordered, never reinterpreted; old files play forever; anything else takes a version byte and the old version keeps working. This was already the practice — it is a promise now, which is the guarantee a performer actually needs. Not "the firmware never changes", but "the files keep working".
- **OSC is an addon.** It stayed in the core on the grounds that it "needs no infrastructure", which does not survive being said out loud — a panel running a standalone AP transport needs none either. OSC is how a panel talks to Max, TouchDesigner and Ableton; it is sound integration and it belongs with the rest of it. Nothing is stranded: a build without it still updates, still runs every community pattern, and still takes remote control over HTTP.
- **The console pages are HTML files.** They lived inside `R"HTML(...)"` literals, which is the right way to ship them and the wrong way to work on them. `firmware/patternflow/console/*.html` plus a mock device on `localhost:8322` means save-and-refresh with devtools; a generator splices them back and CI checks the two stay in sync.

### Fixed
- **Remote pattern picks are remembered again, and show cues still are not.** An addon that *claims* the pattern owns the panel while it runs, so its choices are transient; one that only *asks* is relaying a person, and that should survive a reboot the way turning the knob does. The distinction existed and was simply not reported.
- **Three places a removed feature stayed visible**: a preset hardcoded from another addon's directory, so a firmware with no show player still carried its Black pattern; a pattern counter that counted entries it would never stop on, so a list with one hidden entry read "1 / 3" then "3 / 3"; and a status row reporting MQTT on builds without it. All the same shape — the build stopped carrying something and the interface never found out.
- **The home page ignored `caps`.** The nav learned about capabilities; the page body never did, so a stripped build still advertised four features it did not have. Rows now disappear with the features, groups left empty disappear with them, and what remains is renumbered.
- **Adding a Wi-Fi network could delete the one that was working.** `addNetwork` took its arguments by reference and the reconnect path passed the stored entry itself, so the shift loop overwrote it mid-call.
- Eight console pages carried an orphaned CSS block — the body of a deleted rule — costing a parse error and 492 bytes on every page.

## [3.6.3] - 2026-08-25

The performance release. It started as groundwork to meet **Simone Majocchi's ([@SimonePDA](https://github.com/SimonePDA)) performance-director work**, and ships as the whole thing: his on-device show player, scheduler and weather stack integrated onto this tree's core, a show-authoring Director inside Pattern Lab, and a show format that finally moves the way the curves were drawn. A pattern, its show, its firmware port and its published post now share **one name**, end to end.

### Added
- **The panel plays shows by itself.** Simone's performance-director firmware is integrated whole: `.pfs` show tables install from the new **Sequences** console page (`/show`), play on a wall-clock (cues fire by `millis()`, not by frame), chain into playlists with per-run variance, and follow a night/wake schedule with a dimmed clock face. His weather stack (`/weather`), his `MatrixLight6/8X` console fonts and his **FlowLocal** MQTT appliance mode (off by default, hard backoff, anti-brick guards kept) came along. The show buffers live in PSRAM, so a 256-cue show costs the pattern engine nothing it can feel.
- **A show pauses and resumes in place.** Pause banks the wall clock, resume re-bases it, so cues — and a v2 ease mid-ramp — continue exactly where they stopped, and the paused look stays on the panel (absolute holds are kept). The Sequences page carries the Pause/Resume button; `POST /api/shows/control` accepts `op=pause` / `op=resume`; status reports `paused`. Start with nothing ticked does the obvious thing too: it continues a paused show, or replays what is loaded, instead of scolding about checkboxes.
- **Pick which saved network the panel boots on.** Slot order is recency, which is wrong the moment a panel lives somewhere it was not last provisioned — every boot then fails on an absent network before the walk wraps around. `/wifi` grows a Boot network picker (stored in NVS, applied on the next boot) and a Reboot button. Ported from @SimonePDA's tree.
- **PFST v2 — the show file learned to glide.** Version byte 2 reinterprets cue time as **deciseconds** and adds one cue flag, EASE: *lerp the set channels toward each channel's next cue*. Byte layout unchanged, v1 files play exactly as before, and the player's cost was measured on the panel at **zero** — frame time is indistinguishable idle / v1 / v2 (15.7–16.0 ms), because the lerp is a pure function of the clock. A 60-second authored curve that took 61 staircase cues ships as 11 eased pieces within 0.8 % of the drawn bezier. The full proposal with the hardware table is [docs/pfst-v2-spec.md](docs/pfst-v2-spec.md).
- **Pattern Lab grew a Director panel** — show authoring where the pattern already lives. Four knob lanes plus a message lane; double-click drops a keyframe, segments hold or ease along **Blender-style bezier handles you grab and pull**. Keyframes sit on the v2 wire grid (0.1 s) — the **snap toggle** (1 s / 0.5 s / 0.2 s / 0.1 s) is an authoring aid, not a format limit — and playback drives the real knobs through the authored curves, so the live preview *is* the show. Export downloads the `.pfs` the panel plays; import round-trips a v2 file back into editable segments exactly. Publishing a pattern offers to attach the show on the community's performance rail.
- **The piece has a name, and everything answers to it.** A single name field sits center of the Pattern Lab header. To hardware pins the C++ `NAME` to it — and stamps it back onto a pasted translation when the AI "improves" it, which is not hypothetical: a show authored for `HexagonalHivePulse` once animated nothing because the model had quietly retitled the port `HexHivePulse`. The Director names the `.pfs` after it, **stamps it into the show's opening cue so the device switches to the right pattern the moment the show starts** (verified on hardware), and Share opens titled with it. Projects from before the field existed inherit the name they were already living under.
- **One console chrome.** Every device console page now loads a single `/pf-console.js` that owns the header band, the nav — and a **light theme**, one toggle on every page, remembered across all of them. Adding a console page to the nav is now one edit in one file, which is how `/show` stopped being a page half the console never linked to.
- **A pixel drawing copies out as pattern code** — the Pixel layer's *Copy as code* hands the drawing to whatever AI you use as an editable, commented pattern program, and the layer stays put. The C++ conversion prompt also honours the layer's **Recolor** toggle with pre-baked ramp LUTs.
- **Your own post reopens as itself.** Opening one of your published patterns in the lab now marks the session as *editing* that post — Share updates it in place, same page, same likes and forks — instead of publishing a fork of your own work. Detach with one click if you did want a new post.
- **A moderator can repair a broken `.h`** — and only the `.h`: the firmware port on a community pattern can be fixed in place when it will not compile, while the title, the JavaScript and the licence stay exactly the author's. A pattern with no port cannot grow one this way.
- **Pattern Lab grew a Capture panel** — the pattern as a picture or a clip, not only as a thing that goes on the panel: a PNG for a business-card background, an MP4/WebM loop for a post, at 1050 × 600 @ 300 dpi, Full HD, 4K, square, vertical, or any size up to 4096 px, turned 90°/180°/270° if the panel would hang that way, over black, a colour, or real transparency (unpainted areas clear, or dark-to-clear so it glows on white paper). Pause on the frame you want, step frame by frame, run it at ¼× to 4×. Clips render offline at a fixed 24/30/60 fps, so a frame that takes half a second to draw is still one frame in the file. All of it runs in the browser, in a Web Worker with its own engine — the live preview keeps its 60 fps while the stage grinds through 4K, and nothing is uploaded anywhere.
  The interesting part is **what "re-render at a bigger size" means for pattern code that was written for 128 × 64.** Most of it was: `cx = 64`, `Math.sin(x * 0.1)`, a `Float32Array(128 * 64)` — and run at 1024 px such a pattern comes back as four tiles, a small picture in a corner, or nothing, with no way to tell from the source which it will be. So the *Auto* look runs a probe first: the stack at its own matrix and at an aspect-true multiple, both box-filtered back to the matrix, compared on texture density and layout. Measured over all 46 bundled presets, the dozen that scale cleanly and the rest separate with no overlap. Those that scale are re-rendered for real; the others are upscaled as crisp pixel blocks at the requested size with the verdict spelled out, plus a **Copy any-size prompt** button that asks whatever AI you use to rewrite the pattern in frame-relative units — the same copy-paste loop as the C++ conversion. Paste the answer back and Auto re-checks it by itself.
- **Home Assistant integration** (`custom_components/patternflow/`) — a panel shows up as a device, discovered over mDNS, with an On/Sleep switch, a pattern picker, the four knobs, and the numbers worth watching. It also ships a **dashboard card**: the running pattern playing live with the four encoders laid over it as zones you drag — mouse or touch, unlike the community wall's card, which is wheel-only and therefore does nothing at all on a phone. Everything runs on the LAN over the device's own HTTP API. No cloud, no account, and **no broker for anything except turning a knob**.
  That exception is the whole shape of this. Knob *positions* are readable over plain HTTP — `/api/mqtt` reports them in any MQTT role and with no broker configured, because the firmware copies the input frame into that state before it checks the role. Knob *writes* have no HTTP path at all: `/api/knob` and `/remote` were built and removed as unused, so a write goes out over MQTT and only a **Subscriber** obeys it. Setup offers the role change when that is the only thing missing, and says what it costs — a Subscriber stops publishing its own knob turns. A refused write names which of the four ways it was refused rather than failing quietly.
  The card **never asks the panel for pixels**, which is not a shortcut but the design: a device-streamed frame preview was built, shipped and removed the same day because polling it captured the render loop until the device read as dead. So the preview is the pattern's own JavaScript running in a sandboxed iframe in your browser, driven by the values Home Assistant holds — exactly what `core_patterns_http.h` says a live preview should be if one ever came back. The card bundles the Basics pack's 33 patterns, matched to the modules on your device by slug; a community pattern or a preset shows the controls without a picture rather than an error, because a device stores compiled modules and no source. Installable **through HACS** as a custom repository: the component sits at `custom_components/patternflow/` in the repository root, because that path is hardcoded in HACS and nothing in `hacs.json` can point elsewhere. Its tests, lint config and scripts stay in `integrations/homeassistant/`. Each release carries a `patternflow-homeassistant.zip`, which is what HACS actually downloads, and the project version is stamped into the manifest on the way in.
- **The device's HTTP API has a written contract**, `docs/rest-api.md`, alongside `docs/osc-spec.md`. It documents what exists today and, more usefully, the rules that are invisible from an endpoint list and have each already cost a feature: the server takes **one connection** and pauses drawing while it answers, so automated clients keep to `/api/*`; and `POST /api/sleep` and `/api/patterns/select` report the state **before** the transition, because stopping a DMA engine does not belong inside an open response. Also written down: that there is no MAC, serial or unique id on any endpoint, so two panels need distinct `PF_OTA_HOSTNAME` values. (The third rule it originally recorded — console pages evicting the pattern for 25 s — died during this release; see *Changed*.)
- **Sleep mode** — the panel goes dark and the board idles without anything being unplugged. There is an **On / Sleep switch on the device console's home page**; you can also turn K1 on the NETWORK screen, publish to MQTT `​<prefix>/sleep`, or `POST /api/sleep`. Any knob turn or button press wakes it, as does an incoming firmware image. Waking gives the pattern straight back even when the open console was holding it paused. It stays **on the network** throughout, which is the whole design: `esp_deep_sleep` would take the draw to microamps and take the radio with it, and then "lights out from the sofa" has no way back. So the LEDs go off, the HUB75 DMA transfer stops (the driver ICs are otherwise clocked at 15 MHz whether or not anything is lit), Wi-Fi drops to modem sleep, the CPU to 80 MHz, and the loop yields instead of spinning. The device publishes `​<prefix>/sleep/state` on every change, so Home Assistant sees it — and obeys the command in **either** MQTT role, because a panel that publishes its knobs is still a panel you want to be able to switch off. `PF_SLEEP_STOP_DMA 0` in `config.h` is the fallback if a particular panel comes back garbled.
- **The selected pattern survives a power cut.** It used to start at Origin on every boot. It is saved as a **slug**, not an index, because installing or deleting a single `.pfm` renumbers the list and an index would come back as somebody else's pattern; the write is debounced so spinning K4 through fifty patterns is one NVS write rather than fifty. A remembered pattern that no longer exists — or no longer loads — falls back to Origin with a log line instead of greeting you with the PATTERN FAILED screen.
- **Performances live under patterns**, on the same social rails as firmware ports: anyone records a timed knob ride in the Director tool and publishes the Save-JSON on the pattern's page — live immediately, credited to the recorder, with the author's own recording (or their pin) deciding which one represents the pattern. Each recording downloads as the editable `.json` or the packed `.pfs` the panel's player reads.
- **Like from the wall.** Every pattern card grew a heart beside its add-to-deck button — the count updates in place, and signed-out visitors get the sign-in modal at the moment they click, same rule as everywhere else.
- **Packs carry performances.** A deck owner can attach a Director performance JSON to their deck; the pack zip then includes `performance.json` (the editable source) and the encoded `.pfs` show table. Today's firmware simply ignores the `.pfs` on install — the pack stays a normal pattern pack — and the performance firmware picks it up the day it ships. The server-side PFST encoder is byte-identical to the Director's own saves.
- **Absolute parameter bus (0..1000), prepared.** MQTT `​<prefix>/param/1..4` can pin any knob of an absolute-ready pattern to an exact value; physical encoder motion releases the hold, and plain deltas keep working exactly as before. Patterns opt in through one `PFParams::apply` line per knob — every preset, the Basics pack, and all convertible community headers are converted, and everything the site generates is absolute-ready from birth. `/mqtt` grew channel presets (Broadcast / Ch 1–4 / Live) with retained per-channel snapshots, and a **Director mode** that points the panel at a local authoring broker without disturbing the saved one.

### Changed
- **Opening a console page no longer pauses the pattern.** The 25-second eviction was the honest price of serving whole pages from the core-3 builds' ~15 KB of free DRAM; the core-2 builds freed ~96 KB, and the page sender now streams PROGMEM in small slices under a hard 5-second budget, tolerating socket stalls instead of holding the loop. `status.consolePaused` still exists and now means exactly one thing: a pattern-install batch is in progress. `docs/rest-api.md` is updated to match.
- **Module ABI descriptor is now 2** (the appended absolute-param fields). The loader accepts 1 and 2, so every existing `.pfm` keeps loading; **pre-absolute firmware refuses new modules cleanly** instead of misreading them. This was the gate that tied the release to the performance firmware — and this is the release that ships both.
- **MQTT retention now follows the show policy**: knob/pattern topics publish non-retained; the broadcast banner and channel snapshots are the retained exceptions.
- **Release builds pin `platform = espressif32@7.0.1`** so a machine with a different PlatformIO fork installed cannot silently resolve another core.

### Fixed
- **A show could not move the knobs of a pattern built by the site.** The module build targeted ABI 1 unless `PF_TARGET_ABI=2` was set, and at ABI 1 `pf_params.h` compiles the absolute tier *out* — so a converted pattern declaring `ABSOLUTE_READY = true` shipped unable to read the absolute bus. A Director show then set the parameters, the device held them (`paramActive` true, values sweeping), the pattern ignored them, and every layer reported success: the show ran and nothing moved. Builds now target ABI 2 by default, which the loader has accepted since v3.5.1 and the browser flasher has served ever since; `PF_TARGET_ABI=1` still builds for firmware older than that. Caught on the first show authored end to end in the lab, and folded into this release.
- **The reconnect path deleted the Wi-Fi network that had just worked.** `addNetwork` took its arguments by reference and the reconnect path passes a saved slot itself, so the shift loop overwrote the referenced string mid-move: joining the second saved network turned `[home, studio]` into `[home, home]` — the working network gone, the absent one duplicated, and the panel unreachable after the next reboot. It now copies before it shifts, and duplicate slots already written into NVS are healed on load.
- **The panel clock was documented as 15 MHz and it is 16, which is the wrong place to look for it.** `HZ_15M` is `16000000` and `HZ_10M` is `8000000` — identical to `HZ_8M`, so there is no step between 8 and 16 MHz at all. Both the `core_display.h` EMC warning and the firmware README repeated the enum's name instead of its value, which sends anyone hunting harmonics on a spectrum analyser to 15 MHz and its multiples rather than 16, and made "drop to `HZ_10M`" read as a small step when it halves the clock. Corrected in both, along with the trade the two settings actually make: `i2sspeed` and `min_refresh_rate` move together, and dropping the clock while leaving `min_refresh_rate` at 240 is the worst case — it forces the library's maximum colour-depth sacrifice to hold a refresh rate you were not keeping. The measured table for this panel is now in the README.
  This surfaced because **cartoonmonkeystudio (CE), on Discord**, found that the same clock was desensitising their unit's Wi-Fi — 83–95% packet loss on their board — and bisected it properly, down to a display-free sketch behaving normally on the same hardware. Reproduced here on a second board at much lower severity (no packet loss either way, but median latency 15 → 4 ms at 8 MHz), and **not adopted**: every `min_refresh_rate` that preserves colour depth bands on video at 8 MHz. Their patch also raises the Wi-Fi TX power, which cannot be taken — 13 dBm is a conformance setting, not a conservative default. The measurements, the parts that cannot ship, and what to try first if your unit's Wi-Fi is bad are written up in [docs/investigations/2026-08-the-panel-clock-and-the-wifi-radio.md](docs/investigations/2026-08-the-panel-clock-and-the-wifi-radio.md).
- **A board that has never been formatted let you try to install patterns anyway, and only said so eight failures later.** Pattern storage is a FAT volume nothing has ever written to on a new device, so it will not mount until somebody formats it once — deliberately, because an earlier revision formatted automatically on a failed mount and one crash mid-write turned that into "the next boot wipes your library". The prompt for that one deliberate act was a grey `Format storage` button sharing a row with `Retry failed` at the foot of the upload column, annotated in the smallest type on the page, and nothing stopped you dropping files past it — so the first thing a new panel did was refuse a whole batch, one `filesystem not mounted` at a time, which reads as "uploading is broken" rather than "press that". An unmountable volume now announces itself above both columns, with the button in the banner and the reason written out; the drop zone goes inert and says why when clicked, instead of accepting work that cannot land; and a `/patterns?src=…` install link from the community is **held rather than spent** — the page waits for the volume to be usable and then runs the install by itself, so arriving from a pattern page on a fresh board is still one click. The format warning is written for the state it actually appears in, too: the device cannot list what is on an unreadable volume, and on a new board the honest answer is that there is nothing there to lose. Reported by akacoda on Discord, from a first install.
- **Sharing a layer stack with a pixel layer on top failed — two ways, and one of them looked like success.** A pixel layer flattened as 44 KB of raw RGBA, so one imported image (or two pixel layers of anything) pushed the published code over the community's 100 KB cap and the modal said "missing or over 100KB" with no hint why. Pixel layers now embed run-length coded, the same `{count, r, g, b, a}` shape the `.h` exporter writes — an empty or flat-filled layer is a few hundred bytes, an imported photo falls back to raw — the modal says what is too big *before* the round trip, and the editable `@stack` line is dropped only when the total would not fit, instead of the whole publish being refused.
  The worse one: the publish route strips licence wrapping before storing, and its footer pattern deleted from the **first** "Made with Patternflow" line to the end of the file. Every preset and every AI variant ends with that footer; flattened, it sits mid-file inside the layer's function with the composite `draw()` after it. The upload returned 201 and stored half a pattern — "render error" on the card, a SyntaxError on its page. A footer is now a footer only when nothing but comments follows it. `npm run check:flatten` and `check:license` cover both.
- **Coming back to the wall from a pattern no longer hammers the server.** Three things fired at once on Back: the feed rebuilt its scroll position in viewport-sized batches (sixteen requests for a 300-card feed, each a full-source page with four correlated counts per row), every card entering the viewport prefetched its detail page — a `force-dynamic` route, so each prefetch was a server render of the community layout, and the href changed on every wheel tick over a card, so *each tick* registered another — and each of those ticks also queued a fresh thumbnail render behind one shared iframe at five seconds' timeout apiece, with the queue and its cache unbounded and outliving the page. On a Raspberry Pi with a synchronous SQLite this was a freeze that read as "the server went down". The rebuild now fetches full pages (seven requests at most), card links do not prefetch, a card re-renders its still only when the cursor leaves it, withdrawn renders leave the queue, and the cache forgets past 400 stills. `docs/SERVICES.md` now also says the systemd units need `Restart=always`, which nothing had written down.
- **A repeated `?k=` on a pattern page was a 500**, the detail page queried the pattern twice per view (metadata and body), and a pattern accepted just under the size cap was refused on an unchanged re-save because the cap was measured with the licence wrapping still on.
- **An AI conversion no longer forces a color ramp onto an RGB pattern** — the "does this pattern use the value field" check read the whole source, so a mere mention of `setValue` in a comment recolored a pattern that painted its own RGB. The check now blanks comments and strings first.
- **Fractional Director keyframes survived export but not a reload** — the autosave restore path rounded keyframe times to whole seconds, silently flattening a 0.1 s-grid show back onto the 1 Hz grid. Restores now keep the wire grid.
- **The show list reported v2 lengths in raw ticks** (a 90-second show read as 900) — the header scan now divides by the version's tick rate.

## [3.5.2] - 2026-08-19

### Fixed
- **`cosh` and its relatives now resolve, so soliton patterns stop reading as impossible.** The module loader's host-symbol table carried `tanhf` but not `sinhf`/`coshf` — and sech(x) = 1/cosh(x) is the closed form of a soliton, so an entire genre of wave patterns failed to load with `unresolved symbol: coshf`, which looks exactly like "too heavy for the board". A systematic audit (every Basics-pack module plus a synthetic probe of the full libc/libm surface) added 40+ names in bulk: both hyperbolic families, `erff`/`erfcf`, the `rintf` family, 64-bit integer helpers, `qsort`/`bsearch`/`strto*`, string/ctype, and an `atexit` shim. `build_module.py` now checks every `.pfm` against the loader's own table at build time, so a pattern that the device would refuse fails on the build machine with the missing names spelled out. The Pattern Lab C++ prompt learned the new reality too: lookup tables are the house style (measured: 0–64 KB of static LUTs all render at 62 fps; a 4 KB sech² table took a soliton from 18 to 33 fps), and the old ~2 KB static ceiling — set when the largest free block was 7.7 KB — is now ~32 KB.

## [3.5.1] - 2026-08-19

### Fixed
- **Every wireless upload was paying a fixed five-second stall.** The core 2.x `WebServer` raw-body loop asks `readBytes()` for a full buffer even on the final chunk, so every pattern install, sidecar and catalog write sat out the 5 s stream timeout (a 447-byte file took 5.4 s; a body of exactly 1,436 bytes took 0.4 s — that probe is what convicted it). The library is now vendored under `src/webserver/` with the core 3.x read-exactly-remaining behaviour; a 29 KB pattern installs in 0.8 s and `/update` doubled to ~107 KB/s. The full investigation — where the core 3 heap went, the dead ends, the probe method — is written up in [docs/investigations/2026-08-core2-heap-and-the-5s-stall.md](docs/investigations/2026-08-core2-heap-and-the-5s-stall.md).

## [3.5.0] - 2026-08-18

### Changed
- **Releases build on Arduino core 2.x (IDF 4.4) via PlatformIO** (`firmware/patternflow/platformio.ini`). Core 3.x occupies ~71 KB more internal RAM before the sketch starts — mostly cache carve-out — and on this board that was the difference between a large community pattern loading and being refused, and between a heavy pattern running and the console dying. Measured after services: 15,320 B free / 7,668 B largest block on core 3.3.8 against **98,708 / 90,100** on core 2.0.17. No firmware source changed; a `.pfm` needs one contiguous internal executable block, so the largest-block number is the ceiling on pattern size. Local builds should install ESP32 board package **2.0.x**, not latest — the build guides now say so.

## [3.4.9] - 2026-08-18

### Fixed
- **The browser flasher was still serving v3.4.0, which predates the power clamp** — units flashed from the site between 08-12 and 08-18 could pull ~4.8 A at full white against the "max 2.4 A" printed on the box. This release moves the served image to a build that carries the clamp (`BUDGET_DEFAULT_MA = 2400`, enabled by default), the 13 dBm Wi-Fi TX cap, sleep mode (#314) and the boot latch (#316). Devices flashed from the site in that window need a reflash to pick the clamp up.

## [3.4.0] - 2026-08-12

Patterns leave the firmware and live on the filesystem, so a board ships nearly empty — and a pack ships with it. **Hardware unchanged**; v3.0 board and case carry over as-is.

### Added
- **A pattern set ships with Patternflow.** The **Basics pack** — 33 patterns — is built from `firmware/patternflow/presets/*.h` by the new `firmware/toolchain/make_pack.py`, committed to the repo at `web/public/packs/basics.zip`, and offered at the top of the community's decks shelf. No account, no build queue, and it works against a database that has never been seeded, because the person who just got their board lit has none of those. Built from our own sources rather than a ready-made set: every module carries an author its source actually declares, and the tool refuses to publish one that does not. `Patternflow` names the pack as publisher; the per-pattern author stays in each `.json`, where the licence expects to find it. Rebuilds are byte-identical, so an unchanged pattern set produces no diff.
- **A pack installs from a link.** `/patterns?src=` already ferried a build's file listing; it now also takes a plain `.zip`. Your browser fetches it, unpacks it and posts the modules to the board, so the device never needs TLS — it has nowhere near the heap for a handshake. This closes the deck loop too: a deck's download URL was a file you fetched and dragged, and is now one click.
- **Firmware updates have their own page** ([patternflow.work/update](https://patternflow.work/update)), reached from a banner on the device console when a newer release exists. Your browser downloads the image and hands it to the board over the LAN. Building a whole firmware image with a pattern baked into it is gone — a `.pfm` module does that job in 6 KB without a reflash.
- **A deck has a downloadable pack at a stable URL**, built once per running order and cached against a fingerprint of that order, so a deck nobody edits is compiled once ever. No sign-in: a public deck id is the capability, and the compile is charged to the deck's owner rather than to whoever pastes the link.
- **Install a whole pattern pack from one `.zip`**, contributed by **Simone Majocchi ([@SimonePDA](https://github.com/SimonePDA))**. A pack of `.pfm` + `.json` — what a community deck export produces — is unpacked **in the browser** by a vendored [fflate](https://github.com/101arrowz/fflate) and its members join the ordinary upload queue, so the device never sees an archive and its upload path is untouched. `catalog.txt` may ride along as the running order. Entry names are split on both `/` and `\`: Windows-made zips use backslashes, and without that the junk filter and the duplicate check silently stop matching, files upload under their full path, and the device accepts them, lists them, and loses them on reboot.
- **MQTT sidechannel** (`/mqtt`), also from **[@SimonePDA](https://github.com/SimonePDA)** — his protocol design, role model and topic layout. Knob clicks and the pattern name go out as retained topics (`<prefix>/knob/1..4`, `<prefix>/pattern`); a panel set to Subscriber follows them, so two panels stay in sync and Home Assistant sees plain values on plain topics. The role (Off / Publisher / Subscriber) is chosen at runtime and kept in NVS; compiling it in dials nothing until a broker host is set in `patternflow_secrets.h`.
- **Play a pattern from the list** — click a name on `/patterns`. **Arrange the running order** by dragging rows, then `Save order`, which writes the `catalog.txt` the registry reads. **`Select all`** beside the existing bulk delete.

### Changed
- **Origin is the only pattern compiled into the firmware.** Every preset costs internal DRAM, and with 34 of them a 128×64 board had roughly 1 KB of headroom — `/patterns` returned a truncated page as soon as anything else wanted RAM, which is what made MQTT look impossible to fit. Dropping them frees ~6 KB of DRAM and 49 KB of flash: internal heap goes 11,052 → 16,648 and `/patterns` 1.98 s → 0.03 s. The sources stay in `presets/` as the editable originals and ship as a pattern pack instead. **Updating loses the built-in showcase until you install the Basics pack** — which is one click from the decks shelf.
- **The device console is dark**, and reorganised around what each page is for. The home page leads with a device card (now playing, patterns, storage, network, memory, MQTT, uptime) over grouped rows, two columns on a desktop screen, and tells you when a newer firmware exists — the check runs in your browser against the public flasher manifest, so the device still never talks to the internet. Audio sync is honestly labelled Early. The marketing site stays on paper cream; the device is the thing glowing in a dark room.
- **Pattern names on the panel wrap instead of running off the edge.** The SELECT screen is 64 px wide in portrait — about ten characters — so a community pattern called "Retro Digital Tapestry" was clipped at both ends, and the old size-2 branch clipped from six characters on. Names now word-wrap in the stock 5×7 font. (A narrower bitmap font fits more characters and could not be read at this pixel pitch.)
- **Clearing a library is one request instead of one per pattern.** Each delete used to make the device rescan FATFS and reload the resident module, so emptying fifty was a minute of watching rows vanish one at a time. The endpoint takes the whole list — or `*` for everything, which also catches modules the loader rejected at boot and that therefore never appear in the list — and rescans once at the end. Deliberately without collecting the names into an array first: a `String[128]` of filenames is ~11 KB against ~7 KB of free internal heap, so `*` reopens the directory each pass and carries one name at a time.
- **A deck holds twenty patterns** instead of ten.
- **The delete looks like it is working.** It is one request the device answers only when finished, so the page sat still for about five seconds, which is how a hang looks. The selected rows now dim on the click, a bar sweeps under the status line, and the message counts the seconds. The bar is deliberately indeterminate — the device reports nothing from inside the pass, so a percentage would be invented.

### Fixed
- **Release images are scanned before publishing.** `net_config.h` bakes in whatever `patternflow_secrets.h` defines, and v2.1.0 and v3.0.0 shipped with the maintainer's home Wi-Fi credentials in plaintext because of it. Images are now built from a sketch copy with that file removed and scanned for every value it defines, with a build that still *has* the secrets used as a control — if the control passes, the scan is broken rather than the build clean.
- **The README described a device nobody has**: 34 built-in presets (it is Origin alone now) and a full-firmware path that carries a pattern along (there isn't one).
- **An unreachable MQTT broker no longer looks like a dead device.** Resolving the host and opening the socket ran synchronously in the render loop every 5 s, so a broker that stopped answering held the loop for seconds at a time — the panel still pinged and still accepted TCP, but served nothing. The address is resolved once and cached, the TCP connect and socket reads are bounded, and retries back off 5 s → 15 s → 60 s.
- **A subscriber no longer jumps when it joins.** A retained knob value was added to the local count rather than differenced against it, so a panel whose knob was not at zero landed at local + remote instead of matching the publisher.

## [3.3.0] - 2026-08-09

Color, end to end: perceptual ramps in the editor and a panel you can actually calibrate. **Hardware unchanged** — v3.0 board and case carry over as-is.

### Added
- **Runtime display calibration** ([#287](https://github.com/engmung/Patternflow/pull/287)): white balance, gamma and saturation were compile-time constants, so finding a number cost a reflash per guess. They are runtime state now, tunable live over `GET /api/display` while looking at the panel. Values are session-only; the converged ones go back into `config.h` as the shipped defaults. Compile the endpoint out with `-DPF_DISPLAY_HTTP_ENABLED=0`.
- **Calibration test card**, as an overlay rather than a pattern — knob browsing stays a curated list. `?screen=0..3` draws it over the running pattern (which freezes underneath) and `?screen=-1` resumes; a long-press on K4 or any pattern switch also dismisses it, so a closed browser tab can never strand the panel on a test screen. Four screens: white field at an adjustable level, a 16-step staircase over a smooth gradient, color bars at full and half drive, and sRGB-versus-OKLab ramp pairs shown on the actual LEDs.
- **[Panel tuner](https://patternflow.work/panel-tuner.html)** (`web/public/panel-tuner.html`): sliders driving `/api/display` beside a canvas rendering the same test frames in raw sRGB. The reference is the point — you cannot judge a color against a memory, only against another color. Generates a `config.h` block once the values settle. Plain HTTP on the device's LAN, so run it from a local dev server.
- **Remote pattern selection** — `GET /api/patterns/select?name=|index=`, through the same deferred-consume path OSC already used.
- **Perceptual color ramps in Pattern Lab and the community sandbox**: `oklab`, `oklch short` and `oklch long` join the existing modes. Blending complementary stops in sRGB collapses the middle into grey and sweeping hue in HSV makes lightness pulse; interpolating in OKLab does neither. Out-of-gamut blends are pulled back by lowering chroma at constant lightness and hue rather than clipping channels. Because ramps bake to a 256-entry lookup table web-side, the new modes reached the firmware, the C++ conversion and `.pfm` builds with no device-side change. The ramp panel gained a lightness strip and a monotonicity read-out.

- **[LED panel compatibility guide](docs/panel-compatibility.md)** ([#258](https://github.com/engmung/Patternflow/pull/258), [#259](https://github.com/engmung/Patternflow/issues/259)): a panel matching our spec line for line can still stay completely black, because HUB75E is a connector and not a protocol — the driver ICs decide. The catch is that the driver IC is essentially never in the listing (we audited our own: it appears in the title, spec table, marketplace AI summary and attached PDF manual zero times), so the guide leads with what actually works — reading buyer reviews for anyone running it off an ESP32 — then asking the seller, with the chip taxonomy kept as reference for a panel already in hand. Includes a verified-panel table with photos, how to tell the LED driver from the buffer and the row driver on a board, and a symptom→cause table. Opened up by **[@SimonePDA](https://github.com/SimonePDA)**, who hit the failure and researched it properly.
- **`PANEL_PROFILE` covers all six library drivers** instead of two — `PANEL_STANDARD`, `PANEL_HIGHREFRESH`, `PANEL_FM6124`, `PANEL_ICN2038S`, `PANEL_MBI5124`, `PANEL_DP3246`. Existing values keep their numbers and the default is unchanged.

### Changed
- **Shipped color defaults are now one panel's measured numbers**, not plausible ones: `LED_WB` 0.930/1.000/0.975 (that panel leans warm — red needed trimming hardest, not the green cut the folklore predicts) and `LED_SAT_BOOST` 1.62. The saturation direction reversed the theory that predicted it: narrow-band LED primaries cover more than sRGB, which argues for cutting saturation, but placed beside a monitor showing the same frame the panel reads washed out, and the boost held at both 14 % and 100 % brightness. **Existing devices will look different after this update** — more saturated, less warm. Panels vary; tune your own with `/api/display` and land the numbers in `config.h`.
- **Encoder acceleration removed — one detent, one step** ([#262](https://github.com/engmung/Patternflow/pull/262)). A fast spin used to multiply each detent ×2 to ×5. Compared against a linear build with a temporary per-knob tuning page (four curves live at once) and linear won outright — the multiplier was worst on the parameter that most needs landing on a value, since Origin's Mode knob picks a discrete preset and a quick turn skipped five at a time. OSC deltas had already been routed around it for that reason, which was the tell.
- **Knob travel now derives from the parameter's range.** It was a fixed per-knob constant that never looked at min/max — so a 0..1 knob crossed in one turn while a 0..100 knob needed a hundred, and the step handed to the C++ conversion inherited the same blind spot (which is why ~80 of ~120 step constants in the preset library are the identical `0.05f`). Travel is now `(max - min)` per two turns, so every knob crosses its range in the same motion whatever it drives. **Existing presets keep their compiled-in constants** — this lands on patterns generated from here on.

### Fixed
- **Calibration tables no longer sit in internal DRAM** ([#288](https://github.com/engmung/Patternflow/pull/288)). The test card's ramp tables shipped as a 1.5 KB namespace static — the exact mistake `core_mem.h` exists to prevent. Statics lock internal DRAM from boot, and internal DRAM is what lwIP's page delivery starves on: with them resident every console page truncated at ~5.6 KB and module uploads failed. They allocate from PSRAM in `setup()` now, and `/patterns` delivers its full 16 KB in 0.4 s.
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
