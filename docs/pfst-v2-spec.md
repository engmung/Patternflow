# PFST v2 — implementation spec

Everything needed to write or port a v2 player, in the order you need it:
the byte layout, the exact semantics with the edge cases spelled out, the
reference implementation as it actually runs on the device, and test vectors
to check yourself against.

The *case* for v2 — why deciseconds, why an ease flag rather than denser
cues, and the hardware measurements — is in
[pfst-v2-proposal.md](pfst-v2-proposal.md). This file is the contract.

**Status:** shipped in Patternflow firmware v3.6.3
(`firmware/patternflow/addons/show/core_show.h`) and in the site's
encoder/decoder
(`web/src/lib/community/performance.ts`). v1 tables are byte-identical to
what they always were.

---

## 1. What changed from v1

Three things. Nothing else moves — not one field offset, not the header
size, not the cue size.

| | v1 | v2 |
| --- | --- | --- |
| header byte 4 (`version`) | `1` | `2` |
| time unit for cue `t` and header `length` | seconds | **deciseconds** (0.1 s) |
| cue flag bit 6 (value 64) | unused | **EASE** |

A u16 of deciseconds still covers 6553.5 s ≈ 109 minutes, so nothing
overflows that did not before.

---

## 2. Byte layout

Little-endian throughout. Three regions, in this order:

```
[ header 76 bytes ][ string pool poolBytes ][ cues cueCount x 16 bytes ]
```

Cues start at offset `76 + poolBytes` — **not** at 76. (Easy to get wrong;
the pool is at least 1 byte because offset 0 is the empty string.)

### 2.1 Header (76 bytes)

| offset | size | field | notes |
| ---: | ---: | --- | --- |
| 0 | 4 | `magic` | ASCII `PFST` |
| 4 | 1 | `version` | `1` or `2` |
| 5 | 1 | `flags` | bit 0 = loop; other bits reserved, write 0 |
| 6 | 2 | `length` | show length, **in ticks** (v1 seconds, v2 deciseconds) |
| 8 | 2 | `cueCount` | ≤ 256 |
| 10 | 2 | `poolBytes` | ≤ 4096 |
| 12 | 32 | `title` | NUL-padded, not required to be NUL-terminated if exactly 32 |
| 44 | 32 | `id` | NUL-padded slug |

### 2.2 String pool

`poolBytes` of NUL-terminated strings. Offset 0 is always the empty string
(a single NUL), so an offset of 0 reads as "". `0xFFFF` means *no string*.

### 2.3 Cue (16 bytes)

| offset | size | field | notes |
| ---: | ---: | --- | --- |
| 0 | 2 | `t` | cue time **in ticks** |
| 2 | 1 | `flags` | see below |
| 3 | 1 | `reserved` | write 0 |
| 4 | 2 | `patternOff` | pool offset, `0xFFFF` = none |
| 6 | 8 | `param[4]` | four u16, channel value 0..1000 — read only where the flag bit says so |
| 14 | 2 | `messageOff` | pool offset, `0xFFFF` = none |

Cue flags:

| bit | value | meaning |
| ---: | ---: | --- |
| 0 | 1 | PATTERN — `patternOff` names a pattern to switch to |
| 1 | 2 | PARAM1 — this cue sets channel 1 |
| 2 | 4 | PARAM2 |
| 3 | 8 | PARAM3 |
| 4 | 16 | PARAM4 |
| 5 | 32 | MESSAGE — `messageOff` names a banner string |
| 6 | 64 | **EASE (v2)** — interpolate the channels this cue sets |
| 7 | 128 | reserved |

Cues are stored sorted by `t` ascending. Several cues may share a `t`; they
fire in table order.

---

## 3. EASE semantics

> On a cue with EASE, **for each channel that cue sets**, interpolate
> linearly from this cue's value for that channel to **that channel's next
> value**, arriving exactly when the cue carrying it fires.

Everything else about cue firing is unchanged from v1: a cue still applies
its pattern switch, its banner and its parameter values once, when the
playhead crosses `t`.

### 3.1 Per channel, not per cue

"That channel's next value" is found **per channel**. One EASE cue setting
channels 1 and 3 arms two independent segments that may end at different
times — whichever cue next sets channel 1, and whichever next sets
channel 3.

### 3.2 The edge cases, decided

