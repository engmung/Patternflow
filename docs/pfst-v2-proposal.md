# PFST v2 — sub-second cues and eased parameters

A proposal to evolve the show-table format so performances play smoothly on
the panel. Written against the v1 format as implemented in the Director's
`show-table.js`, the device player, and the site's encoder
(`web/src/lib/community/performance.ts`, which already implements everything
below behind the version byte).

> **Implementing it?** This document is the *case* for v2 — the reasoning and
> the hardware measurements. The contract lives in
> **[pfst-v2-spec.md](pfst-v2-spec.md)**: byte layout, the edge cases decided
> one by one, the reference player as it ships, and test-vector `.pfs` files
> with expected trajectories.
>
> **Status: shipped** in Patternflow firmware v3.6.3 — the proposal below was
> written before that and reads as a proposal; nothing in it changed on the
> way in.

## Why

v1 cue times are whole seconds (`t` is a u16 of seconds), and the player sets
the four absolute channels once per cue and holds. Knob motion therefore
steps at 1 Hz — clearly visible on any slow sweep. The knobs themselves are
not the limit: the absolute bus is continuous (the live Director already
drives it over MQTT at whatever rate it likes). The limit is only what the
file can express and what the player does between cues.

The obvious fix — keep the format, bake denser cues — does not survive the
cue budget. At 0.2 s spacing, one continuously-animated channel spends the
whole 256-cue table in 51 seconds; four channels, in 12. Dense baking makes
smoothness a *cue-count* cost, and the budget is the scarce resource.

v2 makes smoothness a *per-cue property* instead: a fraction-of-a-second
time grid for placement, and an EASE flag that tells the player to
interpolate. A 60-second sweep is 2 cues. A full ease-in-out curve is ~10
(the encoder flattens the bezier into linear pieces until the chord tracks
it within 0.8 % of the wire range). Measured on the site's encoder: a 60 s
curve costs 61 cues in v1 and 11 in v2, tracking the authored curve within
1 % at every 50 ms sample.

## Format changes (everything else is byte-identical)

Two reinterpretations and one flag bit. Header stays 76 bytes, cues stay 16
bytes, the string pool, title/id fields, magic, loop flag, and all offsets
are unchanged.

1. **`version` (header byte 4) = 2.**
2. **Times are deciseconds.** Cue `t` and the header `length` count 0.1 s
   ticks. A u16 still covers 6553.5 s ≈ 109 minutes.
3. **Cue flag bit 6 = EASE** (value 64; bits 0–5 keep their v1 meanings,
   bit 7 stays reserved). On a cue that sets param channels, EASE means:
   *for each channel this cue sets, interpolate linearly from this cue's
   value to that channel's next value, arriving exactly when that next cue
   fires.* Channels the cue does not set are unaffected. A cue without EASE
   holds, exactly like v1 — deliberate jumps stay jumps.

## Player changes

Per rendered frame, per channel (pseudo-code):

```c
// prev = last fired cue that set this channel (value, t, ease flag)
// next = first upcoming cue that sets this channel (value, t)
if (prev.ease && next && next.t > prev.t) {
    float u = (now - prev.t) / (float)(next.t - prev.t);
    channel = prev.value + (next.value - prev.value) * u;   // 0..1000
} else {
    channel = prev.value;                                    // v1 behaviour
}
```

Cost: at most four lerps per frame — noise next to one frame of pattern
math. No allocation changes: same cue struct, same table size, and the
`next` lookup is an index the player already advances (keep one per channel,
or scan forward from the cursor — 256 entries either way).

Cue *firing* (pattern switches, messages, setting the base values) stays the
existing once-per-cue logic; only the between-cues value of eased channels
changes.

## Performance and predictability, against the real player

Two fair concerns were raised: curve "rendering" cost on the ESP32, and
whether playback needs a locked refresh rate to stay predictable. Both
dissolve against the code as it stands:

- **There is no curve to render on the device.** Flattening happened at
  encode time; the file carries only linear-piece endpoints. Per frame, an
  eased channel costs one subtraction, one float divide, one multiply, one
  add, and a five-line local store (`applyRemoteParam` — clamp, flag, u16,
  timestamp; no publish, no NVS, no allocation). Four channels worst case is
  a few hundred cycles against a frame budget of ~5 million (240 MHz at
  46 fps) — about what three or four pixels of the pattern loop cost. There
  is no independent "sampling rate" to choose: the lerp is evaluated by the
  loop the player already runs, and `tick()` is already called every frame
  today.
