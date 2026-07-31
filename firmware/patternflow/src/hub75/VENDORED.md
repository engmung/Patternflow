# Vendored HUB75 driver

This is **ESP32-HUB75-MatrixPanel-DMA v3.0.13** (`mrcodetastic/ESP32-HUB75-MatrixPanel-DMA`),
copied into the sketch rather than installed through the Arduino Library Manager.

`UPSTREAM_library.properties` is the upstream manifest, kept for the version number.

## Why it is vendored

One addition: **`blitRGB888()`**, which paints a whole frame in a single call.

Upstream's per-pixel entry point cannot be made to do this. It takes one `(x, y)`
at a time, so for every pixel it bounds-checks, decides which half of the panel
the row is in, and then walks the colour-depth planes recomputing the row
pointer and doing a read-modify-write for each. A two-scan panel lights row `r`
and row `r + ROWS_PER_FRAME` together and stores both in the *same* `uint16_t`,
but they arrive as two separate calls — so every DMA word gets touched twice.

Measured on the reference 128x64 P2.5 panel at 8-bit depth, painting a frame
through the per-pixel API cost **12.3 ms of an 18.7 ms frame — 66 %**, while the
pattern's own maths was only 6.4 ms.

`blitRGB888()` hoists the row pointers out of the pixel loop, composes both
halves of each word at once, and applies the saturation boost and gamma/WB LUTs
on the way through (so the caller needs no second full-frame buffer — internal
RAM is the scarce resource on this part).

Colour output is identical to the per-pixel path: same `lumConvTab` CIE1931
curve, same bit masks.

## What this costs

- Upstream updates are manual. Diff a new release against this tree and re-apply
  the addition.
- The addition is marked `PATTERNFLOW ADDITION (not upstream)` in both
  `ESP32-HUB75-MatrixPanel-I2S-DMA.h` and `.cpp`. Nothing else is modified.
- The build server compiles the sketch folder, so it picks this up with no
  separate configuration.
- If the Library Manager copy is still installed it is simply unused: the sketch
  includes `"hub75/..."` by path, not `<...>`.

## Reverting

Delete this folder, change the two `#include "hub75/..."` lines in
`../core_display.h` and `../core_canvas.h` back to
`#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>`, and restore the per-pixel loop in
`PFCanvas::present()`.
