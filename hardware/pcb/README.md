# Patternflow PCB

Custom board for the Patternflow LED synthesizer — ESP32-S3 DevKit on sockets, four EC11 encoders, HUB75 out, screw-terminal power input. KiCad 10 project.

**Current revision: v3.9** — the USB-C power footprint is gone. v3.0 carried a `USB1` receptacle and its `R1`/`R2` CC pull-downs that had to be left unpopulated after a delayed burnout ([#221](https://github.com/engmung/Patternflow/issues/221)); v3.9 removes them from the board outright, so there is exactly one power input and no way to pick the wrong one. Board outline, mounting holes, and every remaining footprint are unchanged from v3.0 — **the v3 cases fit both boards**. All through-hole, no SMD parts at all; every part is listed by MPN in the [BOM](../bom/).

## Board

| Front | Back |
| :---: | :---: |
| <img src="images/board_render_top.png" alt="Patternflow v3.9 board — front" width="380" /> | <img src="images/board_render_bottom.png" alt="Patternflow v3.9 board — back" width="380" /> |

- **U1** — ESP32-S3 DevKit (N16R8) on 2× 1×22 female sockets; the DevKit itself is never soldered
- **SW1–SW4** — EC11 rotary encoders, inserted from the **back** (silkscreen reminds you: *encoder facing other side*)
- **J1** — 2×8 box header; the panel's HUB75 ribbon plugs in here
- **Power — J4**: a 2-pin screw terminal on the back, and the board's only power input. Strip a USB cable from any power bank and screw the wires in. (v3.0 also had a USB-C receptacle; it was withdrawn from service after a delayed burnout at a connector pin, [#221](https://github.com/engmung/Patternflow/issues/221), and v3.9 carries no USB-C footprint at all)
- **J3** — +5V out to the LED matrix · **C11** — 1000µF bulk cap for the boot transient

## Schematic

<img src="images/schematic.svg" alt="Patternflow v3.9 schematic" width="820" />

Also available as [`schematic.pdf`](schematic.pdf) (no KiCad required).

## Ordering

The board is listed as a [PCBWay shared project](https://www.pcbway.com/project/shareproject/Patternflow_An_LED_synthesizer_776d796c.html) — ordering there needs no Gerber upload and supports Patternflow development. Any fab works, though: upload [`gerber/patternflow_v3.9_gerber.zip`](gerber/) to the fab of your choice (JLCPCB tends to be the cheapest).

| Gerber | Status |
|---|---|
| `patternflow_v3.9_gerber.zip` | ✅ **Order this** — current. Same board as v3.0 with the USB-C input removed |
| `patternflow_v3.0_gerber.zip` | Previous revision — fabricated, assembled, and verified ([#114](https://github.com/engmung/Patternflow/issues/114)). Fits the same cases; only order it if you specifically want the USB-C footprint, which must stay unpopulated ([#221](https://github.com/engmung/Patternflow/issues/221)) |
| `patternflow_v2.1_gerber.zip` | Legacy — last v2.x board. Only for [v2 builds](https://github.com/engmung/Patternflow/releases/tag/v2.1.0); **does not fit the v3 cases** |
| `patternflow_v1.0_gerber.zip` / `v2.0` | Archived early revisions |
| `gerber/experiment/` | Unverified WIP — never order from here |

## Folder layout

- `kicad/` — editable KiCad 10 source (`patternflow.kicad_pro/sch/pcb` + local footprint/3D libs)
- `gerber/` — fab-ready zips, one per revision
- `images/` — renders + schematic export for this README
- `schematic.pdf` — printable schematic

## Regenerating outputs

After editing the KiCad source (paths relative to `hardware/pcb/`):

```sh
# Gerbers + drill (matches the repo zip convention: 14 files, fab layers only)
kicad-cli pcb export gerbers --no-protel-ext \
  --layers F.Cu,B.Cu,F.Paste,B.Paste,F.Silkscreen,B.Silkscreen,F.Mask,B.Mask,Edge.Cuts \
  -o out/ kicad/patternflow.kicad_pcb
kicad-cli pcb export drill --excellon-separate-th --generate-map --map-format gerberx2 -o out/ kicad/patternflow.kicad_pcb

# Schematic PDF + SVG
kicad-cli sch export pdf -o schematic.pdf kicad/patternflow.kicad_sch
kicad-cli sch export svg -e -o images/ kicad/patternflow.kicad_sch

# Board renders
kicad-cli pcb render --side top    --quality high -w 1600 -h 1200 -o images/board_render_top.png    kicad/patternflow.kicad_pcb
kicad-cli pcb render --side bottom --quality high -w 1600 -h 1200 -o images/board_render_bottom.png kicad/patternflow.kicad_pcb
```

## License

CC-BY-SA 4.0 — see the root [LICENSE-CC-BY-SA](../../LICENSE-CC-BY-SA).
