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

Send at your analysis rate (the extension sends per animation frame). There
is no keep-alive requirement.

## Version history

- **1** — first written contract: `a=` / `k=` / `d=` / `off=N` / `off`,
  lane semantics, the unknown-prefix rule, the one-in-flight pacing rule.
  Matches firmware 3.8.0 (Audio edition v0.3.1) and extension as shipped in
  `tools/patternflow-audio-extension/`.
