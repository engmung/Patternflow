# Custom PCB Electronics

Status: supported now.

This path uses the custom Patternflow KiCad PCB in `hardware/pcb/`, populated by hand. It is the most polished electronics path currently documented.

## What This Path Means

- Order the Patternflow PCB — easiest via the [PCBWay shared project](https://www.pcbway.com/project/shareproject/Patternflow_An_LED_synthesizer_776d796c.html) (no Gerber upload), or from any fab with the Gerber zip below.
- Hand-solder the through-hole parts (the v3.9 board has no surface-mount parts at all).
- Mount the ESP32-S3 module on female headers.
- Power comes in via `J4`, the back-side 2-pin screw terminal — strip a USB cable, screw the wires in, done. It is the board's only power input: v3.0's USB-C footprint was withdrawn after a delayed burnout ([#221](https://github.com/engmung/Patternflow/issues/221)) and v3.9 no longer carries it (see [BUILD_GUIDE.md §2](../../../BUILD_GUIDE.md#2-power-input--use-the-screw-terminal)).

The custom PCB path pairs with the current [3D printed enclosure](../enclosure/3d-print.md).

## Files

| File | Purpose |
| --- | --- |
| `hardware/pcb/kicad/` | Editable KiCad source |
| `hardware/pcb/gerber/patternflow_v3.9_gerber.zip` | Current production Gerber — v3.0 ([#114](https://github.com/engmung/Patternflow/issues/114)) with the USB-C input removed |
| `hardware/bom/bom_v3.9.csv` | Machine-readable BOM (every part by MPN) |
| `hardware/pcb/schematic.pdf` | Schematic PDF |

For the exact BOM, soldering order, wiring, and first boot checks, follow the current detailed guide:

[Open the PCB assembly guide](../../../BUILD_GUIDE.md#5-pcb-assembly)

## Alternative — Breadboard

Don't want to order a PCB? The [breadboard / jumper-wire path](https://patternflow.work/build/breadboard) is available now — same core parts and firmware, no PCB and no soldering iron.
