# Contributing to Patternflow

Patternflow is a device, a firmware, a website and a pile of documentation, and people contribute to all of them. This page says where each kind of contribution goes, what checks it meets, and the few rules that are not negotiable. Where to *ask* things is [SUPPORT.md](SUPPORT.md); how we treat each other is [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md); what is where is [docs/REPOSITORY.md](docs/REPOSITORY.md).

## Where your contribution goes

| You have… | It goes in | A change touches | What CI runs on it |
| :--- | :--- | :--- | :--- |
| A fix to a guide, a README or a spec | the markdown file itself: the root guides, `docs/`, any folder's README | one file | every relative link must resolve (`docs-links`) |
| A fix to the **breadboard** build guide | `web/src/app/build/breadboard/page.tsx` — that guide is React, not markdown | JSX text | `web-ci` (`next build`) |
| Your finished build, for the [build map](https://patternflow.work/inside) | `web/src/components/sections/InsideGlobe/builds.ts` plus a photo folder `web/public/builds/<slug>/` — see [Your build](#your-build). Not a git person? The [Share your build](../../issues/new?template=share_build.yml) form does the same | one `Build` entry and its photos | `web-ci` (the typecheck rejects a malformed entry) |
| A firmware **feature** | `firmware/patternflow/features/<name>/`, plus one line in the bundle it joins (`firmware/bundles/<edition>/features_local.h`) | the folder, the bundle line, an inventory row in `features/README.md`; a console page also adds a row to `firmware/toolchain/console_pages.py`; a library also goes in `platformio.ini` | `firmware-checks` (boundary, ABI freeze, presets, console pages…) and `firmware-build` (every edition, from scratch) |
| A fix to the firmware **core** (`patternflow.ino`, `src/`) | the file itself — for a bug or a real improvement to the device, never to make room for a feature | | the same, and the change must still be right on a build that has no features at all |
| An enclosure or mechanical **remix** | `hardware/case/remixes/<maker>-<variant>/`, with a README that states Author, License, what it is based on, which board it fits, and the print or cut settings | one new folder; the official folders stay as they are | the README fields are checked |
| A **bridge** to host software (TouchDesigner, Node-RED, Max, a DAW…) | `integrations/<host>/` with a README, plus a row in `integrations/README.md`. It talks to the panel through the contracts in `docs/` and never imports firmware or web code | one new folder | the README has to name the contract it is built against |
| A change to a **wire contract** | [`docs/rest-api.md`](docs/rest-api.md), [`osc-spec.md`](docs/osc-spec.md), [`midi-spec.md`](docs/midi-spec.md), [`mqtt-spec.md`](docs/mqtt-spec.md), [`audio-ws-spec.md`](docs/audio-ws-spec.md), [`pfst-v2-spec.md`](docs/pfst-v2-spec.md) | the spec: bump its version line and add a Version history row | `docs-links` |
| Web app work | `web/` — start at [`web/README.md`](web/README.md) and [`web/ARCHITECTURE.md`](web/ARCHITECTURE.md) | | `web-ci`: lint, typecheck, the `check:*` suites, `next build` |
| A **pattern** | **not this repository.** Make it in the [Pattern Lab](https://patternflow.work/pattern-lab), press **Publish**, and it is on the [Community](https://community.patternflow.work/community) for every Patternflow to play, under the license you choose. [PATTERN_GUIDE.md](PATTERN_GUIDE.md) walks the loop. The presets bundled in the firmware and the Basics pack are curated by the maintainer from the repository's own sources | | |

Parts sourcing tips, better photos of a build step, a clearer sentence: all of those are the first row.

## Sending it

1. Fork the repository and branch from `dev` (`fix/…`, `feat/…`, `docs/…`).
2. Commit with the area first, then a short present-tense summary — see [Commit messages](#commit-messages).
3. Open the pull request **against `main`**. `dev` is the maintainer's working branch; outside work is reviewed and merged into `main`, and `main` is pulled back into `dev` afterwards.
4. Fill in the template: what, why, how you tested it, and which row of the table above it is. The checks in that row run on every pull request, forks included, with no secrets involved.
5. Nobody pushes to `main` directly, the maintainer included, so a one-word typo fix is also a pull request. It is a small one.

## Before you open a firmware pull request

- **Read, in this order:** [`docs/EDITIONS.md`](docs/EDITIONS.md) (what a feature and an edition are, and the promises every build keeps) → [`firmware/patternflow/features/README.md`](firmware/patternflow/features/README.md) (the hooks) → [`firmware/bundles/README.md`](firmware/bundles/README.md) (the two files that make an edition). [FEATURE_GUIDE.md](FEATURE_GUIDE.md) is the walk-through, written so an AI coding agent can follow it too.
- **The core names no feature.** No `#include`, no `#if PF_<FEATURE>_ENABLED`, not even the feature's name in a string on the panel. If your change to `src/` would be wrong on a build without your feature, it belongs in `features/`. `firmware/toolchain/check_boundaries.py` enforces this in CI.
- **A feature without a bundle line compiles nowhere.** Name the edition it joins in the pull request, or propose a new one.
- **Run before pushing:** `./firmware/bundles/build.sh all` (every edition, and a scan of each image for its feature markers) and `python firmware/toolchain/check_boundaries.py`. Touching the core means building every composition; the default build has no features to break.
- **Explore in a fork first.** Features need room to be wrong for a while. Once it runs on a panel, an in-tree pull request that touches only `features/<yours>/` and a bundle line is welcome.

## The rules that are not negotiable

The full list, with the reasons, is [`AGENTS.md`](AGENTS.md#hard-rules-do-not-violate) — written for AI coding agents, but the rules are the project's, not the agents'. In short:

- **The board has one power input, `J4`, the screw terminal.** Never describe USB-C as a power option; a board powered that way smoked at a connector pin after twenty minutes.
- **`hardware/bom/bom_v3.9.csv` is the BOM source of truth.** The parts table in `BUILD_GUIDE.md` and `hardware/pcb/schematic.pdf` must match it; change one, check the other two.
- **Two licenses, strictly split.** Code is MIT, hardware and docs are CC BY-SA 4.0, and the SPDX header in a file is the authority where one exists. Don't merge the license files.
- **Brand naming.** "Patternflow" in prose, "PATTERNFLOW" engraved on hardware, `patternflow` in filenames and URLs.
- **The firmware core is not the place to put a feature.** See above.

## Licensing — inbound = outbound

What you send is licensed the way the place it lands in is licensed: code under [MIT](LICENSE-MIT), hardware files, guides and docs under [CC BY-SA 4.0](LICENSE-CC-BY-SA). You keep your copyright and your name; the project gets the right to bundle and redistribute. There is no CLA. Code files carry an SPDX line (and an `// Author:` line if it is yours); a remix folder or a bridge states its license in its README, because STL and DXF files cannot carry a header. The whole table is [docs/LICENSE-SUMMARY.md](docs/LICENSE-SUMMARY.md).

Patterns published to the Community are a different thing: you pick their license when you publish (CC BY-SA 4.0 by default, or CC BY 4.0), and nothing on this page applies to them.

## Commit messages

Start with the area, then a short summary in plain present tense.

```
area: short summary

web: collapse the preset list on mobile
firmware: fix reversed encoder direction
docs: clarify the breadboard wiring step
hardware: knob plate for 18 mm shafts
integrations: node-red example flow
```

Use `wip(area): …` for work that isn't finished yet. Nothing enforces this; it keeps the history and the Discord dev-log readable.

## Your build

A pin on the map is one entry in [`web/src/components/sections/InsideGlobe/builds.ts`](web/src/components/sections/InsideGlobe/builds.ts) and a folder of photos in `web/public/builds/<slug>/`. The type at the top of that file documents every field; the comments next to the fields say how precise a location to give and what a `collaboration` is. The `slug` becomes the pin's URL (`/inside/<slug>`), so pick it once. Photos you add are CC BY-SA 4.0 unless the entry says otherwise. If you would rather not touch the file, the [Share your build](../../issues/new?template=share_build.yml) form asks for the same things and the maintainer files it.

### Adding an Inside entry

Inside includes builds, projects derived from Patternflow, and places where it is used. Add one entry to `web/src/components/sections/InsideGlobe/builds.ts`: a short `title`, `maker`, public `location`, `date`, `description`, and any external `links`. Photos are optional. Keep existing `id` and `slug` values stable so shared links keep working.

Choose one primary `category`: `builds` for assembled devices and enclosure changes, `projects` for ports and new tools, or `in-use` for installations, performances and other uses. This is separate from `kind`, which preserves the existing build/collaboration relationship and marker style. A maker can have several entries: a new tool and a later exhibition are different records. Link to the maker's own documentation for ongoing updates; a short introduction here is enough. Do not add unannounced work or assume an event happened from a sale or a planned appearance.

Classify the subject of the entry, not its surroundings. A completed device photographed in a studio or DJ booth is still a `builds` entry. Use `in-use` when the entry documents actual use in an exhibition, performance or installation; a sale or delivery alone is not enough. Leave a category empty until a qualifying case is available.

## How the maintainer works

The `dev` → `main` routine, release cutting and what the workflows attach live in [docs/RELEASING.md](docs/RELEASING.md). Governance is one person: the maintainer decides what merges, in the open, in the pull request. Two collaborators have write access to the areas they built.
