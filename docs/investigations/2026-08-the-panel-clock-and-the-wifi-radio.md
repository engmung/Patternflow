# The panel clock and the Wi-Fi radio

*Investigation log, 2026-08-21 → 22. A report from **cartoonmonkeystudio
(CE)** on the project Discord, independently reproduced on a second board, and a fix we did not take.
Everything below was measured on hardware. The decisive measurement — an
anechoic chamber — has not happened yet, and this log says so rather than
guessing past it.*

## How it surfaced

**cartoonmonkeystudio (CE)**, on the project Discord, building on their own
hand-soldered PCB,
reported that Wi-Fi on their unit was not merely slow but unusable: **83–95%
packet loss, ping times of 5 to 13 seconds**. The console was effectively
unreachable.

They then did the thing that makes a report worth acting on. Rather than
guessing, they bisected it — and the bisect is reproduced here because the
shape of it is the argument:

| Configuration | Loss | Avg RTT |
|---|---|---|
| Stock firmware, 16 MHz panel clock | 83–95% | 5–13 s |
| Bare test sketch, no display code at all | 4% | 9 ms |
| Services and `tick()` disabled, still 16 MHz | 85–95% | 1–14 s |
| Same, but panel clock at 8 MHz | 43% | 1.5 s |
| 8 MHz + refresh 96 + latch blanking 12 | 33% → 9% | 0.4 s |

Ruled out along the way, all innocent: the router, both ESP32-S3 boards (a bare
sketch joins and pings at 9 ms), panel power draw, USB versus battery supply,
and phone hotspot versus home network.

The second row is the one that matters. A sketch with **no display code**
behaves normally on the same board, on the same network. The fourth row narrows
it further: changing only the panel clock, with everything else held, moves loss
from 85–95% to 43%.

Their conclusion: the HUB75 ribbon is streaming a multi-megahertz square wave a
few centimetres from the module's antenna, and it is desensitising the radio.

This project's own source had already written that down, in `core_display.h`,
long before anyone measured it:

> ⚠️ If an EMC radiated-emissions test fails: this 15 MHz clock and its
> harmonics, streamed continuously down the HUB75 ribbon, are the loudest thing
> in the product — far louder than Wi-Fi, which is a separate test entirely.

The comment was written about *compliance*. The report says the same energy has
a *functional* cost as well.

## What we reproduced, and what we did not

Two builds were made from a staged copy of the sketch, differing in exactly one
pair of settings, with no test harness — normal firmware, knobs live, patterns
running:

- **A** — stock: `HZ_15M` (16 MHz), `min_refresh_rate = 240`
- **B** — candidate: `HZ_8M` (8 MHz), `min_refresh_rate = 96`

Each build prints what the library actually chose, so the numbers below are read
off the hardware rather than trusted from arithmetic:

```
[VAB] clk=16000000 Hz  min_refresh=240  calculated_refresh=260 Hz    ← A
[VAB] clk= 8000000 Hz  min_refresh= 96  calculated_refresh=130 Hz    ← B
```

Then 50–60 ICMP echoes per run, alternating builds so a drift in network
conditions could not favour one side. Three runs each:

| | Loss | Avg | Median | p95 | Max |
|---|---|---|---|---|---|
| **A** 16 MHz | 0% | 28 ms | 15 ms | 92 ms | 270 ms |
| **B** 8 MHz | 0% | 6 ms | **4 ms** | **15 ms** | 162 ms |

Two things follow, and they pull in opposite directions.

**The effect is real on a second, independent board.** Median latency improves
3.75×, p95 by 6×, and the ordering never once inverted across interleaved runs.
This is not noise.

**The severity is not.** Our unit shows **0% loss in both configurations**. The
reporter's catastrophic failure does not reproduce here. Whatever makes the
difference between "6 ms versus 28 ms" and "unusable" is not in the firmware —
it is in the board: ribbon routing, ribbon length, antenna keep-out, ground
return quality. Their own write-up reaches the same place, recommending ferrite
rings, shorter ribbons, and re-flowed ground joints.

