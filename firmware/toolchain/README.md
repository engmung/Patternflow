# firmware/toolchain/

The repository-level scripts around the firmware: what builds a module or a pack, what assembles a console page, and the `check_*.py` that CI runs. Each script's docstring is its manual (`python firmware/toolchain/<script>.py --help` or the top of the file); this page only says which is which. (`../patternflow/toolchain/` is a different thing: PlatformIO `extra_scripts`, which must stay sketch-relative.)

**Building things.** `build_module.py` compiles a module folder into a `.pfm` with the Xtensa toolchain; `port_preset.py` turns a curated preset header into a module folder; `make_pack.py` bundles built modules into the shareable Basics pack. `build_clock_glyphs.py` generates the Clock edition's digit glyphs. `release.py` is the two-command release (cut, publish) described in [`docs/RELEASING.md`](../../docs/RELEASING.md).

**Console pages.** The device serves each console page from a C string literal in a header. `console_pages.py` splices `../patternflow/console/*.html` into those headers (`build` to regenerate, `check` in CI); `console_serve.py` previews the pages locally; `build_audio_in_page.py` assembles the `/audio-in` page from the audio extension's editor in `tools/`. How to edit a page is [`../patternflow/console/README.md`](../patternflow/console/README.md).

**Checks.** These are what `firmware-checks.yml` runs on every pull request that touches the firmware, and what you run before pushing:

- the boundary rule — `check_boundaries.py`: the core references no feature, no feature flag, no feature name on a core page (the rule itself is [`docs/EDITIONS.md`](../../docs/EDITIONS.md));
- the frozen host ⇄ module ABI — `check_abi_freeze.py`, `check_module_elf.py`;
- the preset twins — `check_presets.py`: `web/src/lib/presets/` and `../patternflow/presets/` stay in step, with the deliberate exceptions listed inside it;
- versions — `check_versions.py`: the version the firmware reports, the editions, `AGENTS.md`, the flasher manifest and the shelf all agree;
- images — `check_footprint.py` (each edition's size against its baseline);
- host-side unit tests of pure engine code — `check_math.py`, `check_blit.py`, `check_oe.py`, `check_send.py`, `check_thumbs.py`, `check_runtime.py`, `check_network.py`, `check_midi.py`, each compiling and running its twin in `tests/` (`*_test.cpp`) natively, with `--sanitize` for ASan/UBSan;
- `check_sources.py`, a fast pre-compile sanity pass.

`tests/` also holds `modules/_ctor_probe/`, a module that exists only to exercise the loader's `.init_array` path; build it with `build_module.py` and inspect the ELF as its header comment says.

`module.ld` is the linker script every `.pfm` is linked with.
