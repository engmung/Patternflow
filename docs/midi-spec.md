# Patternflow MIDI Specification

**Spec version: 1.0** · applies to the `midi` feature (Audio edition ≥ v0.5.0)

Patternflow is a MIDI device: four knobs and four buttons in, four knobs and
four buttons out, and a pattern selector. This document is the contract
between the firmware and anything that speaks MIDI to it — a DAW, a hardware
controller through a computer, a phone app. Build against this file, not the
firmware source.

MIDI is the second performance transport beside [OSC](osc-spec.md). Where OSC
is a bespoke address space, MIDI is the thing every DAW and controller already
speaks, and it carries one thing OSC deliberately does not: **absolute knob
values**. A Live clip made from the Director's `.mid` export
([director-midi.md](director-midi.md)) drives the panel with the identical
automation, because both sides agree on the same four controllers.

Like OSC it does **not** carry device management — no pattern installation,
no Wi-Fi, no firmware, no sleep. That is the HTTP API
([rest-api.md](rest-api.md)).

## Transport

The mapping below is transport-independent. What ships today:

| | |
|---|---|
| **RTP-MIDI** (AppleMIDI, RFC 6295) over Wi-Fi | The panel is a session **listener** on UDP **5004** (control) / **5005** (data), session name `Patternflow`, advertised over Bonjour as `_apple-midi._udp` so it appears by name. macOS/iOS: *Audio MIDI Setup → Network* (or any CoreMIDI app). Windows: the free [rtpMIDI](https://www.tobias-erichsen.de/software/rtpmidi.html) driver — add the panel by name or IP, connect, and it is a MIDI port in Live. Linux: `rtpmidid`. Two participants at most. |

Channel: **1** by default (`PF_MIDI_CHANNEL`; `0` listens on every channel
and sends on 1). MIDI Thru is off — the panel never echoes a host's messages
back to it.

## Host → device

| Message | Meaning |
|---|---|
| **CC 20 · 21 · 22 · 23** | Knob 1–4, **absolute**. `0..127` maps to the device's `0..1000` bus (rounded; 127 = 1000). The value **holds** until a hand turns that knob, exactly like `POST /api/params` and MQTT `param/N`. |
| **CC 24 · 25 · 26 · 27** | Knob 1–4, **relative**. `64` = no motion, `65` = +1 detent, `63` = −1, and so on (two's-complement offset). Merged with physical motion at 1× per step — the same lane as OSC's `/patternflow/knob/N/delta`. Does not release an absolute hold. |
| **Note 60 · 61 · 62 · 63** (C4–D♯4) | Button 1–4. Note-on = press (edge), the button reads as held for as long as the note is held; note-off (or velocity 0) releases. |
| **Program Change `n`** | Select pattern index `n` (0-based, the order on `/patterns`). Treated as a person's choice: it is remembered across reboots, like a knob pick. Ignored while a show claims the panel. |

Everything else is ignored. Messages on another channel are ignored unless
the channel is `0`.

### Precedence

The device's rules, not MIDI's: **a hand on an encoder beats everything.** An
absolute CC pins a knob until that encoder moves; relative CCs and notes are
just more input, and the audio lanes yield to both.

## Device → host

| Message | When |
|---|---|
| **CC 24–27**, value `64 ± d` | Encoder 1–4 turned by a hand: `d` detents this frame (clamped ±63). Relative on purpose — the panel has no absolute position to report; a DAW's *relative (binary offset)* MIDI-map mode reads it directly. |
| **Note-on 60–63**, velocity 127 | Encoder button 1–4 pressed |
| **Note-off 60–63** | Released |
| **Program Change `n`** | The pattern changed (by anyone: knob, console, OSC, MIDI, a show), for `n ≤ 127` |

What the host receives is **the hand's share only**: a CC or note the host
itself sent is never reflected back, so mapping the panel's output onto the
same track that automates it does not double-record.

## Status

`GET /api/status` on a build with this feature lists `"midi"` in `caps` and
carries

```json
"midi": {"runtime": true, "channel": 1, "rtpPeers": 1, "rtpPeer": "MacBook", "rx": 812, "tx": 40}
```

`runtime` is the device's own switch (the `MIDI` row on the NETWORK screen);
off means the port stays open and everything is dropped, the same convention
as `OSC` and `AUD`.

## Why these numbers

- **CC 20–27** are *undefined* controllers in the MIDI spec — nothing in a
  DAW listens to them by accident, and the Director's export already chose
  20–23. Relative lanes sit right after.
- **Notes 60–63** are the four keys any keyboard or pad grid has under the
  hand at middle C.
- **Program Change** is what a pattern list *is* in MIDI's vocabulary. The
  limit of 128 covers every panel anyone has filled.

## Version history

- **1.0** — CC 20–23 absolute in; CC 24–27 relative in/out; notes 60–63
  buttons in/out; Program Change in/out; RTP-MIDI listener on 5004.
