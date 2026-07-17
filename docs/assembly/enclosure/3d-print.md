# 3D Printed Enclosure

Status: supported now.

This path uses the current PLA enclosure files in `hardware/case/`. The reference print was made on a Bambu P1S with standard PLA.

## Files

| File | Contents |
| --- | --- |
| `hardware/case/standard/plate_main.stl` | Main body and back panel |
| `hardware/case/standard/plate_dividers.stl` | Internal dividers and sliders |
| `hardware/case/knobs/knobs_15mm.stl` | Knobs for 15mm encoder shafts |
| `hardware/case/knobs/knobs_20mm.stl` | Knobs for 20mm encoder shafts (the BOM reference part is 20mm) |

For full print settings, bonding steps, and assembly photos, follow the current detailed guide:

[Open the 3D print build steps](../../../BUILD_GUIDE.md#2-3d-printing)

## One-Piece Option (Large Bed)

If you have a large-format printer (~330 mm+ bed, e.g. Bambu H2S-class), a single-piece snap-fit version of the enclosure is available — no bonding step.

- **Current (v2.x) PCB:** print `hardware/case/oneshot/oneshot_v2_part1.stl` + `oneshot_v2_part2.stl`.
- **v3.0 board (work-in-progress):** `hardware/case/oneshot/v3-wip/` is dimensioned for the upcoming v3.0 board and will **not** fit a v2.x PCB — don't print it if you have a current board.

Knob caps are printed separately (not part of the one-piece case) from the standalone knob STL matching your encoder shaft, in black. A 5-part split for 256 mm beds is in testing. See [hardware/case/README.md](../../../hardware/case/README.md) for details.

## Planned Alternative

A laser-cut enclosure path is planned. The goal is to keep the same overall external shape and dimensions while making the build cheaper and more accessible for people without a large 3D printer.