### One honest gap in our half of it

Halving the panel clock changes two things at once, and our ping test cannot
separate them:

1. **RF** — the ribbon radiates half as fast, which is the reporter's mechanism.
2. **Bus contention** — the DMA moves half as many bytes per second, so the
   CPU and memory bus are measurably freer. A network stack can get faster from
   that alone, with no RF mechanism at all.

Their data argues for RF: bus contention does not plausibly produce 95% packet
loss, and a display-free sketch on the same board was fine. But *our* 28 → 6 ms
is not, on its own, evidence for either. Saying so is cheaper than being wrong
about it later. The measurement that settles it is a spectrum analyser, and that
is scheduled — see "What is still open".

## Why the fix was not adopted

### The clock change costs video

**B was rejected on sight.** At 130 Hz the panel bands on video.

The precise mechanism matters, because it is not the one the existing docs
warned about. `core_display.h` cautions that a lower clock may make the library
"shed bit-planes", costing colour depth. Running the library's own selection
loop (`ESP32-HUB75-MatrixPanel-I2S-DMA.cpp`, the `lsbMsbTransitionBit` while
loop) with this panel's real numbers — 128 px per row, 32 rows per frame, 8-bit
depth, `CLKS_DURING_LATCH = 0` — shows that is *not* what happens here:

| Clock | `min_refresh_rate` | `lsbMsbTransitionBit` | Actual refresh |
|---|---|---|---|
| 16 MHz | 240 | 4 | ~260 Hz |
| 8 MHz | **96** | **4 — identical** | ~130 Hz |
| 8 MHz | 150 | 5 | ~177 Hz |
| 8 MHz | 200 | 6 | ~217 Hz |
| 8 MHz | 240 | 7 (maximum sacrifice) | ~244 Hz |

Both shipped configurations land on transition bit 4. **Colour depth is
identical between A and B.** The gradient banding the source comment warns about
is not what we saw; what we saw is rolling-shutter banding from the refresh rate
falling 260 → 130 Hz, which is exactly the artefact `min_refresh_rate = 240` was
chosen to prevent in the first place.

Note the third row of that table, because it is a trap worth naming: dropping
the clock to 8 MHz while *leaving* `min_refresh_rate` at 240 forces transition
bit 7, the maximum colour-depth sacrifice. Lowering `min_refresh_rate` alongside
the clock is not a concession — it is required, and the reporter was right to
pair them.

There is a middle: 177 Hz or 217 Hz at 8 MHz, buying refresh back by paying in
colour depth. Neither was tested. Both are worse than stock in one axis or the
other, and there is no reason to spend the visual budget before knowing what the
clock is worth in dB.

### The TX power change cannot be taken at all

The report also raises `PF_WIFI_TX_POWER` from 13 dBm to `WIFI_POWER_19_5dBm`,
on the reasoning that the 13 dBm default starves the uplink.

**That is not a conservative default. It is a conformance fix**, and the reason
is written where the value is set, in `net_config.h`:

> The ESP32 default is `WIFI_POWER_19_5dBm` — the maximum — which with the
> WROOM-1 antenna's gain can sit at or over the EU 20 dBm EIRP limit, so a
> conformance failure on output power / EIRP is fixed here.

Raising it undoes that. If the uplink genuinely needs more, the same comment
names the smaller step (`WIFI_POWER_17dBm`) and the condition attached to it:
take the number from a test report, not from a guess.

Worth noting for anyone reading the original report's numbers: its final row
(0–1% loss) includes the TX power change, while the row above it (8 MHz +
refresh + latch, at 9%) does not. A meaningful part of the headline improvement
may rest on the one change that cannot ship.

### A smaller note on `latch_blanking`

