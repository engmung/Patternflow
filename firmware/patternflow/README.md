# Patterns

Patterns are header-only `.h` files compiled into the firmware and flashed.
There is no runtime/filesystem loading — adding or changing a pattern means a
reflash.

## Two kinds

```
patternflow/
├── custom1.h, custom2.h, ...   ← your own patterns (reusable slots)
└── presets/
    └── preset_<name>.h         ← curated patterns the project ships as a showcase
```

- **`custom<N>.h` lives in the sketch ROOT** and is a **reusable slot**. The
  Arduino IDE only shows root-folder files as editable tabs, and the whole point
  is that people write and tweak their own pattern right there. Overwrite a
  slot's body (and its `NAME`) to try a new pattern — no file renaming, and the
  registry line stays `PATTERN_ENTRY(CustomN)`. Add `customN+1.h` for more.
  Includes use `"src/..."`.
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

`pattern_registry.h` registers patterns in two clearly separated sections, with
**custom first** (so the slots you actually edit are at the top, and the device
boots into slot 0 = your first custom pattern):

```cpp
// -- CUSTOM (your own) --
PATTERN_ENTRY(Custom1),
PATTERN_ENTRY(Custom2),
PATTERN_ENTRY(Custom3),
// -- PRESETS (curated showcase) --
PATTERN_ENTRY(Origin),
PATTERN_ENTRY(WaveSaw),
...
```

`NUM_CUSTOM` (the first slots) and `NUM_PRESETS` are exposed alongside
`NUM_PATTERNS` so code can split the list.

## Currently Registered Patterns (v2.0.0)

The following patterns are currently compiled into the firmware and registered in `pattern_registry.h`:

### Presets (21)
1. **Origin** (`presets/preset_origin.h`) — Default startup pattern
2. **Wave Saw** (`presets/preset_wave_saw.h`)
3. **0510** (`presets/preset_0510.h`)
4. **0511** (`presets/preset_0511.h`)
5. **0512** (`presets/preset_0512.h`)
6. **0513** (`presets/preset_0513.h`)
7. **0514** (`presets/preset_0514.h`)
8. **0515-3** (`presets/preset_0515_3.h`)
9. **0515-4** (`presets/preset_0515_4.h`)
10. **0515** (`presets/preset_0515.h`)
11. **0518** (`presets/preset_0518.h`)
12. **0519-1** (`presets/preset_0519_1.h`)
13. **0520** (`presets/preset_0520.h`)
14. **0521** (`presets/preset_0521.h`)
15. **0522** (`presets/preset_0522.h`)
16. **0527** (`presets/preset_0527.h`)
17. **0528** (`presets/preset_0528.h`)
18. **0531** (`presets/preset_0531.h`)
19. **0601** (`presets/preset_0601.h`)
20. **0602** (`presets/preset_0602.h`)
21. **A Big Hit** (`presets/preset_a_big_hit.h`)

*(Note: Presets 0516, 0517, 0519-2, 0524, 0524-2, 0526, 0529, and 0530 were excluded due to performance lag or rendering issues on the physical ESP32 hardware. Additionally, patterns posted on Instagram after 0602 are not included in this repository by default; you can find them on Discord and convert them yourself to use them.)*

### Custom Patterns (3)
1. **Spark Matrix** (`custom1.h`)
2. **Hyperbolic Grid** (`custom2.h`)
3. **Cellular Interference** (`custom3.h`)

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