| situation | behaviour |
| --- | --- |
| EASE cue, but the channel has **no later cue** | no interpolation — the value holds, exactly like v1 |
| the channel's next cue is at the **same `t`** | no interpolation (zero-length segment) — the later cue's value wins when it fires |
| the next cue **also has EASE** | segments chain: it ends this one on arrival and arms the next |
| a **non-EASE** cue sets a channel that is mid-ease | the ease ends there; the new value holds |
| the show **loops** | all ease state is cleared at the wrap; no interpolation across the loop point |
| the show **stops / unloads / a new show loads** | ease state cleared |
| a **physical knob** moves that channel | the absolute hold is released as in v1; the ease stops mattering because the channel is no longer driven |
| `t1 <= t0` for an armed segment | disarm, hold the from-value (defensive; the encoder never emits it) |

### 3.3 The value function

For an armed channel with segment `(t0, v0) → (t1, v1)` and playhead `now`
(all in the same unit):

```
now <= t0        →  v0           (the firing cue already applied it)
t0 < now < t1    →  round(v0 + (v1 - v0) * (now - t0) / (t1 - t0))
now >= t1        →  disarm; the cue at t1 fires v1 exactly
```

Note the endpoint rule: the player does **not** interpolate to the end
value, it disarms and lets the terminating cue fire it. That way the exact
authored value lands even if a frame is late.

**This is a pure function of the clock.** Sample it at 30 fps or 200 fps and
the trajectory is identical — there is no accumulator, no per-frame step, and
therefore no locked refresh rate required.

### 3.4 What the ease is *for*

Only the four absolute parameter channels. Pattern switches and banner
messages are events and never interpolate, whatever the flag says.

---

## 4. Reference implementation

From `firmware/patternflow/src/core_show.h` as it ships in v3.6.3 — about
50 lines total. (The player moved to `addons/show/core_show.h` after that
release; the code below is unchanged by the move.)

### 4.1 State

```c
constexpr uint8_t VERSION2  = 2;
constexpr uint8_t FLAG_EASE = 64;      // v2 only

// Milliseconds per time unit: 1000 for v1 (seconds), 100 for v2 (deciseconds).
// One clock, two tick sizes — nothing else changes.
inline uint16_t tickMs = 1000;

inline bool     easeActive[4] = {};
inline uint16_t easeFromV[4]  = {};
inline uint16_t easeToV[4]    = {};
inline uint16_t easeFromT[4]  = {};    // ticks
inline uint16_t easeToT[4]    = {};    // ticks

inline void clearEase() { for (int i = 0; i < 4; i++) easeActive[i] = false; }
```

### 4.2 Load — accept the version, set the tick size

```c
if (header.version != VERSION && header.version != VERSION2) return fail(...);
tickMs = (header.version == VERSION2) ? 100 : 1000;
clearEase();
```

Call `clearEase()` anywhere playback restarts or ends: `stop()`, `unload()`,
the loop wrap, and the natural end.

### 4.3 Arming, when a cue fires

The scan runs **once per fired cue**, never per frame — at most 256
iterations, and it stops at the first cue that touches the channel.

```c
for (int i = 0; i < 4; i++) {
  if (!(cue.flags & (FLAG_PARAM1 << i))) continue;
  uint16_t v = cue.param[i];
  applyParam(i, v);                       // the v1 path, unchanged

  easeActive[i] = false;                  // any set ends a running ease
  if (header.version != VERSION2 || !(cue.flags & FLAG_EASE)) continue;

  for (uint16_t j = cueIdx + 1; j < cueCount; j++) {
    if (!(cueTable[j].flags & (FLAG_PARAM1 << i))) continue;
    if (cueTable[j].t > cue.t) {          // same-t next cue → no segment
      easeActive[i] = true;
      easeFromV[i] = v;                   // the value actually applied
      easeToV[i]   = cueTable[j].param[i];
      easeFromT[i] = cue.t;
      easeToT[i]   = cueTable[j].t;
    }
    break;                                // first cue that touches i decides
  }
}
```

`easeFromV[i] = v` takes the value **as applied**, not `cue.param[i]` — so a
feature that perturbs a cue's value (Patternflow's per-run "variance" roll)
eases from where the channel really went.

### 4.4 Per frame

```c
uint32_t elapsedMs = millis() - startedAtMs;
uint32_t lengthMs  = (uint32_t)header.length * tickMs;
uint32_t nowMs     = loop ? (elapsedMs % lengthMs) : elapsedMs;
// ... fire any cues whose t has passed (nowMs / tickMs), as in v1 ...

if (header.version == VERSION2) {
  for (int i = 0; i < 4; i++) {
    if (!easeActive[i]) continue;
    uint32_t t0 = (uint32_t)easeFromT[i] * tickMs;
    uint32_t t1 = (uint32_t)easeToT[i]   * tickMs;
    if (t1 <= t0 || nowMs >= t1) { easeActive[i] = false; continue; }
    if (nowMs <= t0) continue;
    float u = (float)(nowMs - t0) / (float)(t1 - t0);
    long  v = (long)((float)easeFromV[i] +
                     ((float)easeToV[i] - (float)easeFromV[i]) * u + 0.5f);
    applyParam(i, v);
  }
}
```

