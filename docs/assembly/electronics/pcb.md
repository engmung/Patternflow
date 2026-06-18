# Custom PCB Electronics

Status: supported now.

This path uses the custom Patternflow KiCad PCB in `hardware/pcb/`, populated by hand. It is the most polished electronics path currently documented.

## What This Path Means

- Order the Patternflow PCB from the KiCad/Gerber files.
- Hand-solder the SMD passives and through-hole parts.
- Mount the ESP32-S3 module on female headers.
- Wire the LED matrix and power-bank input through the PCB terminals.

The custom PCB path pairs with the current [3D printed enclosure](../enclosure/3d-print.md).

## Files

| File | Purpose |
| --- | --- |
| `hardware/pcb/kicad/` | Editable KiCad source |
| `hardware/pcb/gerber/patternflow_v2.0_gerber.zip` | Current production Gerber |
| `hardware/pcb/schematic.pdf` | Schematic PDF |

For the exact BOM, soldering order, wiring, and first boot checks, follow the current detailed guide:

[Open the PCB assembly guide](../../../BUILD_GUIDE.md#4-pcb-assembly)

## Planned Alternative

A breadboard / jumper-wire electronics path is planned. It will use the same core parts and firmware, but will not require ordering the PCB.
