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
the function is `IRAM_ATTR`. It measured 6.9 ms.

The September 2026 disassembly check found that the intended word access was
still four byte accesses each way: the `uint16_t*` passed to `memcpy` did not
tell Xtensa GCC the pointer was word-aligned. The paired path now supplies
`__builtin_assume_aligned(p, 4)` to `memcpy`. DMA allocation is word-aligned,
each even-width plane has a word-sized stride, and `x` advances by two, so the
assumption holds. Odd widths use the scalar path throughout. `memcpy` retains
strict-aliasing safety; a cast-and-dereference would not.

On the same 128×64, 8-bit bench configuration, `presentUs` fell from 6.86 to
5.90 ms. DMA contention may still matter, but it did not explain the byte
accesses. `python firmware/toolchain/check_blit.py` compares the actual blit
against a scalar colour/control-bit reference across widths, depths, LUTs,
saturation values and both FIFO orders (over 30 million words). See the
[bench report](../../../../docs/investigations/2026-09-firmware-runtime.md)
for measurements.

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

## The plane encoding holds ten planes, and the config permits twelve

`blitRGB888` packs one 6-bit field per plane — three colours by two panel
halves — into two `uint32`: planes 0-4 in `lo` at `6*d`, planes 5-9 in `hi` at
`6*(d-5)`. Plane 9 ends at bit 29, and there is no room for a tenth field.

Past that it fails quietly and then illegally. Depth 11 needs bits 30-35 of `hi`
and loses the top four. Depth 12 shifts a `uint32` by 36, which is undefined
behaviour — in `pfBuildSpread` writing the field and in the reader consuming it.
Both are reachable, because `HUB75_I2S_CFG` clamps a requested depth to
`PIXEL_COLOR_DEPTH_BITS_MAX`, which is 12.

**2026-09-10:** named the real ceiling `PF_SPREAD_MAX_DEPTH = 10` and made
`blitRGB888` refuse above it — it logs once and leaves the previous frame up,
because a stale frame with a message is diagnosable and a corrupted DMA buffer
is not. `PIXEL_COLOR_DEPTH_BITS_MAX` is deliberately NOT lowered: the upstream
`updateMatrixDMABuffer` path does not use these tables and is unaffected, and
`fillScreen()` still goes through it. Nothing in this firmware asks for more
than 8; the guard exists so that a future configuration change cannot corrupt
frames silently.

`toolchain/tests/blit_test.cpp` now sweeps depths **2 to 10** rather than 2 to 8,
so the two planes above the shipped depth are actually exercised, and asserts
that depths 11 and 12 leave the buffer byte-identical.

## The plane threshold rounds

Only the top `depth` bits of the 16-bit CIE value reach a plane. Upstream drops
the rest; this copy adds half a step first, so the threshold rounds to nearest
instead of toward zero. Truncation is biased downward by up to half a plane step
everywhere, which is invisible in the bright half and is the whole signal in the
dark end — measured on a panel, a neutral level 9 read blue, 17 read cyan and 18
read red, because each channel crossed its threshold at a different code.

It costs nothing at runtime: `pfBuildSpread` runs once per depth change.
`blit_test.cpp` carries the same rounding in its own independent reference — the
two are derived from the same intent and deliberately not from the same code,
which is what makes comparing tens of millions of DMA words worth doing.

## What this costs

- Upstream updates are manual. Diff a new release against this tree and re-apply
  the additions.
- The additions are marked `PATTERNFLOW ADDITION (not upstream)`, and the two
  in-place changes above are marked `PATTERNFLOW FIX` —
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
