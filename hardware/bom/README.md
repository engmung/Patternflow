# Bill of Materials

Machine-readable BOMs for the Patternflow board and build. **The CSV is the source of truth** — the build guide's parts table is derived from it. Quantities are per unit (one Patternflow). Prices are deliberately not listed; look parts up by MPN at your distributor.

| File | Board | Status |
|---|---|---|
| `bom_v3.9.csv` | v3.9 (screw-terminal power only) | ✅ **Use this.** Same parts as v3.0 minus the USB-C receptacle and its two CC pull-downs, which the board no longer has a footprint for. Order `hardware/pcb/gerber/patternflow_v3.9_gerber.zip`. |
| `bom_v3.0.csv` | v3.0 (screw-terminal power; USB-C footprint on hold) | Previous revision — fabricated, assembled, and verified on the screw-terminal input. Kept for anyone who already has a v3.0 board; `USB1`/`R1`/`R2` stay unpopulated on it ([#221](https://github.com/engmung/Patternflow/issues/221)). |

For a v2.x build, use the BOM inside the [v2.1.0 release build guide](https://github.com/engmung/Patternflow/blob/v2.1.0/BUILD_GUIDE.md#1-bill-of-materials-bom).

## v3.9 at a glance

Seven on-board line items, all through-hole and hand-solderable. Every SMD passive went away with v2.x, and v3.9 drops the last surface-mount part on the board — the USB-C receptacle's shell — so **nothing you solder is surface-mount**, and there is no part on the BOM you're told not to populate.

**Power input: the `J4` screw terminal, on every build.** Strip a USB cable, clamp the two wires in, done — no soldering iron needed for the power input.

> 📦 **Already have a v3.0 board?** Use `bom_v3.0.csv` and leave `USB1`, `R1`, and `R2` unpopulated — those parts are not needed and should not be bought. The USB-C input was withdrawn from service after a USB-C-powered board ran fine for 20–30+ minutes and then smoked at a connector pin, destroying the receptacle and power path ([#221](https://github.com/engmung/Patternflow/issues/221)). The failure is *delayed*, so a board that seems fine at first proves nothing. v3.9 removes the footprint so the question can't come up again.

## Sourcing notes

- **Every part is specified by manufacturer part number (MPN).** Order from Mouser/DigiKey (or find the same MPN elsewhere). The one exception:
- **LED matrix panel — buy via this link:** [Full color 320×160mm P2.5 HUB75 — AliExpress](https://s.click.aliexpress.com/e/_c3SVdcQr) (affiliate link — supports Patternflow development at no extra cost). LED panels have no meaningful MPNs, and this specific listing's **mounting-screw positions are known to match the case**. Other panels may work electrically — the driver IC must be a classic shift-register type, and "HUB75E" on the listing proves nothing; read **[LED Panel Compatibility](../../docs/panel-compatibility.md)** before ordering — but are not yet verified mechanically.
- **ESP32-S3**: Espressif is the reference part; AliExpress modules generally work fine too. If yours won't cold-boot reliably, the on-module 10k GPIO0 pullup fix in [#16](https://github.com/engmung/Patternflow/issues/16) solves it — one resistor.
- **Encoders**: any 5-pin EC11 with a push switch works — the cheapest packs just fail more often. The Bourns PEC11R is the reference part; note the firmware assumes its direction ([`config.h`](../../firmware/patternflow/config.h)).

## Column reference

`category` pcb / off-board · `ref` PCB reference designator (`-` = no refdes) · `qty` per unit · `mounting` how it attaches · `optional` `no` (required — every line in `bom_v3.9.csv` is) · `notes` assembly-critical warnings — read before soldering.
