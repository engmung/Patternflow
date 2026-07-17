# Patternflow Case

3D-printable enclosure for the Patternflow LED synthesizer.

## Which files do I print?

| Option | Printer bed | PCB | Status |
|---|---|---|---|
| [Standard plates](#standard-plates) (split body, glued) | 256 mm (P1S-class) | v2.x | ✅ Recommended |
| [One-piece snap-fit](#one-piece-enclosure-large-format-printers) (`oneshot_v2`) | ~330 mm+ (H2S-class) | v2.x | ✅ Supported |
| [`easyfit` main plate variant](#variants) | 256 mm | v2.x | ⚠️ Known issue — fix before printing ([#154](https://github.com/engmung/Patternflow/issues/154)) |
| [`oneshot_v3-wip`](#one-piece-enclosure-large-format-printers) | ~330 mm+ | **v3.0 only** | 🚧 Do not print with a v2.x PCB |
| [5-part divided snap-fit](#experiments) | 256 mm | v2.x | 🚧 Untested — do not print yet |

Whichever body you choose, **knobs are always printed separately, in black**, from the knob plate matching your encoder shaft length (see below).

## Standard plates

The standard build: body halves print on a 256 mm bed and are glued together. Print the main body, dividers, and one knob plate.

| File | Contents | Color | Print time |
|---|---|---|---|
| `print-ready/01_plate_main.stl` | Body (upper + lower) and back panel (upper + lower) | White PLA | ~7h |
| `print-ready/02_plate_dividers.stl` | Center divider, battery slider, board slider | White PLA | ~2h |
| `print-ready/03_plate_knobs_15mm.stl` | 4× knobs for 15mm encoder shafts | Black PLA | ~30min |
| `print-ready/03_plate_knobs.stl` | 4× knobs for 20mm encoder shafts | Black PLA | ~30min |

Total with one knob plate: **~10 hours** on a Bambu P1S with default settings. The 15mm knob plate is recommended for new builds.

## One-piece enclosure (large-format printers)

An alternative to the standard split-and-glue body: the enclosure prints as a **single-piece body plus a snap-fit closing part** — no bonding step at all. This is the mass-production-oriented design from [Issue #113](https://github.com/engmung/Patternflow/issues/113).

**Bed requirement: ~330 mm+ (Bambu H2S-class or similar large-format).** It does **not** fit a 256 mm bed (P1S/X1C/A1 class) — for those printers, use the standard plates above, or watch the 5-part divided version in [Experiments](#experiments).

| File | For | Status |
|---|---|---|
| `print-ready/variants/oneshot_v2_1.stl` + `oneshot_v2_2.stl` | **Current (v2.x) PCB** | ✅ Print this one |
| `print-ready/oneshot_v3-wip/oneshot_1.stl` + `oneshot_2.stl` | Upcoming **v3.0** board only | 🚧 Work-in-progress — **not compatible with v2.x**: cutouts and standoffs will not line up. Vent holes and anti-warp ribs are also planned before release. |

Both print in **white PLA**. Knob caps are **not** part of the one-piece case — print them separately from the standalone knob plate (`03_plate_knobs.stl` for 20mm shafts, `03_plate_knobs_15mm.stl` for 15mm), **in black**, and press-fit them last.

## Variants

Optional drop-in replacements live in `print-ready/variants/`. Print a variant *instead of* the matching standard plate — same fit, different tradeoff. A variant keeps its base plate's name plus a descriptive suffix (e.g. `01_plate_main` + `_easyfit`), so it sorts next to the part it replaces. (The `oneshot_v2` files also live here; they're covered in the one-piece section above.)

### `01_plate_main_easyfit.stl` — ⚠️ do not print as-is

Replaces `01_plate_main.stl`, adding small alignment tabs along the bond seam so the two halves self-locate and glue easily — no taping or clamping. The tradeoff is a thin visible seam between the halves (hide it by sprinkling baking soda into the wet glue line).

**Known issue ([#154](https://github.com/engmung/Patternflow/issues/154)):** the current STL is missing the internal slot that the LED matrix divider wall slides into, so the divider does not seat. Until a fixed STL is uploaded, either **use the standard `01_plate_main.stl`**, or add the missing slot yourself (from the Blender source, matching the standard plate's slot) as described in the issue.

## Experiments

`print-ready/experiment/` holds unvalidated work-in-progress. Currently:

- `divided_test_1.stl` … `divided_test_5.stl` — the one-piece enclosure split into **5 parts that fit a 256 mm bed** (P1S-class), so community printers can build the snap-fit design too. Modeled but **not yet print-tested** — do not build from these yet. Once validated, they will be promoted next to the one-piece files.
- `v2.1_divided.stl` — the latest revision of the divided design, fitted to the v2.1 board. Same status: **not yet print-tested** — do not build from this yet.

## Print settings

- **Printer:** Bambu P1S (default profile works as-is)
- **Nozzle:** 0.4 mm
- **Layer height:** 0.2 mm (default)
- **Supports:** Standard (regular) — *not* tree supports
- **Brim:** Off
- **Aux fan:** ~20%
- **Orientation:** Plate 01 prints vertically (standing). Plates 02 and 03 lay flat.

## Source

`source/patternflow_v1.blend` — Blender 4.x source file.

> **Note — downloading the .blend.** The Blender source is stored in Git LFS, so GitHub's *Code → Download ZIP* gives you a small pointer file instead of the real ~45 MB file. To get the actual file, download it from the [latest release assets](https://github.com/engmung/Patternflow/releases/latest) or open it on GitHub and use the download button. The STL files are regular files and download fine either way.

To re-export STLs after editing:

1. Open the `.blend` in Blender.
2. Select the entire collection for one plate (e.g. *Plate 01 — Main*).
3. `File → Export → Stl (.stl)`, with **Selection Only** checked.
4. Save with the matching filename in `print-ready/`.

Each plate is organized as its own collection inside the `.blend` for one-click export.

## Assembly

See [BUILD_GUIDE.md](../../BUILD_GUIDE.md) for the full assembly walkthrough — bonding the case halves, mounting the LED matrix, installing the PCB, and wiring the power input.

## License

CC-BY-SA 4.0. See [LICENSE-CC-BY-SA](../../LICENSE-CC-BY-SA) at the repository root.