The report sets `latch_blanking = 12`. The library's own maximum is 4
(`MAX_LAT_BLANKING`), and `setLatBlanking()` clamps to it — but assigning
`mxconfig.latch_blanking` directly, as the config struct allows, bypasses that
clamp. It is not dangerous: the value is consumed as `(_width - _blank)` in the
OE-window calculation, so 12 costs roughly 8% of the brightness window on a
128-pixel row and nothing else. It is simply an unvalidated setting, and
"negligible visually" is an impression rather than a measurement.

## What is still open

A radiated-emissions pre-scan in a 3 m chamber is booked for **2026-08-26**, and
it varies exactly the things this report touches: 16 MHz versus 8 MHz, panel DMA
stopped versus running, black frame versus content. That measurement replaces
packet loss as a proxy with a spectrum, and it answers the question this log
cannot:

**How many dB does the panel clock actually own?**

The answer decides what to do next, and the two outcomes point opposite ways:

- **A large number** justifies spending on the physical mitigations — ferrite on
  the ribbons, shorter and better-routed ribbons, ground-return rework, possibly
  a shield between the driver area and the antenna. Those buy the same headroom
  without costing video quality, which is why they are the interesting half of
  the report.
- **A small number** means the clock is not the culprit, our unit's 28 → 6 ms
  was bus contention rather than RF, and the reporter's board has a problem that
  a firmware setting was only masking.

One thing the chamber does *not* need to test: `min_refresh_rate`. The DMA
streams continuously at `i2sspeed` regardless, so total transitions per second
are set by the clock alone; refresh rate is just clock ÷ frame size. The 8 MHz
variant already captures the whole of the emissions benefit.

## If your unit's Wi-Fi is bad

In this order, cheapest and least destructive first:

1. **Check whether it is actually this.** Flash a build with the display code
   out of the picture, or simply compare ping while the panel is driven versus
   not. If a display-free sketch is also bad, the problem is elsewhere entirely.
2. **Clip ferrite rings onto both HUB75 ribbons**, at the PCB end. This is the
   first thing `core_display.h` tells you to try and the only mitigation with no
   downside.
3. **Shorten the ribbons and route them away from the module's antenna corner.**
4. **Inspect and re-flow the ground joints.** A solid ground return measurably
   reduces what the ribbon radiates; this is the most likely difference between
   a board that shows 0% loss and one that shows 90%.
5. **Only then consider the panel clock**, understanding that 8 MHz costs
   video-visible banding at any `min_refresh_rate` that keeps colour depth, and
   that `docs/investigations` now contains the measurements above rather than an
   assumption.

**Do not raise the Wi-Fi TX power.** See above.

## Method notes (the parts worth stealing)

- **Alternate the builds, do not batch them.** Flash A, measure, flash B,
  measure, flash A again. Wi-Fi latency drifts with whatever else is on the
  network; a batched A-then-B comparison cannot tell a real effect from a quiet
  ten minutes.
- **Make the firmware print what the library chose, not what you asked for.**
  `calculated_refresh_rate` is public. One `Serial.printf` at the end of
  `initDisplay()` turned a page of arithmetic about `lsbMsbTransitionBit` into a
  fact, and confirmed it exactly — which also means the arithmetic can be
  trusted for the untested rows of that table.
- **A "settings" change that moves two variables is two experiments.** Clock and
  refresh rate travel together here out of necessity, and clock changes both RF
  and bus load. Naming the confound is not pedantry when the next step costs a
  chamber booking.
- **The reporter's most valuable artefact was the bisect table, not the patch.**
  The patch could not be taken. The table is what made the report actionable and
  what this whole investigation is built on.

---

*This came in unsolicited from **cartoonmonkeystudio (CE)** on Discord —
someone who hit a wall on their own board,
worked it out properly, and wrote it up so it would be useful to other people
rather than just to themselves. Two of the four changes cannot ship and one is a
compliance hazard — and it was still worth every hour spent on it, because the
diagnosis underneath was right and nobody here had measured it. The chamber trip
on the 26th is asking a better question than it would have without this report.
Thank you.*
