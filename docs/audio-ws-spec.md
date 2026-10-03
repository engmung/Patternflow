# Patternflow audio WebSocket — wire protocol

The low-latency path for driving the four knobs from a stream of levels:
browser-tab audio through the Chrome extension today, anything that can open
a WebSocket tomorrow. This document is the contract, the way
[`osc-spec.md`](osc-spec.md) is for OSC and [`rest-api.md`](rest-api.md) is
for HTTP — clients build against this file, not against the firmware source.

Carried by the **audio feature** (Audio edition), so probe before assuming:
`GET /api/status` lists `"audio"` in `caps` when this server exists. The
default build does not have it, and connecting anyway just fails.

## Transport

| | |
|---|---|
| URL | `ws://<host>:81/` — plain WebSocket, no TLS, no subprotocol, no auth beyond being on the LAN (the same trust model as the rest of the device). |
| Port | `81` (`PF_AUDIO_WS_PORT`). The HTTP API stays on 80. |
| Frames | Text, one message per frame, ASCII. |
| Direction | Client → device only. The device sends nothing; read device state over HTTP. |
| Clients | Multiple connections are accepted; last write wins per knob. In practice: one. |

## Messages

| Message | Meaning |
|---|---|
| `a=F,F,F,F` | Set all four lanes at once, each `0..1`. A literal `-` in a slot leaves that lane untouched: `a=0.8,-,-,0.2`. **The message to use for continuous streams.** |
| `k=N,v=F` | Set lane `N` (0..3) to `F` (clamped to `0..1`). |
| `d=N,v=F` | Add a normalized delta `F` (−1..1) to knob `N` — encoder-style motion rather than a level. |
| `off=N` | Release knob `N` back to encoder control. |
| `off` | Release all four. |

Anything else is **silently ignored** — that is the compatibility rule. A new
message type is a new prefix, old firmware drops it, and nothing breaks.

## Semantics — what a "lane" is

`a=` and `k=` drive the **lane**: an absolute, continuous reading the pattern
receives lerped into each parameter's own declared range. It is the same
mechanism the weather feature and the on-board microphone use. Priority per
knob, highest first (see `abi/pf_params.h`):

1. the absolute bus (`POST /api/params`, OSC/MQTT absolute, shows) — exact
   0..1000 set-points;
2. **the lane** — what this protocol writes;
3. encoder deltas.

**Hands always win.** A physical turn of an encoder takes that knob back and
holds it for five seconds; keep streaming and the lane resumes when the hold
expires. `off` is the polite way to leave — send it on disconnect so the
knobs are not parked at your last values (the firmware also releases lanes
when the socket closes).

## Why `a=` exists — pacing a one-connection server

The device is small; treat the socket as having room for exactly one
in-flight message. Check `bufferedAmount === 0` before each send and drop
the frame otherwise — never queue. Four `k=` messages per frame is how this
was learned: after the first send the buffer is never empty, lanes 1..3
dropped in index order, and knob 4 never moved. One `a=` per frame carries
everything, in order, at a quarter of the traffic.

Send at your analysis rate. The extension sends on a 33 ms timer, about
thirty messages a second.

## Holding a value — the 500 ms release

**A lane is handed back to its encoder 500 ms after the last message that
set it.** That is what frees the knobs when a tab is closed or a phone walks
out of range without saying `off`, and it has been in the firmware since the
first version of this protocol. Version 1 of this document said there was no
keep-alive requirement, and that was wrong: a client that skips a frame
because its values did not change loses its lanes half a second into any
steady passage — silence, a paused track, a gate curve resting at one level —
and the next thing it sends starts the pattern's motion from wherever the
encoder had left the knob.

So a client that means to keep driving **resends its last message at least
every 250 ms**, changed or not. The same goes for `k=`. To let go, stop
sending, or say `off`.

The extension in this tree does this: while its tab is silent or paused it
keeps resending, so the knobs rest at each band's resting value until Stop.
The Android capture app (`tools/patternflow-audio-android`) still sends only
when a value changes, so it does not yet hold a steady one.

## The switch on the panel

The device accepts the connection, and every message, whether or not
Audio-React is switched on (the `AUD` row of the panel's NETWORK screen;
`audioRuntime` in `GET /api/audio` and `/api/status`). Switched off, the
messages are parsed and nothing is driven — an open socket is not evidence
that the panel is listening. A client that wants to know reads
`audioRuntime` over HTTP.

## Version history

- **1.1** (unreleased) — no change on the wire. Written down: a lane is
  released 500 ms after its last message, so a steady value has to be resent
  (version 1 said no keep-alive was needed); the extension's send rate is a
  33 ms timer, not the animation frame; the socket accepts messages while
  Audio-React is switched off and ignores them.
- **1** — first written contract: `a=` / `k=` / `d=` / `off=N` / `off`,
  lane semantics, the unknown-prefix rule, the one-in-flight pacing rule.
  Matches firmware 3.8.0 (Audio edition v0.3.1 onward) and the extension as shipped in
  `tools/patternflow-audio-extension/`.
