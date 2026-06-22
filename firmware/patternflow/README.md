# Patterns

Patterns are header-only `.h` files compiled into the firmware and flashed.
There is no runtime/filesystem loading — adding or changing a pattern means a
reflash.

## Two kinds

```
patternflow/
├── custom_<name>.h      ← community / user patterns (the old "dev" slot)
└── presets/
    └── preset_<name>.h  ← curated patterns the project ships as a showcase
```

- **`custom_<name>.h` lives in the sketch ROOT.** The Arduino IDE only shows
  root-folder files as editable tabs, and the whole point is that people can
  write and tweak their own pattern right there in the IDE — so custom patterns
  stay in the root. Includes use `"src/..."`.
- **`presets/preset_<name>.h` lives in the `presets/` subfolder.** Presets are
  curated and not hand-edited in the IDE, so they're tucked away. Because they
  sit one level down, their includes use `"../src/..."` (and `"../config.h"`).

## Source of truth

The **JavaScript pattern in `web/src/lib/presets/` is the source of truth.**
The `.h` here is *generated from it* (Pattern Lab "Copy C++ prompt"). When the
JS changes, regenerate the `.h`. See [`_TEMPLATE.h`](./_TEMPLATE.h) for the
canonical skeleton (metadata header + interface + includes).

Each file starts with a metadata header kept in sync with the JS source:

```cpp
// SPDX-License-Identifier: CC-BY-SA-4.0
// Pattern: Wave Saw
// Author:  engmung
// Source:  https://...            (optional)
// Lineage: original               (or "remixed from @someone's ...")
// Generated from web/src/lib/presets/pattern-wave-saw.ts
```

## Registry

`pattern_registry.h` registers patterns in two clearly separated sections, so
the firmware (and the UI) can tell presets from custom patterns:

```cpp
// -- PRESETS (curated showcase) --
PATTERN_ENTRY(Origin),
PATTERN_ENTRY(WaveSaw),
// -- CUSTOM (community / user) --
PATTERN_ENTRY(SparkMatrix),
...
```

with `NUM_PRESETS` exposed alongside `NUM_PATTERNS` so code can split the list.

> The existing five patterns have been renamed to this convention and the
> registry split into sections. Bringing the rest of the web presets across
> (JS → `.h`) is the remaining conversion work; verify with an Arduino compile.

## Licensing (read before submitting)

Patterns are licensed **CC-BY-SA-4.0** (same commons as the hardware; see
`/LICENSE-CC-BY-SA`). Two simple, community-enforceable rules: **give credit,
and share alike.**

**Inbound = outbound:** by submitting a pattern (PR, issue, or Discord) you
agree to license it under **CC-BY-SA-4.0**, with attribution kept in the
metadata header. No copyright assignment (no CLA) — you keep authorship; the
project just gets the right to bundle and redistribute it.

Authors may set a different license in the metadata header, as long as it
permits the project to bundle and redistribute the pattern.
