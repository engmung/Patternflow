# 3D Printed Enclosure

Status: supported now.

This path uses the current PLA enclosure files in `hardware/case/print-ready/`. The reference print was made on a Bambu P1S with standard PLA.

## Files

| File | Contents |
| --- | --- |
| `hardware/case/print-ready/01_plate_main.stl` | Main body and back panel |
| `hardware/case/print-ready/02_plate_dividers.stl` | Internal dividers and sliders |
| `hardware/case/print-ready/03_plate_knobs_15mm.stl` | Knobs for recommended 15mm encoder shafts |
| `hardware/case/print-ready/03_plate_knobs.stl` | Knobs for alternate 20mm encoder shafts |

For full print settings, bonding steps, and assembly photos, follow the current detailed guide:

[Open the 3D print build steps](../../../BUILD_GUIDE.md#2-3d-printing)

## One-Piece Option (Large Bed)

If you have a large-format printer (~330 mm+ bed, e.g. Bambu H2S-class), `hardware/case/print-ready/oneshot/` contains a single-piece snap-fit version of the enclosure — no bonding step. A 5-part split for 256 mm beds is in testing. See [hardware/case/README.md](../../../hardware/case/README.md) for details.

## Planned Alternative

A laser-cut enclosure path is planned. The goal is to keep the same overall external shape and dimensions while making the build cheaper and more accessible for people without a large 3D printer.
