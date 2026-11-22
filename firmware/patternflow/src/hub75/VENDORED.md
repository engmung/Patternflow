# Vendored HUB75 driver

This is **ESP32-HUB75-MatrixPanel-DMA v3.0.13** (`mrcodetastic/ESP32-HUB75-MatrixPanel-DMA`),
copied into the sketch rather than installed through the Arduino Library Manager.

`UPSTREAM_library.properties` is the upstream manifest, kept for the version number.

## Why it is vendored

Three additions.

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

**2026-10-01: three short passes.** The instructions the September kernel
executes were counted - its code taken from the linked image and run one
instruction at a time against a synthetic panel - and came to 635 per column
pair, in the 691 cycles a 5.90 ms frame works out to. That is 1.09 cycles an
instruction. The blit was compute-bound, and the DMA contention the paragraph
above still half believed in was never the cost. The excess was in three
places, none of them the arithmetic:

- depth was a run-time value, so each plane word paid for a multiply by six,
  two variable shifts and a plane pointer reloaded from a stack array - 25
  instructions where 10 do;
- GCC 8.4 at `-Os` builds x77, x150 and x29 out of shifts and adds, about 20
  instructions a pixel where three multiplies do;
- one 400-instruction loop body holds more live values than the 14 registers
  it has, so every column pair made 48 reloads from the stack and 12 literal
  loads.

The kernel is now three passes over 32 columns at a time, each short enough to
keep its state in registers: `pfPostRow` (saturation and the LUTs, RGB888 to
three index bytes a pixel), `pfSpreadRow` (on-time and the spread tables, to a
`(lo, hi)` per column) and `pfStoreRow8` (the plane words, with the depth of 8
written in, so every field position is a constant). Saturation is computed as
`(c*q + y*(256-q)) >> 8`, which is `y + (((c-y)*q) >> 8)` exactly: the shift is
arithmetic. Same tables, same DMA words, same on-time sum.

| | September | now |
|---|---|---|
| instructions per column pair, from the image | 635 | 426, or 390 with identity LUTs |
| IRAM the blit holds | 2,440 B | 1,430 B |
| `blitRGB888` stack frame | 224 B | 592 B, and 48 more inside a pass |

**When all three LUTs are the identity, pass 1a skips them.** Gamma 1.0 and
white balance 1/1/1 are what `config.h` ships, and then the three lookups hand
each index back unchanged - at two instructions apiece, and with three table
pointers the loop has no registers for. `pfPostRowRaw` is the same pass without
them, 32 instructions a pixel instead of 41. `blitRGB888` asks the tables on
every frame rather than remembering the answer, because they are the caller's
and it rebuilds them in place whenever gamma or white balance is tuned: 768
compares, against 36 instructions on each of 2,048 column pairs. So tuning
white balance away from 1/1/1 costs about a third of a millisecond a frame;
that is the LUT being used, not a regression.

On a board (2026-10-02, default composition, A-B-B-A between the two images):
`presentUs` **5,960 -> 3,496 µs**, the same on Origin, Wave Cascade and
Two-stream, and every pattern's `frameUs` fell by the same 2.45 ms (Origin
12.08 -> 9.61 ms). With white balance tuned off the identity (`wb_r=0.95`)
it reads 3,802 µs: the LUT path costs 306 µs. That is a little better than
the instruction count predicted (5.90 ms x 390 / 635 = 3.62), so cycles per
instruction did not rise with the intermediates going through memory.

The loop the passes replace is kept whole, as `pfBlitRowPair`: an odd width and
every depth other than 8 still go through it, and `blit_test.cpp` still runs it
(depths 2-7, 9, 10, and width 127 at depth 8). It is no longer in IRAM and
neither is `pfBuildSpread` - no shipped configuration executes the first and
the second runs once per depth change - which is where the 1.2 KB of internal
RAM comes back from.

Three things in the passes are there for this compiler alone, and each says so
where it is used: `PF_OPAQUE`, an empty asm statement that hides where a value
came from (the luma weights, or the multiplies come back as chains; and the
plane pointer); `PF_NOINLINE`; and `optimize("no-branch-count-reg")` on passes
1a and 1b, where GCC otherwise invents a down-counter, has no register for it
and keeps it on the stack. None of them changes a result, and MSVC builds the
host test without any of them.

