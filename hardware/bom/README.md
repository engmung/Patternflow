# Bill of Materials

Machine-readable BOMs for the Patternflow board and build. **The CSV is the source of truth** — the build guide's parts table is derived from it. Quantities are per unit (one Patternflow). Prices are deliberately not listed; look parts up by MPN at your distributor.

| File | Board | Status |
|---|---|---|
| `bom_v3.0.csv` | v3.0 (screw-terminal power; USB-C input withdrawn) | ✅ Board fabricated, assembled, and verified on the screw-terminal input ([#114](https://github.com/engmung/Patternflow/issues/114)). Order `hardware/pcb/gerber/patternflow_v3.0_gerber.zip`. |

For a v2.x build, use the BOM inside the [v2.1.0 release build guide](https://github.com/engmung/Patternflow/blob/v2.1.0/BUILD_GUIDE.md#1-bill-of-materials-bom).

## v3.0 at a glance

Seven on-board line items to populate, all through-hole and hand-solderable — every SMD passive from v2.x is gone, and the one SMD-shell part (the USB-C receptacle) is no longer part of the build.

**Power input: the `J4` screw terminal, on every build.** Strip a USB cable, clamp the two wires in, done — no soldering iron needed for the power input.

> 🛑 **Do not populate `USB1`, `R1`, or `R2`.** The USB-C input is **unreliable on this board revision and has been withdrawn from the build** — don't buy those parts. On top of the reliability problem, a solder bridge across the tight-pitch Type-C pins shorts +5 V to ground and has already burned a board ([#114](https://github.com/engmung/Patternflow/issues/114)). A future revision will revisit USB-C; for now the footprint stays empty.

## Sourcing notes

- **Every part is specified by manufacturer part number (MPN).** Order from Mouser/DigiKey (or find the same MPN elsewhere). The one exception:
- **LED matrix panel — buy via this link:** [Full color 320×160mm P2.5 HUB75 — AliExpress](https://s.click.aliexpress.com/e/_c3SVdcQr) (affiliate link — supports Patternflow development at no extra cost). LED panels have no meaningful MPNs, and this specific listing's **mounting-screw positions are known to match the case**. Other panels may work electrically (driver IC must be 74HC595 / FM6126A / FM6124 — see the [panel compatibility warning](../../BUILD_GUIDE.md)) but are not yet verified mechanically; broader panel compatibility is planned.
- **USB-C connector**: 🛑 **not part of the build** — don't order it. The `USB1` input is withdrawn (see above).
- **ESP32-S3**: Espressif is the reference part; AliExpress modules generally work fine too. If yours won't cold-boot reliably, the on-module 10k GPIO0 pullup fix in [#16](https://github.com/engmung/Patternflow/issues/16) solves it — one resistor.
- **Encoders**: any 5-pin EC11 with a push switch works — the cheapest packs just fail more often. The Bourns PEC11R is the reference part; note the firmware assumes its direction ([`config.h`](../../firmware/patternflow/config.h)).

## Column reference

`category` pcb / off-board · `ref` PCB reference designator (`-` = no refdes) · `qty` per unit · `mounting` how it attaches · `optional` `no` (required) / `do-not-populate` (withdrawn — leave the pads empty) · `notes` assembly-critical warnings — read before soldering.
