# Bill of Materials

Machine-readable BOMs for the Patternflow board and build. **The CSV is the source of truth** — the build guide's parts table is derived from it. Quantities are per unit (one Patternflow). Prices are deliberately not listed; look parts up by MPN at your distributor.

| File | Board | Status |
|---|---|---|
| `bom_v3.0.csv` | v3.0 (hybrid power: USB-C + screw-terminal bypass) | ✅ Board fabricated, assembled, and verified ([#114](https://github.com/engmung/Patternflow/issues/114)). Order `hardware/pcb/gerber/patternflow_v3.0_gerber.zip`. |

For a v2.x build, use the BOM inside the [v2.1.0 release build guide](https://github.com/engmung/Patternflow/blob/v2.1.0/BUILD_GUIDE.md#1-bill-of-materials-bom).

## v3.0 at a glance

Nine on-board line items, all hand-solderable. The only SMD part is the USB-C connector shell; every SMD passive from v2.x is gone.

**Choose your power path before ordering:**

| Path | Populate | Skill level |
|---|---|---|
| **A — USB-C** (`USB1` + `R1`/`R2`) | USB-C receptacle + two 5.1kΩ CC pull-downs | ⚠️ Hard. The Type-C THT signal pins are tightly pitched; a solder bridge here has shorted and burned a board ([#114](https://github.com/engmung/Patternflow/issues/114)). Recommended only with flux, a fine tip, and patience. |
| **B — Screw terminal** (`J4`, back of board) | One extra screw terminal; strip a USB cable and screw the wires in | Easy — the classic v2.x method. Skip `USB1`, `R1`, `R2` entirely. |

Both footprints are on the same board; populating both is fine too.

## Sourcing notes

- **Every part is specified by manufacturer part number (MPN).** Order from Mouser/DigiKey (or find the same MPN elsewhere). The one exception:
- **LED matrix panel — buy via this link:** [Full color 320×160mm P2.5 HUB75 — AliExpress](https://s.click.aliexpress.com/e/_c3SVdcQr) (affiliate link — supports Patternflow development at no extra cost). LED panels have no meaningful MPNs, and this specific listing's **mounting-screw positions are known to match the case**. Other panels may work electrically (driver IC must be 74HC595 / FM6126A / FM6124 — see the [panel compatibility warning](../../BUILD_GUIDE.md)) but are not yet verified mechanically; broader panel compatibility is planned.
- **USB-C connector**: listed at LCSC as `C5187475` (SHOU HAN), and plenty of retail sites carry the same part — search **"TYPE-C 14P CC-2.6"**. Only needed on the USB-C power path.
- **ESP32-S3**: Espressif is the reference part; AliExpress modules generally work fine too. If yours won't cold-boot reliably, the on-module 10k GPIO0 pullup fix in [#16](https://github.com/engmung/Patternflow/issues/16) solves it — one resistor.
- **Encoders**: any 5-pin EC11 with a push switch works — the cheapest packs just fail more often. The Bourns PEC11R is the reference part; note the firmware assumes its direction ([`config.h`](../../firmware/patternflow/config.h)).

## Column reference

`category` pcb / off-board · `ref` PCB reference designator (`-` = no refdes) · `qty` per unit · `mounting` how it attaches · `optional` `yes` / `no` / `see notes` (depends on chosen power path) · `notes` assembly-critical warnings — read before soldering.
