# Vendored HUB75 driver

This is **ESP32-HUB75-MatrixPanel-DMA v3.0.13** (`mrcodetastic/ESP32-HUB75-MatrixPanel-DMA`),
copied into the sketch rather than installed through the Arduino Library Manager.

`UPSTREAM_library.properties` is the upstream manifest, kept for the version number.

## Why it is vendored

Two additions.

### 1. `blitRGB888()` — paints a whole frame in a single call

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

Since 3.9.2 the bitplane transpose inside the blit is table-driven. A plane
wants bit `d + MASK_OFFSET` of each of the six CIE values, and the loop used
to extract it with six masked tests per plane — thirty-six per pixel pair,
which was 60 % of a frame on the 128x64 panel at 6 bits (9.9 ms of 16.5).
`pfBuildSpread()` fills two 256-entry tables, indexed by the post-LUT byte,
that spread that byte's plane bits across 6-bit slots (planes 0–4 in the low
word, 5–7 in the high); one OR of six reads then holds every plane's
`R1 G1 B1 R2 G2 B2`, and each plane is a shift and a mask. The tables are
rebuilt if the colour depth changes. Bit-exact with the loop it replaced —
6.2 million plane words compared — and 7.0 ms on the same panel.

3.9.3 takes two columns per step: `x` and `x + 1` are adjacent `uint16_t`
words in every plane, so both halves of the panel for both columns are one
aligned 32-bit read-modify-write per plane (`PF_CLEAR32`; which column lands
in the low half follows `ESP32_TX_FIFO_POSITION_ADJUST`, decided at compile
time). The CIE table the on-time sum reads is copied to DRAM (`pfCie`) and
the function is `IRAM_ATTR`. 6.9 ms — most of what is left is the DMA
engine reading the same memory while the CPU writes it.

### 2. `resumeDMAoutput()` — the way back from `stopDMAoutput()`

Upstream's `stopDMAoutput()` is a one-way trip ("Screen will forever be black
until next ESP reboot"), so there was no way to stop clocking the panel and
later carry on. The firmware's sleep mode needs exactly that: blanking the
framebuffer turns the LEDs off, but the driver ICs keep being clocked at 15 MHz
and that draw stays on the meter.

The underlying bus calls are already symmetric on both supported platforms —
`dma_transfer_stop()` resets the LCD peripheral and halts the GDMA channel,
`dma_transfer_start()` starts it again — so the addition is a four-line public
wrapper. It has to live in the driver because `dma_bus` is `protected`.

Caller's side of the contract: the restart resumes at descriptor chain A while
`back_buffer_id` is wherever it was left, so blank BOTH buffers before resuming
or one stale frame can show. `../core_sleep.h` does that.

## What this costs

- Upstream updates are manual. Diff a new release against this tree and re-apply
  the additions.
- Both additions are marked `PATTERNFLOW ADDITION (not upstream)` —
  `blitRGB888()` in `ESP32-HUB75-MatrixPanel-I2S-DMA.h` and `.cpp`,
  `resumeDMAoutput()` in the `.h` only. Nothing else is modified.
- The build server compiles the sketch folder, so it picks this up with no
  separate configuration.
- If the Library Manager copy is still installed it is simply unused: the sketch
  includes `"hub75/..."` by path, not `<...>`.

## Reverting

Delete this folder, change the two `#include "hub75/..."` lines in
`../core_display.h` and `../core_canvas.h` back to
`#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>`, and restore the per-pixel loop in
`PFCanvas::present()`.
