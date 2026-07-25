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
  is that people write and tweak their own pattern right there. Overwrite the
  slot's contents to try a new pattern — no file renaming. Each pattern defines
  its own descriptive namespace, so update the slot's `PATTERN_ENTRY(...)` line
  in `pattern_registry.h` to match. Add `custom<N+1>.h` for more. Includes use
  `"src/..."`.
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

## Panel size, and the frame a pattern is drawn for

Two different things, and it's worth keeping them apart.

**Your panel** is set in [`config.h`](./config.h):

```cpp
#define PANEL_RES_W 128
#define PANEL_RES_H 64
#define PANEL_CHAIN 1
```

Running something other than the stock 128×64 — a 64×64 module, or two
128×64 panels chained into 256×64 — means **editing those lines to match your
hardware and reflashing. That's the whole change.** Nothing else in the
firmware hardcodes a panel size: the HUB75 driver config, the radius/angle
tables, the canvas buffer and the on-screen menus all derive from these three
values. The patterns do too, as long as they loop over `PANEL_RES_W` /
`PANEL_RES_H` instead of typing `128` and `64`.

**A pattern's frame** is the pixel grid it was *composed* for, which is not
always the panel's. A 64×128 pattern on a 128×64 panel is just the device
stood on its end. In Pattern Lab this is picked in the header and written into
the JS as one line — `// @matrix 64x128` — and it carries through generation,
publishing and the C++ prompt.

Most patterns are composed for the panel and need no thought: loop
`PANEL_RES_W` / `PANEL_RES_H`, call `PFCanvas::setPixel(x, y, r, g, b)`, done.
A pattern composed for a *different* grid declares it instead:

```cpp
constexpr int FRAME_W = 64;
constexpr int FRAME_H = 128;

void draw() {
  PFCanvas::setFrame(FRAME_W, FRAME_H);   // first line
  for (int y = 0; y < FRAME_H; y++) {
    for (int x = 0; x < FRAME_W; x++) {
      PFCanvas::setPixel(x, y, r, g, b);  // logical coords — do not rotate them yourself
    }
  }
  PFCanvas::present();
}
```

`setFrame` installs the mapping and `setPixel` applies it, so the pattern only
ever thinks in its own coordinates. How it lands is *derived* from the two
sizes — there is no rotation setting to keep in sync:

| Frame vs panel | What happens |
|---|---|
| Same | Drawn straight through. Zero cost, and the path every stock pattern takes. |
| Swapped (64×128 on 128×64) | Rotated a quarter turn, filling the panel exactly. |
| Anything else | Centred, with the remainder left black. |

Two things to know:

- **Do not transform the coordinates yourself.** Rotating in the pattern *and*
  in the canvas turns it back the wrong way.
- **`PFTables::rT` / `thetaT` are panel-space** — indexed by the panel grid and
  measured from the panel's centre — so they're wrong inside a declared frame.
  Use `sqrtf` and `PFMath::fastAtan2` from your own frame centre, and don't
  call `PFTables::init()`.

`PFCanvas::present()` restores the panel frame, so a `setFrame` can never leak
into the next pattern, and a pattern that never calls it is unaffected.

## Registry

`pattern_registry.h` keeps `customPatterns[]` and `presetPatterns[]` as two
separate arrays. **Custom is listed first** so it's quick to edit, but
`buildPatternList()` combines them at runtime as **presets-then-custom** — so on
the device **pattern 1 = Origin** (the boot default) and the custom slots come
**last** (turn back from pattern 1 to reach them):

```cpp
// edit these — listed first for convenience; each entry names the
// namespace of whatever pattern currently occupies the slot file
PatternEntry customPatterns[] = {
  PATTERN_ENTRY(ReactionDiffusionPattern),   // custom1.h
  PATTERN_ENTRY(LissajousWeave),             // custom2.h
  PATTERN_ENTRY(ChromaticAberrationVortexPattern), // custom3.h
};

PatternEntry presetPatterns[] = {
  PATTERN_ENTRY(Origin), PATTERN_ENTRY(WaveSaw), ...
};

// runtime list: presets first, custom last — call once in setup()
void buildPatternList() { /* copy presets, then custom, into patterns[] */ }
```

`NUM_CUSTOM` and `NUM_PRESETS` are exposed alongside `NUM_PATTERNS`.

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

The three `custom<N>.h` slots ship with rotating example patterns and are meant
to be overwritten with your own. `customPatterns[]` in `pattern_registry.h` is
the source of truth for what's currently loaded.

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
