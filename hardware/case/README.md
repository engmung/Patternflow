# Patternflow Case

3D-printable enclosure for the Patternflow LED synthesizer. Folders are named by **printer bed size** — find the folder that fits your printer, print everything in it, plus one knob file.

> **These cases fit the v3.0 board.** If you built (or are building) a v2.x board, use [`legacy_v2/`](legacy_v2/) — the v3 board is a different size and the two generations are **not** interchangeable.

## Which folder do I print?

| Your printer bed | Folder | Design | Status |
|---|---|---|---|
| **~330 mm+** (Bambu H2S-class) | [`bed_330mm/`](bed_330mm/) | One-piece snap-fit body + closing part — no gluing | ✅ Main design ([#113](https://github.com/engmung/Patternflow/issues/113)); print verification of this exact STL pending |
| **256 mm** (Bambu P1S / X1C / A1 class) | [`bed_256mm/`](bed_256mm/) | The snap-fit design divided into 5 parts, with a **separate LED-panel mounting part** that adapts to varying panel bolt-hole positions | ✅ Print & assembly tested ([#169](https://github.com/engmung/Patternflow/issues/169)) |

Whichever body you print, **knobs print separately, in black**, from [`knobs/`](knobs/) — pick the file matching your encoder shaft length (15 mm and 20 mm are functionally identical; the [BOM](../bom/)'s reference part, PEC11R-4220F-S0024, is 20 mm).

## `bed_330mm/` — one-piece snap-fit

The original mass-production-oriented design: a single-piece body plus a snap-fit closing part, wall-mount hanger hole included. No bonding step at all. Does **not** fit a 256 mm bed.

| File | Color |
|---|---|
| `oneshot_v3_part1.stl` | White PLA |
| `oneshot_v3_part2.stl` | White PLA |

## `bed_256mm/` — divided snap-fit (5 parts)

The one-piece design split so standard printers can build it. Print & assembly verified with a v3.0 board in [#169](https://github.com/engmung/Patternflow/issues/169), including USB-C port alignment.

| File | Color |
|---|---|
| `divided_v3_part1.stl` … `divided_v3_part5.stl` | White PLA |

Assembly notes from the verification build (full steps will be in the build guide):

1. The **LED-panel mounting part is separate** because panel bolt-hole positions vary between suppliers — match it to your panel first.
2. Insert the mounting part into the LED panel, then tighten the screws.
3. Fit the assembly into the enclosure and glue between the mounting part and the enclosure walls.
4. ⚠️ Watch-outs: the panel insertion is very tight (near-zero clearance); flat-printed edges come out slightly rounded, so glued seams can show a small gap — fill with putty or a baking-soda + CA filler. If the mounting-part bond isn't solid, gripping the enclosure at the LED side can flex the wall.

## `legacy_v2/` — v2.x boards only

Everything that fits the v2.x board generation, kept for existing builds. **None of these fit the v3.0 board.** The v2 build guide lives at the [v2.1.0 release](https://github.com/engmung/Patternflow/blob/v2.1.0/BUILD_GUIDE.md).

| File | What |
|---|---|
| `plate_main.stl` + `plate_dividers.stl` | Standard split plates (256 mm bed, glued) — the classic v2 build |
| `plate_main_easyfit.stl` | ⚠️ Known defect, do not print ([#154](https://github.com/engmung/Patternflow/issues/154)) |
| `oneshot_v2_part1/2.stl` | One-piece snap-fit for the v2.x board (330 mm+ bed) |
| `divided_v2.1.stl` | Divided design fitted to the v2.1 board — never print-tested |

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
