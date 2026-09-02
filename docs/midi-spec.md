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
| **RTP-MIDI** (AppleMIDI, RFC 6295) over Wi-Fi | The panel is a session **listener** on UDP **5004** (control) / **5005** (data) — and an initiator toward one remembered host, see Settings —, session name `Patternflow`, advertised over Bonjour as `_apple-midi._udp` so it appears by name. macOS/iOS: *Audio MIDI Setup → Network* (or any CoreMIDI app). Windows: the free [rtpMIDI](https://www.tobias-erichsen.de/software/rtpmidi.html) driver — add the panel by name or IP, connect, and it is a MIDI port in Live. Linux: `rtpmidid`. Two participants at most. |

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
| **CC 24–27** | Encoder 1–4 turned by a hand. **Default (`outMode=abs`):** the value is a virtual position `0..127` the panel keeps per knob — starts at 64, moves by that knob's `outMul` steps per `outDiv` detents, clamps at the ends — so every DAW reads it as an ordinary knob with nothing to auto-detect; the DAW's takeover mode handles pickup after a clamp. **`outMode=rel`:** `64 ± steps` this frame (binary offset), for hosts that map relative encoders explicitly (Max, TouchDesigner). Live's map-time auto-detection of relative encoders is not reliable with this stream; that is why `abs` is the default. |
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
"midi": {"runtime": true, "channel": 1, "outDiv": [1,1,4,1], "outMul": [1,2,1,1], "outMode": "abs", "host": "192.168.0.23", "rtpPeers": 1, "rtpPeer": "MacBook", "rx": 812, "tx": 40}
```

`runtime` is the device's own switch (the `MIDI` row on the NETWORK screen);
off means the port stays open and everything is dropped, the same convention
as `OSC` and `AUD`.

## Settings

| | |
|---|---|
| `GET /api/midi` | channel, `outDiv`, `outMul`, `outMode`, `host`, session state, counters |
| `POST /api/midi?outMode=abs\|rel` | knobs out as a virtual position (default) or as relative steps. Persisted. |
| `POST /api/midi?outMul=N` | outbound sensitivity the other way: steps per detent, `1..8`. Setting one of `outMul`/`outDiv` above 1 resets the other to 1; the console page shows both as one scale from ×8 through 1:1 to 1/16. |
| `...&knob=1..4` | Apply `outMul`/`outDiv` to one knob; without it, to all four. Each knob keeps its own ratio; `GET` reports `outMul` and `outDiv` as four-element arrays. |
| `POST /api/midi?outDiv=N` | outbound sensitivity: detents per outbound step, `1..16`, persisted on the panel. The encoders have 20 detents a turn, so `1` is 20 steps per turn and `4` is 5. Default `1` (`PF_MIDI_OUT_DIVISOR`). |
| `POST /api/midi?host=<ip>` | A host to **invite**: the panel sends the session invitation itself on boot and again every 20 s while no session is up, so a panel that reboots comes back into the DAW without anyone reopening rtpMIDI or Audio MIDI Setup. The host must accept invitations (rtpMIDI: *Who may connect to me: Anyone*; macOS: the same setting in the Network MIDI window). Empty string clears it. Persisted. |

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
  buttons in/out; Program Change in/out; RTP-MIDI listener on 5004;
  `outDiv` sensitivity, `outMode` (absolute position by default) and a
  remembered `host` to invite, over `/api/midi`.