The scratch between the passes - 448 bytes - is on the caller's stack and not
in static storage, so that a blit split by row pair across the two cores finds
nothing shared.

Roads that were compiled and did not pay, written down so nobody walks them
twice: `-O2` on the kernel (about a third more instructions, all spills);
reusing the left neighbour's result where a colour repeats (the miss path grows
by more than the hit path saves on anything but flat fills); per-channel tables
with the LUT and the CIE curve folded in (9 % fewer instructions, 9 KB of
DRAM). One road was not taken for a different reason: this GCC never emits
`addx`, so every table index is a shift and an add, and interleaving
`pfSpreadLo` with `pfSpreadHi` into one table of pairs would save 14
instructions a column pair. `check_blit.py` finds the kernel by the first
table's declaration, and the two were left as they are.

#### The blit must stay slower than the scan

Since 2026-11-22 the blit waits for the swap ([section 3](#3-waitforflip--the-blit-waits-for-the-swap)), and this rate is no longer what keeps a frame whole. It is what the driver falls back on if the wait ever stops hearing from the DMA, and it is why the wait costs a slow pattern nothing, so it stays written down.

`flipDMABuffer()` returns before the swap takes effect.
`flip_dma_output_buffer()` (`platforms/esp32s3/gdma_lcd_parallel16.cpp`) only
rewrites the `next` pointer of each chain's last descriptor - upstream's wait
is commented out - and `back_buffer_id` moves at once. So the buffer just
retired stays on the panel until the DMA reaches the end of its pass, up to
3.33 ms later, and the next `blitRGB888` writes into exactly that buffer.

Nothing shows, and what prevents it is a rate, not a wait. The scan and the
blit both walk row pairs 0 to 31 in order. The scan spends twelve buffers of
128 words on a row pair: 1,536 clocks, 96 µs at 16 MHz, 3.07 ms for all 32 (the
261 µs of padding comes after the last row). It is already somewhere down the
frame when the flip happens; the blit starts later, at row 0, and as long as it
needs more than 96 µs a row pair it falls further behind with every row and
never writes a row that is still to be shown. The September kernel took 184 µs.
This one cannot take less than 104 - 390 instructions, 64 column pairs, one
cycle each at 240 MHz - and measures 109 (3,496 µs over 32 row pairs), 119 on
the LUT path.

About one flip in six hundred lands inside the last padding descriptor, after
the DMA has already fetched its `next`, and the old buffer gets one more whole
pass. The same argument covers it: that pass begins within 6 µs of the flip,
still ahead of the blit.

**The line is the scan's row time: buffers per row x words per row / pixel
clock.** For the shipped configuration - 12 buffers, 128 words, 16 MHz - that
is 96 µs per row pair, 3.07 ms per frame, and it is a property of the
configuration, not of the kernel: at the 10 MHz the S3 really runs when
`i2sspeed` is lowered (`core_display.h`), the same 12 buffers take 154 µs a row
pair and this kernel is the faster of the two. The September loop was slower
than the scan at every clock the driver can pick; this one needs the pixel
clock to stay above about 14.8 MHz at 12 buffers (11.1 at 9, 9.9 at 8). The
rate argument also assumes the first plane store comes at least one scan row
after the flip, which today the pattern's own draw supplies and nothing in
the driver enforces. A blit faster than the line
catches the scan from behind unless it starts late: at B µs a row pair it must
not begin sooner than 3,072 - 31 B µs after the flip - 1.1 ms at B = 62, the
whole pass as B goes to zero. Crossing it tears: the rows past the point where
the two meet show the next frame one refresh early, and the row where they meet
mixes old and new planes. This kernel split across both cores crosses it. Any
change that does has to wait for the swap before its first write.

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

### 3. `waitForFlip()` — the blit waits for the swap

`flipDMABuffer()` returns before the swap takes effect, and until November 2026
what kept the next blit off a buffer still on the panel was the rate described
under [The blit must stay slower than the scan](#the-blit-must-stay-slower-than-the-scan).
That holds for one configuration. A pixel clock under 14.8 MHz crosses it, and
so does a blit that starts on another core the moment a frame is ready.

**2026-11-22.** The DMA now says where it is. Upstream set `suc_eof` on the
last descriptor of each chain and left the callback's registration commented
out. Here `suc_eof` is on descriptor 0 and the callback is registered
(`platforms/esp32s3/gdma_lcd_parallel16.cpp`), so the GDMA raises one interrupt
a pass, 300 a second, as it finishes the first descriptor of a chain, and names
that descriptor. `flip_dma_output_buffer()` records which chain it asked for.
`wait_for_flip()` returns once the two are the same, which is when the retired
buffer is free to write. It blocks on a semaphore the interrupt gives, for 20 ms
at the most.

Descriptor 0 and not the last, because with `suc_eof` on the last one the
interrupt comes a whole pass after the DMA entered the chain. Measured on Origin:
9.96 ms a frame waiting on the last descriptor, three refreshes, and 6.65 ms
waiting on the first, two.

A semaphore and not a task notification. The first version woke the waiter with
`vTaskNotifyGiveFromISR`, and a task's one notification value is shared with
anything else that notifies it. NimBLE blocks its callers that way.

`PFCanvas::present()` calls it before every blit, on whichever core is blitting.
A frame that took longer than a refresh to draw does not wait at all. One that
took less waits for the pass to end, so a fast pattern's frame is a whole number
of refreshes: Origin is 6.67 ms, two of them, where the same build without the
wait measured 4.1 ms.

What it does not cover. The screens that draw on the back buffer themselves,
SELECT's text and the info cards, still start without waiting. They redraw a few
times a second, long after the swap.

If the interrupt stops coming, eight waits in a row time out and
`wait_for_flip()` returns at once from then on, until the DMA is next started.
That is the driver as it was before the wait, held up by the rate again.
`PFCanvas::flipMisses` counts blits that began without hearing of the swap. It
read 0 through every run on the bench board: a survey of sixteen patterns, 150
seconds of mode changes at random with 24 sleeps, and 49 module loads.

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
with no repair step — and the refresh rises from 260 to 325 Hz (before the
padding described below brings it to exactly 300).
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

**2026-09-19: every frame is padded to exactly 300 Hz.** 325.5 Hz turned out to
be worse on a phone than the 260 it replaced, and the reason is worth keeping. A
row is lit once per refresh for 1/32 of it — a pulse — so a rolling shutter
collects a whole number of pulses per sensor line; unless the exposure is an exact
multiple of the refresh period some lines get N and some N + 1, which is the
banding. A faster refresh makes the bands fainter and more numerous, not absent.
Phones pin exposure to 1/50, 1/100, 1/25 or 1/60, 1/30, and 300 Hz is the lowest
rate all of those divide; 325.5 is 6.51 periods at 1/50 and 5.43 at 1/60, close to
the worst case for both. `begin()` now links a run of blank words (OE off, address
left on the last row, no latch) after the last row of every frame:
`pfFramePadWords()` says how many — 4,181, making 53,333 clocks — and one 256-word
buffer is linked as often as that takes. About 8% of the light, 640 bytes, no CPU;
frame and push times measured on the panel did not move. It does nothing for 1/120
and faster (2.5 periods; covering it would take 600 Hz, which 16 MHz cannot reach
at 8 bits). `check_oe.py` lifts `pfFramePadWords()` too and asserts the shipped
frame lands on 300 Hz and every one of those shutters is a whole number of
periods. Confirmed through a phone on the panel.

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

- Upstream updates are manual. [UPSTREAM.md](UPSTREAM.md) names the commit this
  copy was taken from and the command that rebuilds the patch.
- [patternflow.patch](patternflow.patch) is every change from upstream. A
  `PATTERNFLOW ADDITION (not upstream)` or `PATTERNFLOW FIX` marker heads the
  larger changes in the source, but not every change has one: the two fields
  behind `lastFrameOnTime()`, which `../core_power.h` reads, carry neither. The
  patch is the list.
- The build server compiles the sketch folder, so it picks this up with no
  separate configuration.
- If the Library Manager copy is still installed it is simply unused: the sketch
  includes `"hub75/..."` by path, not `<...>`.

## Reverting

Delete this folder, change the two `#include "hub75/..."` lines in
`../core_display.h` and `../core_canvas.h` back to
`#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>`, and restore the per-pixel loop in
`PFCanvas::present()`.
