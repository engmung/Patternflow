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

## The OE window is computed, not approached

A plane delivers its OE window times its descriptor repeat count. The repeats
already carry one factor of two per plane above `lsbMsbTransitionBit`, so the
window must supply the rest: `u * 2^d / repeats(d)`. Upstream derives a
right-shift instead, which can only halve, and maps the plane index through
`(2 * depth - colouridx) % depth` — sending plane 0 to the branch that gives it
the MSB's full window.

**2026-09-10:** the arithmetic is extracted as `pfOEWindowPixels()` and computed
directly. It is pure, so `toolchain/check_oe.py` lifts it verbatim out of this
file and asserts that no plane is outweighed by the ones below it and that the
response over all 256 codes is monotone — 30,936 assertions across every depth,
transition bit, width and brightness. Before the fix: 26 inversions, two of them
50%. Full-scale luminance moves about 1%.

**2026-09-17, correcting the above — and the premise under it.** The first
paragraph of this section is wrong: a plane does not "deliver its OE window". A
plane's bits are latched at the END of its buffer, so they are on the LEDs while
the NEXT buffer in the chain clocks in, gated by that buffer's OE bits.
`clearFrameBuffer()` says as much — it marks buffer 0 with the previous row's
address "because it is used to display previous row while we pump in MSBs for the
next row". So the window in buffer `b` lights whatever was latched before it, and
upstream's full window on buffer 0 was never an LSB bug: it is the top plane's
display time. 09-10 shrank it and took a fifth of the top plane's light away.

The chain, per row, is buffers `0..D-1` once and then buffer `i` above the
transition bit another `2^(i-L-1)` times; the shipped panel resolves to depth 8,
`L = 4`, not the `L = 0` the 09-10 numbers were reasoned at:
`0 1 2 3 4 5 6 7 5 6 6 7 7 7 7 | next row's 0`. Crediting each window to the plane
before it, at full brightness:

| | light per plane 0–7 | codes where raising the code lowers the light |
|---|---|---|
| upstream | 7 15 31 63 125 250 375 625 | 3 (63, 127, 191) — 127→128 loses 28% |
| 09-10 | 7 15 31 63 125 250 375 503 | 3 — 127→128 loses 42% |
| 09-17 morning (repeat counts corrected, same misreading) | 9 19 39 78 78 210 355 458 | 15 |
| upstream's chain, solved exactly | 3 6 13 25 50 100 200 401 | none |

What it looked like on the panel: a pattern with a near-white background
(214,211,204) whose edges fade to dark. Each channel crosses code 128 at a
different point along the fade, and the one that has crossed is suddenly far
brighter than the two that have not — blue first, a purple fringe; then green, a
sky-blue one; then red, and neutral again. A grey test card at identity white
balance cannot show it, because all three channels cross together. Confirmed on
hardware by switching between all four at runtime: only the last has no fringes.

**And then the chain itself had to go.** The exact solution of upstream's chain
is `W = [40, 1, 2, 4, 8, 16, 16, 24]·u`: a window belongs to a buffer, not to a
pass, and the windows the top plane needs wide are the same ones the planes
below it need narrow. It keeps 42% of the row lit (upstream, not binary: 80%) and
on the panel it was simply too dark. Searching every grouped order of up to 16
buffers a row for the exactly-binary solution that keeps the most of the row lit
found one, with nothing close behind it:

```
sent      0  1  2  3  4  5  6  7  6  7  7  7 | next row's 0
lights    7' 0  1  2  3  4  5  6  7  6  7  7
W      =  1, 1/32, 1/16, 1/8, 1/4, 1/2, 1, 1          light 3 7 15 31 62 125 250 500
```

Twelve buffers instead of fifteen, 66% of the row lit, every window the full one
shifted right — so floors keep the planes strictly ordered at every brightness
with no repair step — and the refresh rises from 260 to 325 Hz for free.
`pfChainExtraPasses()` is that rule (`begin()` uses it in its refresh arithmetic,
its descriptor count and its linking loop), `pfOEWindowPixels()` is the windows,
and `lsbMsbTransitionBit` is no longer used: `begin()` picks a *scheme* instead —
0 as above, 1 with one extra pass of the top plane (D + 1 buffers, 44%), 2 with
none (D buffers, 25%) — taking the brightest that clears `min_refresh_rate`. All
three are exactly binary; what a slower clock costs now is brightness, never
colour depth. Checked on the panel against the previous build: no fringes, and
brighter.

`oe_test.cpp` no longer shares a formula with the driver: it walks the chain and
credits each buffer's window to the plane latched before it. Both earlier drivers
fail it immediately. **The lesson is the test's, not the driver's:** 30,000
assertions agreed with two wrong versions because the reference modelled
delivered light the same wrong way.

**Power.** `core_power.h`'s full-white figure (4.8 A) was measured on upstream's
windows, which kept 80% of the row lit; this keeps 66%, so the model now
over-estimates by roughly a fifth. It errs toward clamping early and has been left
alone until it is measured again.

**White balance.** `LED_WB_*` (0.930 / 1.000 / 0.975) had been converged by eye at
full white on top of upstream's weights, so it was correcting the driver at one
level rather than the panel; it read pink across the greys once the weights moved
and is identity again. `LED_SAT_BOOST` was converged the same way and has not been
re-judged. A constant tuned by eye is tuned against the driver as it stood.

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
