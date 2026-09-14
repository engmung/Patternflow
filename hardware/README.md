# Patternflow Hardware

Open hardware files for Patternflow: the board, the enclosure, the bill of materials. CC BY-SA 4.0 — see the root [LICENSE-CC-BY-SA](../LICENSE-CC-BY-SA).

## Which board is current

| Board | Status | Order | Parts | Case |
| :--- | :--- | :--- | :--- | :--- |
| **v3.9** | **Current.** The v3.0 board with the USB-C power footprint removed: `J4`, the screw terminal, is the only power input. Outline, mounting holes and every other footprint are unchanged from v3.0 | [`pcb/gerber/patternflow_v3.9_gerber.zip`](pcb/gerber/) or the [PCBWay shared project](https://www.pcbway.com/project/shareproject/Patternflow_An_LED_synthesizer_776d796c.html) | [`bom/bom_v3.9.csv`](bom/bom_v3.9.csv) | `case/bed_256mm/` or `case/bed_330mm/` + `case/knobs/` |
| v3.0 | Previous revision, fabricated and verified. If you already have one, build it: leave `USB1`, `R1`, `R2` unpopulated ([#221](https://github.com/engmung/Patternflow/issues/221)) | `pcb/gerber/patternflow_v3.0_gerber.zip` (only if you specifically want that footprint) | [`bom/bom_v3.0.csv`](bom/bom_v3.0.csv) | the same v3 cases |
| v2.1 | Legacy. Last of the v2.x generation; **does not fit the v3 cases** | `pcb/gerber/patternflow_v2.1_gerber.zip` | inside the [v2.1.0 guide](https://github.com/engmung/Patternflow/blob/v2.1.0/BUILD_GUIDE.md#1-bill-of-materials-bom) | `case/legacy_v2/` |
| v1.0, v2.0 | Archived early revisions | — | — | — |

The build itself is [`../BUILD_GUIDE.md`](../BUILD_GUIDE.md) (v3 boards) and [`../BUILD_GUIDE_v2.md`](../BUILD_GUIDE_v2.md) (v2.x); the map of every enclosure + electronics combination is [`docs/assembly/README.md`](../docs/assembly/README.md). Every v3.x firmware release runs on every v3 board; the pin map has not changed since v2.

## Folders

- `pcb/` — the circuit board ([overview with schematic and renders](pcb/README.md))
  - `kicad/` — the editable KiCad 10 project, with its local footprint and 3D libraries
  - `gerber/` — fab-ready zips, one per revision (`patternflow_vX.Y_gerber.zip`); `gerber/experiment/` is for unverified work and is empty when nothing is in flight
  - `images/` — board renders and the schematic as SVG, regenerated with `kicad-cli` (recipe in the PCB README)
  - `schematic.pdf` — the schematic without KiCad
- `case/` — the 3D-printed enclosure ([which folder to print, settings, assembly notes](case/README.md))
  - `bed_256mm/` — the standard build, split for P1S-class beds; also the Bambu Studio project `patternflow_v3.3mf`; `for_other_panels/` is the adjustable-mount variant for panels whose bolt holes differ
  - `bed_330mm/` — the one-piece body for H2S-class beds
  - `knobs/` — knob plates for 15 mm and 20 mm encoder shafts, printed with every build
  - `source/` — the Blender source for every printed part (Git LFS; download it from the [latest release](https://github.com/engmung/Patternflow/releases/latest) rather than the ZIP button)
  - `legacy_v2/` — every v2.x-board case
  - `legacy_lasercut/` — the v1/v2 acrylic drawings, kept for the record ([README](case/legacy_lasercut/README.md))
  - `remixes/` — community enclosure variants, one folder each with its own README as the license header ([how to add one](case/remixes/README.md))
- `bom/` — the machine-readable bills of materials ([sourcing notes and column reference](bom/README.md)). **`bom_v3.9.csv` is the source of truth**: the parts table in the build guide and the schematic are kept in step with it.

## How things are named

Board revisions are numbers on the file (`patternflow_v3.9_gerber.zip`, `bom_v3.9.csv`); case folders are named by the **printer bed** they fit, because the same board goes in either; and `legacy_*` holds what an older board needs. `encloser.stl` is a misspelling that shipped in a release and on MakerWorld, so the file keeps its name.

## Getting one file without cloning

GitHub's *Download ZIP* gives you every STL and Gerber (they are ordinary files). For a single file, open it on GitHub and use *Download raw file*. The Blender source is the one exception (Git LFS) — take it from a release.

## Changing the hardware

Editing the board means regenerating the Gerber zip, the renders and the schematic exports with the commands in [`pcb/README.md`](pcb/README.md), updating the BOM CSV, and checking the build guide's parts table against it — the three must agree. Editing the case means re-exporting the STLs from the Blender source as [`case/README.md`](case/README.md) describes. A variant you want to share rather than merge is a [remix](case/remixes/README.md).
