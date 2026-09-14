# firmware/modules/

The module toolchain's working folder, **not a place patterns are contributed to**. A pattern is made in the [Pattern Lab](https://patternflow.work/pattern-lab) and published to the Community; it never needs to be in this repository. If you are looking for where patterns live, that is [`../../PATTERN_GUIDE.md`](../../PATTERN_GUIDE.md).

What happens here:

- `python firmware/toolchain/port_preset.py --all` converts the curated presets in `../patternflow/presets/` into freestanding module sources, one folder each: `<slug>/pattern.cpp` and `<slug>/module.json`. The build service that turns a Pattern Lab pattern into a `.pfm` runs the same script with `--out-dir`, so a submitted pattern never lands in the tree.
- `python firmware/toolchain/build_module.py --all` compiles every folder here into `../patternflow/data/patterns/<slug>.pfm` (gitignored), which `pio run -t uploadfs` can write to a panel's FATFS partition over USB. The everyday route is Wi-Fi: the panel's `/patterns` page, or the site.
- `python firmware/toolchain/make_pack.py` bundles built modules into the Basics pack (`web/public/packs/`). It refuses a module whose `module.json` has no real `author`.

A module folder is `pattern.cpp` plus `module.json` with `name`, `namespace`, `author`, `license`, `abi` and `knobs`. The generated outputs are gitignored (`.build/`, `data/patterns/`); the folders themselves are only committed when something needs a checked-in example, and today nothing does. The loader's `.init_array` regression probe lives in `../toolchain/tests/modules/_ctor_probe/`.
