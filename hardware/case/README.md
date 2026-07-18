# Patternflow Case

3D-printable enclosure for the Patternflow LED synthesizer. Folders are named by **printer bed size** — find the folder that fits your printer.

> **These cases fit the v3.0 board.** If you built (or are building) a v2.x board, use [`legacy_v2/`](legacy_v2/) — the v3 board is a different size and the two generations are **not** interchangeable.

## Which folder do I print?

| Your printer bed | Print | Design | Status |
|---|---|---|---|
| **256 mm** (Bambu P1S / X1C / A1 class) | [`bed_256mm/encloser.stl`](bed_256mm/) | The snap-fit design split for a 256 mm bed — **one STL with every part**, 20 mm knobs included | ✅ Standard option, ~10 h total |
| **~330 mm+** (Bambu H2S-class) | [`bed_330mm/`](bed_330mm/) | One-piece snap-fit body + closing part | ✅ Main design ([#113](https://github.com/engmung/Patternflow/issues/113)); print verification of this exact STL pending |

**Knobs print in black, everything else in white.** `encloser.stl` already contains the 20 mm knobs — just split them out in your slicer for the black print. For the 330 mm body (or 15 mm-shaft encoders), print a knob file from [`knobs/`](knobs/) instead (15 mm and 20 mm shafts are functionally identical; the [BOM](../bom/)'s reference part, PEC11R-4220F-S0024, is 20 mm).

## `bed_330mm/` — one-piece snap-fit

The original mass-production-oriented design: a single-piece body plus a snap-fit closing part, wall-mount hanger hole included. No bonding step at all. Does **not** fit a 256 mm bed.

| File | Color |
|---|---|
| `oneshot_v3_part1.stl` | White PLA |
| `oneshot_v3_part2.stl` | White PLA |

## `bed_256mm/` — the standard build

**`encloser.stl`** is the whole kit in one file: body parts, the LED-panel mounting part, and the 20 mm knobs. Split the objects in your slicer — knobs in **black**, everything else in **white**. ~10 hours total on a P1S. The LED-panel mount is sized for the panel linked in the [BOM](../bom/). (Its v2.1 twin — same design, cut for the v2.1 board — is print & assembly verified; this file is the v3.0 cut.)

Design perks: **two wall-mount holes**, a **snap-fit back panel**, and recesses for the LED matrix's alignment bumps — **no more nipper-trimming** the panel back (the old [#4](https://github.com/engmung/Patternflow/issues/4) workaround).

### `for_other_panels/` — using a different LED panel?

`divided_v3_part1..5.stl` is a community variant whose **LED-panel mounting part adapts to varying bolt-hole positions** — panel suppliers drill them in different places. Print this instead of `encloser.stl` **only if** your panel is not the BOM-linked one. Print & assembly verified with a v3.0 board in [#169](https://github.com/engmung/Patternflow/issues/169), including USB-C port alignment.

> ⚠️ Adjustable ≠ universal: if your panel's hole layout differs a lot, even this version may not fit. Check the mounting part against your panel before committing to the full print.

### Assembly notes (both 256 mm variants)

1. Match the **LED-panel mounting part** to your panel first.
2. Insert the mounting part into the LED panel, then tighten the M4 screws.
3. Fit the assembly into the enclosure and glue between the mounting part and the enclosure walls.
4. ⚠️ Watch-outs: the panel insertion is very tight (near-zero clearance); flat-printed edges come out slightly rounded, so glued seams can show a small gap — fill with putty or a baking-soda + CA filler. If the mounting-part bond isn't solid, gripping the enclosure at the LED side can flex the wall.

## `legacy_v2/` — v2.x boards only

Everything that fits the v2.x board generation, kept for existing builds. **None of these fit the v3.0 board.** The v2 build guide lives at the [v2.1.0 release](https://github.com/engmung/Patternflow/blob/v2.1.0/BUILD_GUIDE.md).

| File | What |
|---|---|
| `encloser_v2.1.stl` | ✅ **Recommended v2 print** — the snap-fit design cut for the v2.1 board, every part in one STL (knobs included). Print & assembly verified. No body gluing, snap-fit back panel, two wall-mount holes, and **no LED-matrix bump trimming** ([#4](https://github.com/engmung/Patternflow/issues/4) recesses built in). Assemble per the sequence in the [v3 guide §6](../../BUILD_GUIDE_v3.md#6-case-assembly). |
| `plate_main.stl` + `plate_dividers.stl` | Classic split plates (256 mm bed, glued) — the path the [v2 guide](https://github.com/engmung/Patternflow/blob/v2.1.0/BUILD_GUIDE.md) documents with full photos |
| `oneshot_v2_part1/2.stl` | One-piece snap-fit for the v2.x board (330 mm+ bed) |

(An `easyfit` plate variant existed briefly but was retired over a fit defect — [#154](https://github.com/engmung/Patternflow/issues/154). It remains browsable at the [v2.1.0 tag](https://github.com/engmung/Patternflow/tree/v2.1.0/hardware/case).)

## Print settings

- **Printer:** Bambu P1S (default profile works as-is)
- **Nozzle:** 0.4 mm
- **Layer height:** 0.2 mm (default)
- **Supports:** Standard (regular) — *not* tree supports
- **Brim:** Off
- **Aux fan:** ~20%

## `source/`

- `patternflow_case.blend` — Blender 4.x source for every printed part.
- `patternflow_v1.svg` / `patternflow_v2.svg` — legacy laser-cut acrylic case designs (v1-era).

> **Note — downloading the .blend.** The Blender source is stored in Git LFS, so GitHub's *Code → Download ZIP* gives you a small pointer file instead of the real ~45 MB file. Download it from the [latest release assets](https://github.com/engmung/Patternflow/releases/latest) instead. The STL files are regular files and download fine either way.

To re-export STLs after editing:

1. Open the `.blend` in Blender.
2. Select the entire collection for one part.
3. `File → Export → Stl (.stl)`, with **Selection Only** checked.
4. Save with the matching filename in the bed-size folder.