- **No locked refresh rate is needed, by the same principle the player
  already uses.** Cue firing is parameterized on the wall clock
  (`millis() - startedAtMs`), not stepped per frame — and the eased value is
  likewise a pure function of *now*: `v(t) = a + (b−a)·(t−t0)/(t1−t0)`.
  Frame-rate jitter changes how often the line is sampled, never where it
  is. A playback at 46 fps and one at 30 fps pass through identical values
  at identical times. (A design that *integrated* steps per frame would need
  the lock; this one is the other kind.)
- **Quantized parameters keep jumping.** Some knobs are mode pickers and
  must never sweep through intermediate values — which is why ease is
  per-cue, not global. A hold cue behaves exactly as v1: value until the
  next cue, then jump. One moment can even mix both: an eased channel and a
  jumping channel at the same tick encode as two cues at the same `t` (one
  with EASE, one without), which the encoder already emits and the player
  fires back-to-back. Smooth is available where it is wanted; hard cuts
  stay hard.

A reference implementation of the above exists against the current player
(`core_show.h`, branch `fw/pfst-v2`): ~50 lines — version gate, `tickMs`
(1000/100), ease arm on cue fire (one ≤256-entry scan per fired cue), and
the per-frame lerp block. Loop wrap, natural end, and stop() all clear the
ease state through the paths that already existed.

**Measured on hardware** (2026-08-24, ESP32-S3 128×64, the branch above
flashed wirelessly; same 60 s show authored once and encoded both ways;
`/api/mqtt` polled at ~130 ms for the parameter trajectory, `frameUs` from
`/api/status`):

| | idle | v1 playing | v2 playing (2 ch eased) |
| --- | --- | --- | --- |
| frame time | 15.9–16.0 ms | 15.7–15.9 ms | 15.7–15.8 ms |

Frame time is indistinguishable across all three — the lerp cost is below
measurement noise. Trajectories over the same 11 s window: the eased
channel produced **12 distinct values under v1** (the 1 Hz staircase,
~100-wire jumps) and **89 under v2** (a new value on essentially every
poll, max step 6 wire units — continuous to the eye). The quantized
channel jumped 0→250 once, identically in both versions (hard cuts
preserved), and the untouched fourth channel kept `paramActive = false`
throughout — the physical knob stays live during a show.

## Compatibility

| player \ file | v1 file | v2 file |
| --- | --- | --- |
| v1 player | unchanged | **must reject** (version byte ≠ 1) |
| v2 player | unchanged (seconds, no ease) | plays smoothly |

The one hard requirement on today's firmware is that it already refuses
`version != 1` — a clean "unsupported version" beats misreading deciseconds
as seconds at 10× length. The site's decoder accepts both versions.

## What the site already ships

- `encodePfst`/`decodePfst` handle both versions, gated on the byte; the v1
  path is byte-for-byte what it always produced (pinned in
  `performance-smoke` against the Director's four demo tables).
- The canonical JSON carries `version: 2` and per-cue `ease: true`; the
  validation rail accepts it.
- Pattern Lab's Director panel authors keyframes with bezier ease curves and
  can bake either target: the v1 staircase it exports today, or v2 sparse
  eased cues (`bakeShowV2`) — the v2 export stays unexposed until a player
  exists, so nobody downloads a file nothing plays.
- The lab's own player already implements exactly the v2 semantics
  (`smooth` mode) next to the v1 semantics (`steps` mode), so the two
  behaviours can be compared live on any show.

## Deliberately not included

- **Ease curve types** (the reserved cue byte could carry them): linear
  pieces at 0.8 % tolerance already reproduce arbitrary beziers, and one
  interpolation rule keeps the player trivial.
- **Per-channel ease bits** (the reserved byte could carry four): the same
  moment is expressible today as two cues at one `t` (eased channels on one,
  jumping channels on the other), so the extra bits would only save a cue
  row in the mixed case. Easy to add later without touching anything else
  if that ever matters.
- **Raising the 256-cue cap**: v2 removes the pressure that motivated it.
  If ever wanted, the cue table already lives in PSRAM on the current
  firmware, so it is a constant, not a redesign.
- **Sub-decisecond grids**: 0.1 s placement + continuous interpolation is
  below what the eye resolves on knob-driven motion.
