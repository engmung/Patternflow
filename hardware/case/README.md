# Patternflow Case

3D-printable enclosure for the Patternflow LED synthesizer. Folders are organized by **build option** — pick the one that matches your printer, then print everything in that folder plus one knob file.

## Which option do I print?

| Option | Folder | Printer bed | PCB | Status |
|---|---|---|---|---|
| **Standard plates** (split body, glued) | [`standard/`](standard/) | 256 mm (P1S-class) | v2.x | ✅ Recommended |
| **One-piece snap-fit** | [`oneshot/`](oneshot/) | ~330 mm+ (H2S-class) | v2.x | ✅ Supported |
| **Divided snap-fit** (5 parts) | [`divided/`](divided/) | 256 mm | v2.x | 🚧 Untested — do not print yet ([#169](https://github.com/engmung/Patternflow/issues/169)) |

Whichever body you choose, **knobs are printed separately, in black**, from [`knobs/`](knobs/) — pick the file matching your encoder shaft length. The [v3.0 BOM](../bom/) standardizes on **20 mm shafts** (PEC11R-4220F-S0024 → `knobs_20mm.stl`); the v2.x build guide recommended 15 mm (→ `knobs_15mm.stl`). Both work with every body option.

## `standard/` — split plates (256 mm bed)

The standard build: body halves print on a 256 mm bed and are glued together.

| File | Contents | Color | Print time |
|---|---|---|---|
| `plate_main.stl` | Body (upper + lower) and back panel (upper + lower) | White PLA | ~7h |
| `plate_dividers.stl` | Center divider, battery slider, board slider | White PLA | ~2h |

Total with one knob plate: **~10 hours** on a Bambu P1S with default settings.

### `plate_main_easyfit.stl` — ⚠️ do not print as-is

A drop-in replacement for `plate_main.stl` that adds small alignment tabs along the bond seam so the halves self-locate and glue easily — no taping or clamping. Tradeoff: a thin visible seam (hide it by sprinkling baking soda into the wet glue line).

**Known issue ([#154](https://github.com/engmung/Patternflow/issues/154)):** the current STL is missing the internal slot the LED matrix divider wall slides into. Until a fixed STL is uploaded, use the standard `plate_main.stl`, or add the missing slot yourself from the Blender source as described in the issue.

## `oneshot/` — one-piece snap-fit (330 mm+ bed)

The enclosure prints as a **single-piece body plus a snap-fit closing part** — no bonding step at all. This is the mass-production-oriented design from [Issue #113](https://github.com/engmung/Patternflow/issues/113). Includes a wall-mount hanger hole.

**Bed requirement: ~330 mm+ (Bambu H2S-class or similar).** It does **not** fit a 256 mm bed — for those printers, use `standard/`, or watch `divided/`.

| File | For | Status |
|---|---|---|
| `oneshot_v2_part1.stl` + `oneshot_v2_part2.stl` | **Current (v2.x) PCB** | ✅ Print this one |
| `v3-wip/oneshot_v3_part1.stl` + `oneshot_v3_part2.stl` | Upcoming **v3.0** board only | 🚧 Work-in-progress — **not compatible with v2.x**: cutouts and standoffs will not line up. Vent holes and anti-warp ribs still planned. |

Both print in **white PLA**. Knob caps are not part of the one-piece case — print them from `knobs/`, in black, and press-fit them last.

## `divided/` — snap-fit split for 256 mm beds

The one-piece design divided into parts that fit a P1S-class bed, so standard printers can build the snap-fit design too. **Modeled but not print-tested — do not build from these yet** ([#169](https://github.com/engmung/Patternflow/issues/169)). Once validated, this becomes a supported option.

| File | Status |
|---|---|
| `divided_v2.1.stl` | Latest revision, fitted to the v2.1 board — awaiting print test |
| `tests/divided_test_1..5.stl` | Earlier 5-part iterations, kept for reference |

## Print settings

- **Printer:** Bambu P1S (default profile works as-is)
- **Nozzle:** 0.4 mm
- **Layer height:** 0.2 mm (default)
- **Supports:** Standard (regular) — *not* tree supports
- **Brim:** Off
- **Aux fan:** ~20%
- **Orientation:** `plate_main` prints vertically (standing). Dividers and knobs lay flat.

## `source/`

- `patternflow_case.blend` — Blender 4.x source for every printed part.
- `patternflow_v1.svg` / `patternflow_v2.svg` — legacy laser-cut acrylic case designs (v1-era).

> **Note — downloading the .blend.** The Blender source is stored in Git LFS, so GitHub's *Code → Download ZIP* gives you a small pointer file instead of the real ~45 MB file. Download it from the [latest release assets](https://github.com/engmung/Patternflow/releases/latest) instead. The STL files are regular files and download fine either way.

To re-export STLs after editing:

1. Open the `.blend` in Blender.
2. Select the entire collection for one part.
3. `File → Export → Stl (.stl)`, with **Selection Only** checked.
4. Save with the matching filename in the option folder.
