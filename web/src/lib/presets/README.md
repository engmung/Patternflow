# src/lib/presets/

The Live Editor's preset library: one JavaScript pattern per file, registered in `index.ts`. This folder is the **source of truth** for the firmware's curated presets — each `pattern-<slug>.ts` has a twin `firmware/patternflow/presets/preset_<slug>.h`, generated from the JS here, and `firmware/toolchain/check_presets.py` fails CI when the two sets drift (its `WEB_ONLY` list is the deliberate exceptions). The firmware side is described in [`firmware/patternflow/presets/README.md`](../../../../firmware/patternflow/presets/README.md).

**The set is curated by the maintainer.** A pattern someone makes is published from the [Pattern Lab](https://patternflow.work/pattern-lab) to the Community, not added here.

- `_TEMPLATE.ts` — the skeleton a new preset is copied from; keep the SPDX / author / lineage comment block at the top of `code`, because it survives into the generated header.
- `index.ts` — the registry; sorted by pattern number.
- `types.ts` — `LivePreset`. `kind: 'custom'` marks a pattern that is not one of the numbered presets.
- Files are named by the date the pattern was made (`pattern-0510.ts`), which is also the sort key and the firmware slug, so they are not renamed.

Adding one (maintainer): copy `_TEMPLATE.ts`, register it in `index.ts`, generate the `.h` twin (Pattern Lab → *Copy C++ prompt*, or `port_preset.py` from the header side), run `python firmware/toolchain/check_presets.py`, then `python firmware/toolchain/make_pack.py` to rebuild the Basics pack. The full pattern-system map is [`web/ARCHITECTURE.md`](../../../ARCHITECTURE.md#pattern-system).

License: CC BY-SA 4.0 per file — artwork, not code.