Cost: four lerps worst case. Measured on an ESP32-S3 at 128×64, frame time
is indistinguishable between idle, v1 playback and v2 playback with two
eased channels (15.7–16.0 ms across all three) — the table is in the
proposal.

---

## 5. Test vectors

Three tables in [`pfst-v2-vectors/`](pfst-v2-vectors/), each a real `.pfs`
the site's encoder produced. Byte dumps below so a decoder can be checked
without running anything.

Common to all three: `magic="PFST"`, `version=2`, `flags=0x00` (no loop),
`poolBytes=1` (the empty string only), so **cues start at offset 77**.

### A — one eased ramp (`a-ease-ramp.pfs`, 109 bytes)

Channel 1 sweeps 0 → 1000 between t=0.0 s and t=3.0 s; show length 50.0 s.

```
header  50 46 53 54 02 00 f4 01 02 00 01 00
        PFST         v2 fl length=500  cues=2  pool=1
cue0    00 00 42 00 ff ff 00 00 00 00 00 00 00 00 ff ff
        t=0   flags=0x42 (PARAM1|EASE)  param[0]=0
cue1    1e 00 02 00 ff ff e8 03 00 00 00 00 00 00 ff ff
        t=30  flags=0x02 (PARAM1)       param[0]=1000
```

Expected channel-1 values (spec §3.3):

| t (s) | 0 | 0.5 | 1.0 | 1.5 | 2.0 | 2.9 | 3.0 | 4.0 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| value | 0 | 167 | 333 | 500 | 667 | 967 | 1000 | 1000 |

### B — eased and jumping at the same tick (`b-mixed-moment.pfs`, 125 bytes)

The mixed moment: channel 1 starts a sweep at t=1.0 s while channel 2 cuts
hard to 250 at the same instant. Two cues at the same `t`, one with EASE.

```
cue0    0a 00 42 00 ff ff 00 00 00 00 00 00 00 00 ff ff   t=10 PARAM1|EASE  p0=0
cue1    0a 00 04 00 ff ff 00 00 fa 00 00 00 00 00 ff ff   t=10 PARAM2       p1=250
cue2    19 00 02 00 ff ff e8 03 00 00 00 00 00 00 ff ff   t=25 PARAM1       p0=1000
```

Channel 1 ramps 0 → 1000 over 1.0–2.5 s. Channel 2 is 250 from t=1.0 s and
never interpolates. A quantized mode-picker knob stays a hard cut.

### C — chained eases (`c-chained.pfs`, 125 bytes)

```
cue0    00 00 42 00 ff ff 00 00 00 00 00 00 00 00 ff ff   t=0  PARAM1|EASE  p0=0
cue1    14 00 42 00 ff ff 20 03 00 00 00 00 00 00 ff ff   t=20 PARAM1|EASE  p0=800
cue2    28 00 02 00 ff ff c8 00 00 00 00 00 00 00 ff ff   t=40 PARAM1       p0=200
```

Up 0 → 800 over 0.0–2.0 s, then down 800 → 200 over 2.0–4.0 s. At t=2.0 s
cue1 fires 800 exactly and re-arms; the direction reverses with no
discontinuity.

Checks worth running against your player:

1. **Decoder**: reject `version` ∉ {1, 2}; find cues at `76 + poolBytes`.
2. **Vector A** at t=1.5 s reads 500 ±1 (rounding), not 0 and not 1000.
3. **Vector B**: channel 2 is never anything but 0 then 250.
4. **Frame-rate independence**: run A at two different loop rates; sample
   both at the same wall-clock times and compare — identical within rounding.
5. **Loop**: set the loop flag on A and confirm channel 1 snaps to 0 at the
   wrap rather than sliding back from 1000.

---

## 6. Compatibility

| player \ file | v1 file | v2 file |
| --- | --- | --- |
| v1 player | unchanged | **must reject** — version byte ≠ 1 |
| v2 player | unchanged: seconds, no ease | plays smoothly |

The one requirement on a v1 player is that it already refuses an unknown
version byte. A clean "unsupported version" is the whole safety story here:
misreading deciseconds as seconds would play a show at 10× length rather
than failing.

Writers should keep emitting v1 for anything that must play on older
firmware. The site does exactly that: `encodePfst` is gated on the version
field and the v1 path is pinned byte-for-byte against the Director's demo
tables in `performance-smoke`.
