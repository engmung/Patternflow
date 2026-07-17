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

<!-- TODO: render the CSV as a human-readable table here (script or manual), split into: PCB parts / off-board parts. -->

Key sourcing rules (details in the BOM README):

- **LED matrix panel: buy via the linked AliExpress listing** — its mounting-screw positions are the verified match for the case, and the driver IC must be 74HC595 / FM6126A / FM6124 (GCLK "video wall" panels stay dark).
- **ESP32-S3: genuine Espressif only** (clone modules correlate with cold-boot issues, [#16](https://github.com/engmung/Patternflow/issues/16)).
- **Encoders: avoid budget AliExpress EC11 packs.** Reference part: Bourns PEC11R-4220F-S0024 (20mm shaft — print the matching knob file).
- **USB-C connector is LCSC-only** (`C5187475`) — only needed if you take the USB-C power path.

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
| **256 mm** (P1S / X1C / A1 class) | `bed_256mm/divided_v3_part1..5.stl` | 5-part divided snap-fit. Print & assembly verified ([#169](https://github.com/engmung/Patternflow/issues/169)). |
| **~330 mm+** (H2S class) | `bed_330mm/oneshot_v3_part1/2.stl` | One-piece snap-fit — fewer parts, no LED-mount gluing. |
| Everyone | `knobs/knobs_20mm.stl` (or `_15mm` to match your encoders) | **Black** PLA; all bodies in **white** |

### Print settings

- Nozzle 0.4 mm, layer height 0.2 mm, standard supports (not tree), brim off, aux fan ~20% (Bambu P1S default profile works as-is)
- <!-- TODO: per-part orientation table + plate screenshots for the 5 divided parts and the 2 oneshot parts. -->
- <!-- TODO: print time estimates per part. -->

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
<!-- TODO: ESP32 pin reference table — carry over from v2 guide and re-verify against the v3 netlist. -->
<!-- TODO: GPIO0 note — v3 board has no R13 pullup pad; carry over the on-module fix note from v2 guide §10 / #16 if it still applies to genuine modules. -->

Don't plug the ESP32 DevKit in until after the first power check (Section 7).

## 6. Case Assembly

### 256 mm (divided) path

Verified sequence from [#169](https://github.com/engmung/Patternflow/issues/169):

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

The easiest path is the **browser flasher** at [patternflow.work](https://patternflow.work) (Chrome/Edge, USB data cable to the DevKit's USB port). Wi-Fi can be provisioned from the browser too (Improv-Serial).

Alternatives: Arduino IDE wired upload, or ArduinoOTA after the first Wi-Fi join — see [`firmware/README.md`](firmware/README.md).

<!-- TODO: confirm the flasher ships a v3-tagged build; any config.h differences for v3 (PANEL_PROFILE etc.) -->

## 9. Final Checks

1. Panel lights up with the default pattern (Origin).
2. All four knobs respond; K4 long-press enters pattern select.
3. <!-- TODO: full checklist carried over from v2 guide §9, re-verified on v3. -->

## 10. Known Issues & Design Notes

- **Tight LED panel fit / seam gaps / mount-part bond** — see Section 6 watch-outs ([#169](https://github.com/engmung/Patternflow/issues/169)).
- **USB-C THT soldering difficulty** — the reason Path A exists ([#114](https://github.com/engmung/Patternflow/issues/114)).
- **C11 (1000µF bulk cap) retained** — Patternflow is power-bank-powered; the cap stabilizes the boot transient. Designing a desktop-USB derivative? Drop it to ≤50µF.
- <!-- TODO: LED matrix alignment-bump trimming (#4) — confirm whether the v3 cases still need it. -->
- <!-- TODO: carry over encoder-direction firmware note; anything newly discovered during v3 verification builds. -->

---

**Want custom patterns?** After building, see [`firmware/CUSTOM_PATTERNS.md`](firmware/CUSTOM_PATTERNS.md) and the Live Editor at [patternflow.work](https://patternflow.work).

*Licenses: firmware & web MIT; hardware & designs CC-BY-SA 4.0.*
