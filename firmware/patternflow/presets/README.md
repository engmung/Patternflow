# presets/

The curated patterns, as C++ headers. `preset_origin.h` is the one compiled into every firmware image — the failsafe a board can always boot into. The rest are built into `.pfm` modules by `firmware/toolchain/make_pack.py` and ship as the **Basics pack** (`web/public/packs/`), which a new board installs in one click. `presetPatterns[]` in [`../pattern_registry.h`](../pattern_registry.h) decides what is compiled in; [`../README.md`](../README.md) explains the registry.

**This set is curated by the maintainer.** Patterns are not contributed here: they are made in the [Pattern Lab](https://patternflow.work/pattern-lab) and published to the Community, where every Patternflow can play them. [`../../CUSTOM_PATTERNS.md`](../../CUSTOM_PATTERNS.md) is the hands-on route for your own board.

## Twins

Every header here has a JavaScript twin in `web/src/lib/presets/`, and **the JavaScript is the source of truth**: the header is generated from it (the Pattern Lab's *Copy C++ prompt* flow, or `firmware/toolchain/port_preset.py` in the other direction). `firmware/toolchain/check_presets.py` runs in CI and fails when the two sets drift. Its `WEB_ONLY` list names the web presets that deliberately have no header — the ones that missed frame budget on the real ESP32, and the ones posted after the module loader made a compiled-in showcase unnecessary; delete an entry there the day its header lands. `preset_calib.h` is the display-calibration pattern and has no web twin on purpose.

## Names

Most files are named by the date the pattern was made (`preset_0510.h` is 10 May). That name is also the site's sort key and the module's slug, so **files are not renamed**. The pattern's display name, author and license are in the header comment of each file (`// Pattern:`, `// Author:`, `// SPDX-License-Identifier:`), and `make_pack.py` reads them from there; there is deliberately no hand-kept table of them, because the last one fell thirteen entries behind.

## License

CC BY-SA 4.0, per-file SPDX header — these are artwork, not code, even though they sit in a code folder. See [`docs/LICENSE-SUMMARY.md`](../../../docs/LICENSE-SUMMARY.md).
