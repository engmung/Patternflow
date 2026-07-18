# 3D Printed Enclosure

Status: supported now.

This path uses the current PLA enclosure files in `hardware/case/`, organized by printer bed size for the **v3.0 board**. The reference print was made on a Bambu P1S with standard PLA.

## Files

| File | Contents |
| --- | --- |
| `hardware/case/bed_330mm/oneshot_v3_part1/2.stl` | One-piece snap-fit body — H2S-class (330 mm+) beds |
| `hardware/case/bed_256mm/divided_v3_part1..5.stl` | Divided snap-fit, 5 parts — P1S-class (256 mm) beds, print/assembly tested ([#169](https://github.com/engmung/Patternflow/issues/169)) |
| `hardware/case/knobs/knobs_15mm.stl` | Knobs for 15mm encoder shafts |
| `hardware/case/knobs/knobs_20mm.stl` | Knobs for 20mm encoder shafts (the BOM reference part is 20mm) |

Building for a **v2.x board**? Its case files moved to `hardware/case/legacy_v2/`; follow the [v2.1.0 build guide](https://github.com/engmung/Patternflow/blob/v2.1.0/BUILD_GUIDE.md) instead.

For full print settings, bonding steps, and assembly photos, follow the current detailed guide:

[Open the 3D print build steps](../../../BUILD_GUIDE.md#4-3d-printing)

Knob caps are printed separately (not part of the body) from the standalone knob STL matching your encoder shaft, in black. See [hardware/case/README.md](../../../hardware/case/README.md) for the full option matrix and assembly watch-outs.

## Planned Alternative

A laser-cut enclosure path is planned. The goal is to keep the same overall external shape and dimensions while making the build cheaper and more accessible for people without a large 3D printer.
