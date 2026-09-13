# The repository, folder by folder

A map for people. (AI coding agents get the same map with more rules in [`../AGENTS.md`](../AGENTS.md).) Version numbers are deliberately not written here; the current project and edition versions are stamped into `AGENTS.md` by the release script and listed on the [releases page](https://github.com/engmung/Patternflow/releases).

## Top level

| Folder | What it is | Start at |
| :--- | :--- | :--- |
| `firmware/` | The ESP32-S3 firmware. `patternflow/` is the sketch: `patternflow.ino`, `config.h` (pins, brightness, limits, calibration), `net_config.h` (Wi-Fi, OTA, update defaults), `src/` (the engine: HUB75 driver, encoders, canvas, colour, noise, Wi-Fi, web console — the **core**, compiled unchanged into every published firmware), `features/` (everything optional: OSC, audio, MQTT, MIDI, shows, weather, clock — attached through hooks the core exposes), `presets/` (the curated patterns), `abi/` (the frozen contract a `.pfm` module is compiled against), `console/` (the device's web pages as plain HTML). `bundles/` names the editions (which features compile in) and holds `build.sh`. `toolchain/` is the repo-level scripts: build a module, make the Basics pack, and the `check_*.py` that CI runs. `modules/` is the module toolchain's working folder, not a place patterns are contributed to | [`firmware/README.md`](../firmware/README.md) for building; [`EDITIONS.md`](EDITIONS.md) before touching anything |
| `hardware/` | `pcb/` (KiCad source, Gerbers per revision, schematic PDF), `case/` (STLs by printer bed size, knob plates, the Blender source, legacy v2 cases, and `remixes/` for community variants), `bom/` (the CSV that is the BOM source of truth) | [`hardware/README.md`](../hardware/README.md) |
| `web/` | The Next.js site at patternflow.work: landing page, Live Editor, Pattern Lab, the community (only on the community host), browser flasher, edition shelf, device update handoff, journal, roadmap. The JS presets in `src/lib/presets/` are the source of truth for the firmware's preset headers. The breadboard build guide is a React page here, `src/app/build/breadboard/` | [`web/README.md`](../web/README.md), then [`web/ARCHITECTURE.md`](../web/ARCHITECTURE.md) |
| `docs/` | Contracts other software is built against, how the firmware is put together, walk-throughs, the assembly map, project records and media | [`README.md`](README.md) |
| `tools/` | Clients Patternflow ships that run on their own: the audio-react browser extension (also the authoring source of the device's `/audio-in` page), the Android capture app, an RTP-MIDI probe | [`tools/README.md`](../tools/README.md) |
| `integrations/` | Bridges that run inside or beside someone else's software (Ableton / Max for Live today) and talk to the panel only through the contracts in `docs/` | [`integrations/README.md`](../integrations/README.md) |
| `.github/` | Issue and pull-request templates, the CI workflows (web, firmware editions, doc links, console-page sync, firmware release assets, Discord dev-log) and their helper scripts | the header comment of each workflow |
| root | `README.md`, the five guides (`BUILD_GUIDE.md`, `BUILD_GUIDE_v2.md`, `PATTERN_GUIDE.md`, `FEATURE_GUIDE.md`, `AUDIO_GUIDE.md`), `CHANGELOG.md`, `CONTRIBUTING.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CITATION.cff`, the two license texts and the `LICENSE` pointer, `AGENTS.md` (+ `CLAUDE.md`, a one-line shim) | |

The rule for where a document lives: **a guide somebody follows start to finish is at the root; a contract, a reference or a record is in `docs/`; a folder explains itself in its own README.**

## What you want to do → where to start

| Goal | Path |
| :--- | :--- |
| Build one | [`README.md`](../README.md) → [`BUILD_GUIDE.md`](../BUILD_GUIDE.md) (or the [assembly map](assembly/README.md) for the other routes) → [`hardware/README.md`](../hardware/README.md) for which files to order |
| Make a pattern | [`PATTERN_GUIDE.md`](../PATTERN_GUIDE.md) — the Pattern Lab, the community, and the device. No local toolchain involved. [`firmware/CUSTOM_PATTERNS.md`](../firmware/CUSTOM_PATTERNS.md) is the older, more hands-on route |
| Write a firmware feature or cut an edition | [`FEATURE_GUIDE.md`](../FEATURE_GUIDE.md) → [`EDITIONS.md`](EDITIONS.md) → [`features/README.md`](../firmware/patternflow/features/README.md) → [`bundles/README.md`](../firmware/bundles/README.md) |
| Control the panel from other software | [`rest-api.md`](rest-api.md) has the table for choosing between HTTP, OSC, MIDI and MQTT; then the spec for the one you chose |
| Put sound into it | [`AUDIO_GUIDE.md`](../AUDIO_GUIDE.md) |
| Work on the site | [`web/README.md`](../web/README.md) → [`web/ARCHITECTURE.md`](../web/ARCHITECTURE.md) |
| Contribute anything | [`CONTRIBUTING.md`](../CONTRIBUTING.md) — one table of where each kind of contribution goes |
| Cut a release, run the servers | [`RELEASING.md`](RELEASING.md), [`SERVICES.md`](SERVICES.md) |

## Deliberately not in git

`_temp/`, `_tmp/` (scratch), `.claude/` (local agent config), `firmware/patternflow/patternflow_secrets.h` (per-device Wi-Fi credentials — never commit, and never build a shelf image with it present), `firmware/modules/.build/` and `firmware/patternflow/data/patterns/` (module build outputs), `web/data/` (a community host's SQLite and uploads), the PlatformIO clones under `firmware/patternflow/`. The reasons are in `.gitignore`'s comments.

## Naming

Filenames are lowercase with underscores. Tags are `vX.Y.Z`; the firmware source is not versioned by folder name. Preset files are named by the date they were made (`preset_0510.h`) and that name is also the site's sort key, so they are not renamed. `encloser.stl` is a typo that shipped in a release and on MakerWorld; it stays.

## Files that other things link to — check before renaming

The site, the firmware and the release notes hold absolute `blob/main/…` links into this tree, and none of them is checked by CI. Before renaming or moving any of these, grep `web/src`, `web/content`, `firmware/patternflow/console` and `firmware/patternflow/features/*/*_index.h`:

- `README.md`, `BUILD_GUIDE.md` (three section anchors are linked from the site), `AUDIO_GUIDE.md`, `FEATURE_GUIDE.md`, `PATTERN_GUIDE.md`
- `docs/assembly/README.md`, `docs/midi-ableton.md`, `docs/midi-spec.md` (the last two are baked into the Audio edition's console pages)
- `docs/EDITIONS.md`, `docs/rest-api.md`, `firmware/README.md`, `hardware/bom/bom_v3.9.csv`
- `web/src/app/compliance/` — the `/compliance` URL is printed on the box. Never move, redirect or noindex it.

`.github/scripts/check_links.py` checks the *relative* links in every tracked markdown file and runs on every pull request that touches one.
