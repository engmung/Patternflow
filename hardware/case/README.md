# Patternflow Case

3D-printable enclosure for the Patternflow LED synthesizer.

## Print plates

The case is organized into three print plate groups. Print the main body, dividers, and one knob plate that matches your encoder shaft length.

| File | Contents | Color | Print time |
|---|---|---|---|
| `print-ready/01_plate_main.stl` | Body (upper + lower) and back panel (upper + lower) | White PLA | ~7h |
| `print-ready/02_plate_dividers.stl` | Center divider, battery slider, board slider | White PLA | ~2h |
| `print-ready/03_plate_knobs_15mm.stl` | 4× knobs for 15mm encoder shafts | Black PLA | ~30min |
| `print-ready/03_plate_knobs.stl` | 4× knobs for 20mm encoder shafts | Black PLA | ~30min |

Total with one knob plate: **~10 hours** on a Bambu P1S with default settings. The 15mm knob plate is recommended for new builds.

## Variants

Optional drop-in replacements live in `print-ready/variants/`. Print a variant *instead of* the matching standard plate — same fit, different tradeoff.

| File | Replaces | Tradeoff |
|---|---|---|
| `print-ready/variants/01_plate_main_easyfit.stl` | `01_plate_main.stl` | Adds small alignment tabs along the bond seam so the two halves self-locate and glue easily — no taping or clamping. The tradeoff is a thin visible seam between the halves (hide it by sprinkling baking soda into the wet glue line). Use the standard `01_plate_main.stl` for the cleanest seam if you're comfortable clamping while it cures. |

Naming: a variant keeps its base plate's name plus a descriptive suffix (e.g. `01_plate_main` + `_easyfit`), so each variant sorts next to the part it replaces.

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
