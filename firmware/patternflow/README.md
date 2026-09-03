# Patterns

A pattern reaches the panel one of two ways: as a curated **preset** compiled
into the firmware, or as a **`.pfm` module** uploaded over Wi-Fi and loaded
from the FATFS partition at runtime — no reflash, no reboot. Modules are the
normal path; presets are the showcase and the fallback a bare board boots into.

## Two kinds

```
patternflow/
└── presets/
    └── preset_<name>.h         ← curated patterns the project ships as a showcase

FATFS partition (on the device, not in this repo)
└── <slug>.pfm                  ← your own patterns, uploaded over Wi-Fi
```

- **`presets/preset_<name>.h`** is compiled into `firmware.bin`. Presets are
  curated rather than hand-edited in the IDE, so they're tucked in a subfolder.
  Because they sit one level down, their includes use `"../src/..."` (and
  `"../config.h"`). Adding one means an entry in `presetPatterns[]` and a
  rebuild — see [`../CUSTOM_PATTERNS.md`](../CUSTOM_PATTERNS.md).
- **`.pfm` modules** are how a pattern of your own gets onto a device now: a few
  KB of relocatable ELF, uploaded at `/patterns` over Wi-Fi, discovered at boot
  and appended after the presets. No reflash, no reboot, up to 128 of them.
  Build one with `firmware/toolchain/build_module.py`.

> The old `custom1.h`–`custom3.h` slots in the sketch root are **gone** —
> modules are what they were for, and no longer cost a rebuild. Only `Origin`
> is compiled in today; the rest of the curated set ships as the Basics pack
> (`web/public/packs/basics.zip`, built from `presets/` by
> `firmware/toolchain/make_pack.py`) and installs from the Patterns page.

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

**Tried either of these? Please report back.** There is more variety out there
than one desk can test, so results from real hardware are the only way this gets
trustworthy — working or broken, both are useful:
[#224 Custom panel sizes and pattern frames](https://github.com/engmung/Patternflow/issues/224).

(A panel that won't light up at all is a *different* problem — that's the driver
IC, not the resolution. See [`docs/panel-compatibility.md`](../../docs/panel-compatibility.md)
and report it in [#259](https://github.com/engmung/Patternflow/issues/259).)

## Registry

`pattern_registry.h` assembles the device's pattern list from two sources:

```cpp
// compiled into firmware.bin — the failsafe, and nothing else
PatternEntry presetPatterns[] = {
  PATTERN_ENTRY(Origin),
};

// .pfm modules discovered on FATFS at boot, appended after the presets
// (cap of 128; a slot costs 136 bytes of PSRAM whether or not it's filled)

// runtime list: presets first, modules last — call once in setup()
void buildPatternList() { /* copy presets, then modules, into patterns[] */ }
```

So on the device **pattern 1 = Origin** (the boot default) and your uploaded
modules come **last** — turn back from pattern 1 to reach them.

Origin is the only compiled-in pattern. The showcase that used to live here
ships as a pack of `.pfm` modules instead, which you drop on `/patterns` as a
single `.zip`. That is a memory decision, not housekeeping: each compiled-in
preset costs internal DRAM, and the web console needs roughly 10 KB of
internal heap free to send a page. With the old 34-preset list a 128x64 board
had about 1 KB of margin, and `/patterns` would return a truncated page as
soon as anything else wanted RAM. One preset plus a pack you choose leaves
~16 KB free and the console answers in milliseconds.

The preset sources are still in `presets/` as the editable originals —
`toolchain/port_preset.py` is what turns one back into a module.

> **The `custom1..3` slots are gone.** They were the hand-edited way to get a
> pattern on a device, and uploading a `.pfm` replaced them. `PF_CUSTOM_SLOT_COUNT`
> is `0`, and the region between the `PF_CUSTOM_SLOTS_BEGIN` / `PF_CUSTOM_SLOTS_END`
> markers exists only so the web build service can compile a submitted pattern
> into a whole image for devices whose firmware predates the module loader.
> **Leave the markers in place even though the region is empty** — removing them
> breaks "Send to build".

## Currently registered patterns

**`presetPatterns[]` in [`pattern_registry.h`](pattern_registry.h) is the source of truth** — it and the contents of [`presets/`](presets/) are the list. This page used to enumerate them and fell thirteen behind, so it doesn't any more.

Two things about that set which the file itself won't tell you:

- **Not every pattern made the cut.** 0516, 0517, 0519-2, 0524, 0524-2, 0526, 0529 and 0530 were left out for performance lag or rendering problems on real ESP32 hardware. A pattern that looks fine in the browser can still miss frame budget on the device. 0609, 0614, 0614-2, 0619, 0622 and 0624 were posted after the module loader made the compiled-in showcase unnecessary and were never ported. `firmware/toolchain/check_presets.py` (run in CI) keeps this list honest: a new web preset has to be ported or added there with a reason.
- **Patterns posted to Instagram after 0602 aren't bundled here.** They're on Discord; convert them yourself, or install them as `.pfm` modules.

Anything not compiled in is one upload away — build a module and send it to the device over Wi-Fi, no reflash.

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
