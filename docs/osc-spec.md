# Patternflow OSC Specification

**Spec version: 1.1** · applies to firmware ≥ 2.1.0

Patternflow speaks plain OSC over UDP on the local Wi-Fi network. This document is the contract between the firmware and any host software (the Max for Live bridge in `integrations/ableton/`, TouchDesigner, VCV Rack, Processing, custom scripts…). If you build a new integration, build it against this file, not against the firmware source.

OSC is the low-latency performance transport: knobs and pattern changes, sub-frame, no infrastructure. It does **not** carry device management — no pattern installation, no Wi-Fi, no firmware, no sleep. That lives on the HTTP API, specified in `docs/rest-api.md`, which also has a table comparing what each transport can and cannot do.

## Transport

| | |
|---|---|
| Device → host | UDP to the host, port **9000** (`PF_OSC_REMOTE_PORT`) |
| Host → device | UDP to the device, port **9001** (`PF_OSC_LOCAL_PORT`) |
| Encoding | Plain OSC 1.0 messages. **No `#bundle` support** — send bare messages. |
| Max packet size | 256 bytes each direction |
| Host discovery | The device is reachable as `patternflow.local` (mDNS, when OTA is enabled). |
| Device→host addressing | The device **learns the host automatically**: it replies to whichever IP sent it the last valid OSC packet. Send `/patternflow/ping` once and everything flows back to you. A static `PF_OSC_REMOTE_HOST` can be set in the secrets file for send-only setups. |

Numeric arguments may be sent as OSC `int32` (`i`) or `float32` (`f`); the device accepts both and rounds floats.

## Device → host

| Address | Args | When |
|---|---|---|
| `/patternflow/knob/N/delta` | int | Encoder N (1–4) turned by a hand; signed detent delta for this frame. A knob a lane is moving (microphone, browser/phone audio, weather) is not reported since 1.1 — `PF_OSC_OUT_LANE_MOTION 1` at build time echoes it. |
| `/patternflow/knob/N/clicks` | int | Same event; absolute accumulated click count |
| `/patternflow/button/N/press` | int (1) | Encoder button N pressed |
| `/patternflow/button/N/held` | int (0/1) | Hold state changed |
| `/patternflow/pattern/index` | int | Pattern changed (or announce) |
| `/patternflow/pattern/name` | string | Pattern changed (or announce) |
| `/patternflow/content/mode` | int | Announce (vestigial — content modes were removed; always 0) |
| `/patternflow/app/mode` | int | App mode changed (or announce) |
| `/patternflow/heartbeat` | int (uptime s) | Every 1 s while connected |
| `/patternflow/hello` | string ("Patternflow") | On connect / announce |
| `/patternflow/version` | string (firmware version) | On connect / announce |
| `/patternflow/ip` | string (device IP) | On connect / announce |

"Announce" = the burst sent on Wi-Fi connect, in reply to `/patternflow/ping`, and whenever the learned host changes.

## Host → device

| Address | Args | Effect |
|---|---|---|
| `/patternflow/ping` | none | Learn/refresh sender as the remote host and reply with a full announce (hello, version, ip, pattern index/name, modes). Send this on host startup. |
| `/patternflow/knob/N/delta` | int or float | Virtual rotation on knob N (1–4), applied on top of physical motion at 1× per detent |
| `/patternflow/pattern/index` | int or float | Switch to the pattern at this registry index |
| `/patternflow/content/toggle` | none | **No-op.** Accepted and discarded — the Pattern/Video content-mode split was removed. Kept on the wire so older hosts don't error; don't build against it. |

Unknown addresses are ignored silently. The device drains up to 8 datagrams per frame (~60 fps), so sustained control streams above ~480 msg/s will queue.

## Conventions for future additions

- Everything lives under `/patternflow/`.
- Indices in addresses are 1-based (`knob/1` = leftmost encoder K1).
- New host→device commands must be safe to receive at any time; the firmware buffers them and applies them at a safe point in the main loop.
- Planned (not yet implemented): `/patternflow/slate` (host→device one-frame white flash for A/V sync), `/patternflow/param/...` (absolute pattern parameter values).
- The absolute parameter bus this last item describes now exists — but over MQTT (`<prefix>/param/1..4`, 0..1000) rather than OSC, and readable over HTTP at `GET /api/mqtt`. An OSC spelling of it stays on this list; a host that needs absolute values today should use one of those two. See `docs/rest-api.md`.

## Version history

- **1.1** (2026-09-06) — `knob/N/delta` and `knob/N/clicks` report hand motion only: a knob a lane is moving is not echoed (it never was promised, and on the audio edition a microphone jittering four knobs is two datagrams per knob per frame). `PF_OSC_OUT_LANE_MOTION` restores the old behaviour.
- **1.0** — knob/button/pattern/status out; ping/knob/pattern/content in; auto-learned remote host; int+float args accepted.
