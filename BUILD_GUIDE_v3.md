# Patternflow v3.0.0 -- Build Guide

> 🚧 **DRAFT.** This guide is being written for the v3.0 board. The structure is final; sections marked `TODO` still need content and photos. Building a **v2.x** board? Use the [v2.1.0 build guide](https://github.com/engmung/Patternflow/blob/v2.1.0/BUILD_GUIDE.md) — v2 and v3 parts are **not** interchangeable.

This guide walks you through building a Patternflow v3.0.0 from scratch. It assumes basic familiarity with through-hole soldering and 3D printing.

**What's new in v3** (vs. v2.x):

- **USB-C power**, with a screw-terminal bypass on the back of the board if you'd rather skip the tricky Type-C soldering
- **No SMD passives** — every part you solder is through-hole
- **Snap-fit enclosure** — no more gluing body halves (the 256 mm version glues one LED-mount part; that's it)
- Smaller board. **v2.x boards do not fit v3 cases, and vice versa.**

## Table of Contents

1. [Bill of Materials](#1-bill-of-materials-bom)
2. [Choose Your Power Path](#2-choose-your-power-path)
3. [Order the PCB](#3-order-the-pcb)
4. [3D Printing](#4-3d-printing)
5. [PCB Assembly](#5-pcb-assembly)
6. [Case Assembly](#6-case-assembly)
7. [Wiring & First Power-Up](#7-wiring--first-power-up)
8. [Firmware](#8-firmware)
9. [Final Checks](#9-final-checks)
10. [Known Issues & Design Notes](#10-known-issues--design-notes)

---

## 1. Bill of Materials (BOM)

The authoritative parts list is [`hardware/bom/bom_v3.0.csv`](hardware/bom/bom_v3.0.csv) — every part specified by manufacturer part number. Read the [BOM README](hardware/bom/README.md) for sourcing notes before ordering.

### On the board

| Ref | Qty | Part | Spec | MPN (Manufacturer) | Notes |
| --- | --- | --- | --- | --- | --- |
| U1 | 1 | ESP32-S3 DevKit | N16R8, 44-pin, 25.4mm row spacing | ESP32-S3-DevKitC-1-N16R8 (Espressif) | AliExpress modules are usually fine too (see the GPIO0 note, §5). Plugs into sockets — never soldered. |
| — | 2 | Female pin socket | 1×22, 2.54mm | PPPC221LFBN-RC (Sullins) | Soldered into the U1 rows; the DevKit rides on top. |
| SW1–SW4 | 4 | Rotary encoder w/ switch | EC11, 5-pin, 20mm shaft | PEC11R-4220F-S0024 (Bourns) | Insert from the **back** of the board. Cheap EC11 packs work but fail more often. |
| USB1 | 1 | USB-C receptacle | 14P CC-2.6, THT signal pins | TYPE-C 14P CC-2.6 (SHOU HAN, LCSC C5187475) | **Path B only.** ⚠️ Hard to solder — see Section 2. |
| R1, R2 | 2 | Resistor 5.1kΩ | 1/4W axial THT | generic | **Path B only.** USB-C CC pull-downs. |
| J1 | 1 | Box header | 2×8, 2.54mm, vertical | 61201621621 (Würth) | HUB75 ribbon from the panel plugs in here. Match silkscreen orientation. |
| J3 | 1 | Screw terminal | 2-pin, 5.0mm | TB002-500-02BE (CUI Devices) | +5V out to the panel. Every build needs it. |
| J4 | 1 | Screw terminal | 2-pin, 5.0mm | TB002-500-02BE (CUI Devices) | **Path A only.** Power-input bypass, back of board. |
| C11 | 1 | Electrolytic cap | 1000µF 16V, radial D10×L13 | 16PX1000MEFC10X12.5 (Rubycon) | **Observe polarity.** |

### Off the board

| Qty | Part | Notes |
| --- | --- | --- |
| 1 | LED matrix panel — HUB75, 128×64, P2.5, 320×160mm | **Buy this one: [Full color 320×160mm P2.5 HUB75 — AliExpress](https://s.click.aliexpress.com/e/_c3SVdcQr)** (affiliate link — supports Patternflow at no extra cost). Its mounting-screw positions are the verified match for the case, and it ships with the ribbon + power cable you'll use. |
| 6 | M4 screw, ~10mm | Panel mounting — **sized for the linked panel.** Using a different panel? Buy whatever screws *its* mounting holes take (and see the `for_other_panels/` case note in Section 4). |
| 1 | USB-C cable *(Path B)* or sacrificial USB cable *(Path A — it gets cut)* | Power feed |
| 1 | USB power bank, 5V | Must fit the case compartment |

Key sourcing rules (details in the BOM README):

- **LED matrix panel: buy via the AliExpress link above** — the case is dimensioned around that exact listing. Going off-list? The driver IC must be 74HC595 / FM6126A / FM6124 (GCLK "video wall" panels — FM6363C/FM6373C, "3840Hz", "needs a receiving card" — stay completely dark), and your panel's screw positions may differ from the case.
- **ESP32-S3**: Espressif is the reference part, but AliExpress modules are usually fine — if yours hits the cold-boot issue, one 10k resistor fixes it ([#16](https://github.com/engmung/Patternflow/issues/16)).
- **Encoders**: any 5-pin EC11 with a push switch works — the cheapest packs just fail more often. Reference part: Bourns PEC11R-4220F-S0024 (20mm shaft — print the matching knob file).
- **USB-C connector**: LCSC `C5187475`, and many retail sites carry the same part — search "TYPE-C 14P CC-2.6". Only needed if you take the USB-C power path.

### What you also need (not in BOM)

- 3D printer (256 mm bed is enough — see Section 4)
- White and black PLA filament
- Soldering iron, solder, flux, tweezers
- Wire cutters, Phillips screwdriver, small flathead (screw terminals)
- Putty or baking soda + CA glue (seam filling, Section 6)
- CA glue for the LED-mount part (256 mm case only)

## 2. Choose Your Power Path

The v3.0 board has **two power inputs on one board**. Pick one before ordering parts — it changes what you solder.

| | **Path A — Screw terminal (default)** | **Path B — USB-C (advanced)** |
|---|---|---|
| Populate | `J4` (2-pin screw terminal, back of board) | `USB1` (Type-C) + `R1`/`R2` (5.1kΩ CC pull-downs) |
| Power cable | Any USB cable, stripped, wires screwed in | Standard USB-C cable |
| Difficulty | Easy — the classic Patternflow method | ⚠️ **Hard.** The Type-C THT signal pins are tightly pitched; a solder bridge here has shorted and **burned a board** ([#114](https://github.com/engmung/Patternflow/issues/114)). Flux, fine tip, magnification, patience. |

**If in doubt, take Path A.** The result is electrically identical. You can also populate both.

<!-- TODO: photo of both populated inputs side by side. #114 has the burned-trace photo as a cautionary image. -->

## 3. Order the PCB

Order **`hardware/pcb/gerber/patternflow_v3.0_gerber.zip`** from your preferred fab (or use the KiCad source in `hardware/pcb/kicad/`).

> ⚠️ **v3.0 only.** Do not order v2.1 for this guide — the v2.1 board is a different size and **will not fit the v3 cases**. Anything in `hardware/pcb/gerber/experiment/` is unverified; don't order it either.

<!-- TODO: update the PCBWay shared-project listing to v3.0 and re-link it here. -->

## 4. 3D Printing

Case folders are named by **printer bed size** — see [`hardware/case/`](hardware/case/):

| Your printer bed | Print | Notes |
|---|---|---|
| **256 mm** (P1S / X1C / A1 class) | `bed_256mm/encloser.stl` | **One STL, every part** — body, LED-panel mount, and 20 mm knobs. Split the objects in your slicer: knobs in black, the rest in white. ~10 h total. |
| **~330 mm+** (H2S class) | `bed_330mm/oneshot_v3_part1/2.stl` | One-piece snap-fit — fewer parts. Print knobs separately from `knobs/`. |

> **Using a different LED panel than the BOM link?** Panel suppliers drill mounting holes in different places. Print `bed_256mm/for_other_panels/divided_v3_part1..5.stl` instead — its LED-mount part adjusts to varying bolt-hole positions ([#169](https://github.com/engmung/Patternflow/issues/169)-verified). Even so, check the mount against your panel before committing: a very different hole layout may still not fit.

### Print settings

- Nozzle 0.4 mm, layer height 0.2 mm, standard supports (not tree), brim off, aux fan ~20% (Bambu P1S default profile works as-is)
- <!-- TODO: plate/orientation screenshots for encloser.stl and the oneshot parts. -->

## 5. PCB Assembly

All parts are through-hole. Suggested order (shortest to tallest):

1. `R1`/`R2` — only if taking the USB-C path (skip on Path A)
2. `USB1` Type-C — only on Path B. **Read the warning in Section 2 first.** <!-- TODO: close-up soldering photos, bridge-check procedure with multimeter (VBUS-GND continuity check BEFORE first power). -->
3. Female socket rows (2× 1×22) into the `U1` DevKit rows — **do not solder the DevKit itself**
4. `J1` box header (2×8, HUB75) — orientation must match the silkscreen
5. `J3` screw terminal (5V out to matrix) — and `J4` on the back if taking Path A
6. `C11` 1000µF cap — **observe polarity**
7. `SW1–SW4` encoders — **insert from the BACK side**: bodies on the back, leads soldered on the front

<!-- TODO: annotated board photo (front/back) with populate order. -->

Don't plug the ESP32 DevKit in until after the first power check (Section 7).

### ESP32 pin reference

Extracted from the v3.0 netlist (identical functions to v2.x — the same firmware runs on both):

| # | Pin | Function | | # | Pin | Function |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 3V3 | +3.3V supply | | 23 | GND | GND |
| 2 | 3V3 | NC | | 24 | TX | NC |
| 3 | RST | NC | | 25 | RX | NC |
| 4 | IO4 | ENC1_A | | 26 | IO1 | ENC4_SW |
| 5 | IO5 | ENC2_A | | 27 | IO2 | HUB_CLK |
| 6 | IO6 | ENC3_A | | 28 | IO42 | HUB_R1 |
| 7 | IO7 | ENC4_A | | 29 | IO41 | HUB_G1 |
| 8 | IO15 | ENC2_SW | | 30 | IO40 | HUB_B1 |
| 9 | IO16 | ENC3_B | | 31 | IO39 | HUB_G2 |
| 10 | IO17 | ENC3_SW | | 32 | IO38 | HUB_R2 |
| 11 | IO18 | ENC4_B | | 33 | IO37 | NC (PSRAM internal) |
| 12 | IO8 | ENC1_B | | 34 | IO36 | NC (PSRAM internal) |
| 13 | IO3 | NC | | 35 | IO35 | NC (PSRAM internal) |
| 14 | IO46 | HUB_A | | 36 | IO0 | NC — boot strap (see note) |
| 15 | IO9 | ENC1_SW | | 37 | IO45 | NC |
| 16 | IO10 | ENC2_B | | 38 | IO48 | HUB_C |
| 17 | IO11 | HUB_B | | 39 | IO47 | HUB_LAT |
| 18 | IO12 | HUB_D | | 40 | IO21 | HUB_E |
| 19 | IO13 | HUB_B2 | | 41 | IO20 | NC |
| 20 | IO14 | HUB_OE | | 42 | IO19 | NC |
| 21 | 5V | +5V input | | 43 | GND | GND |
| 22 | GND | GND | | 44 | GND | GND |

> **GPIO0 / cold-boot note.** The v3.0 board leaves GPIO0 unconnected (no pullup pad). Most modules boot reliably that way, but some show cold-boot lockups from the floating strap pin ([#16](https://github.com/engmung/Patternflow/issues/16)). If yours consistently needs a RESET press after power-on, apply the on-module 10k GPIO0→3.3V fix photographed in that issue — one resistor and it's solved.

## 6. Case Assembly

### 256 mm path (`encloser.stl` or `for_other_panels/`)

Sequence verified in [#169](https://github.com/engmung/Patternflow/issues/169):

1. **Match the LED-panel mounting part to your panel.** The mounting part is separate precisely because panel bolt-hole positions vary between suppliers. <!-- TODO: photo (issue #169 step 1). -->
2. Insert the mounting part into the LED panel, then tighten the M4 screws. <!-- TODO: photo (step 2). -->
3. Fit the assembly into the enclosure and glue between the mounting part and the enclosure walls. If some glue reaches the panel itself, that's an acceptable side effect. <!-- TODO: photo (step 3). -->
4. Snap-fit the remaining parts together. <!-- TODO: exact part order for parts 1–5. -->

**Watch-outs (from the verification build):**

- The LED panel insertion is very tight — near-zero clearance. Work it in slowly.
- Flat-printed edges come out slightly rounded, so glued seams can show a small gap. Fill with putty or baking soda + CA glue.
- If the mounting-part bond isn't solid, gripping the enclosure at the LED side can flex the wall and cave the back panel. Let the glue cure fully.

### 330 mm (one-piece) path

1. <!-- TODO: assembly steps — panel mounting, board mounting, snap-fit closing part. Confirm whether the separate LED-mount part concept applies here or the panel mounts directly. -->

### Both paths

- Press-fit the four black knobs onto the encoder shafts (last step, after Section 9 checks pass).
- Power bank sits in the internal compartment. <!-- TODO: confirm compartment/slider design in v3 cases + photo. -->

## 7. Wiring & First Power-Up

1. Connect the HUB75 ribbon from `J1` to the panel's input connector. <!-- TODO: orientation photo. -->
2. Wire `J3` to the panel's power cable (+5V / GND — double-check polarity). <!-- TODO: photo. -->
3. Power: Path A — stripped USB cable into `J4` (red = +5V, black = GND); Path B — USB-C cable into `USB1`.
4. **Before inserting the ESP32:** power up once and check 5V/GND rails. <!-- TODO: exact multimeter checkpoints on the v3 board. -->
5. Power off, seat the ESP32 DevKit in its sockets (orientation per silkscreen), power on.

## 8. Firmware

The easiest path is the **browser flasher** at [patternflow.work](https://patternflow.work) (Chrome/Edge, USB data cable to the DevKit's USB port). Wi-Fi can be provisioned from the browser too (Improv-Serial). **One firmware image serves every board generation** — the pin map is identical on v2.x and v3.0, so there is no board selection to get wrong.

Flash **before** seating the DevKit in the board, then insert it into the sockets with the USB port facing the board edge (silkscreen shows the orientation).

Alternatives — see [`firmware/README.md`](firmware/README.md) for details:

- **Arduino IDE** wired upload. Board settings: *ESP32S3 Dev Module*, PSRAM: *OPI PSRAM*, Flash: *16MB*, USB CDC On Boot: *Disabled*. If your panel's driver IC is FM6126A/FM6124, set `PANEL_PROFILE` to `PANEL_HIGHREFRESH` in `config.h` (default `PANEL_STANDARD` covers 74HC595).
- **ArduinoOTA** over Wi-Fi after the first join — functional, but the flasher and wired upload are the primary paths.

## 9. Final Checks

1. Slide the power bank into its compartment and connect it (Path A: the J4 cable; Path B: USB-C).
2. The panel lights up with the default pattern (Origin) within a second or two.
3. Turn all four knobs — each should visibly change the pattern.
4. Press-click each encoder once; long-press **K4** (~1s) to enter pattern select, rotate to browse, long-press again to exit.
5. Long-press **K1** for the global brightness mode; **K2** long-press shows the OSC info screen.
6. Power-cycle once and confirm it boots cleanly with no RESET press needed (see the GPIO0 note in Section 5 if it doesn't).

## 10. Known Issues & Design Notes

- **Tight LED panel fit / seam gaps / mount-part bond** — see Section 6 watch-outs ([#169](https://github.com/engmung/Patternflow/issues/169)).
- **USB-C THT soldering difficulty** — the reason Path A exists ([#114](https://github.com/engmung/Patternflow/issues/114)).
- **C11 (1000µF bulk cap) retained** — Patternflow is power-bank-powered; the cap stabilizes the boot transient. Designing a desktop-USB derivative? Drop it to ≤50µF.
- **GPIO0 left floating by design** — most modules don't need the pullup; if yours does, it's a one-resistor fix (Section 5 note, [#16](https://github.com/engmung/Patternflow/issues/16)).
- **Encoder direction is handled in firmware** — the default suits the Bourns PEC11R; if your encoders read backwards, set `INVERT_ENCODER` to `1` in `config.h` instead of touching hardware.
- <!-- TODO: LED matrix alignment-bump trimming (#4) — confirm whether the v3 cases still need it. -->

---

**Want custom patterns?** After building, see [`firmware/CUSTOM_PATTERNS.md`](firmware/CUSTOM_PATTERNS.md) and the Live Editor at [patternflow.work](https://patternflow.work).

*Licenses: firmware & web MIT; hardware & designs CC-BY-SA 4.0.*
