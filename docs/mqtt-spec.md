# Patternflow MQTT contract

**Version 1.0** (2026-09-14). Sibling of [`rest-api.md`](rest-api.md) (HTTP), [`osc-spec.md`](osc-spec.md) (OSC) and [`midi-spec.md`](midi-spec.md) (network MIDI); the table for choosing between the four is [Choosing a transport](rest-api.md#choosing-a-transport). MQTT ships in the **Performance** edition ([`EDITIONS.md`](EDITIONS.md)); a build without it serves neither the topics below nor `GET /api/mqtt`. The implementation is `firmware/patternflow/features/mqtt/`; this file is what a client is written against.

What MQTT is for: putting the panel on the bus a home or a venue already runs (Home Assistant, Node-RED, a lighting desk), and making two panels follow each other. It reaches the knobs, the pattern, a banner message and sleep — not firmware update, pattern install or Wi-Fi, which stay on HTTP.

## Transport

| | |
| :--- | :--- |
| Broker | Any MQTT 3.1.1 broker. Set on the panel's **MQTT** console page or with `POST /api/mqtt` (host, port, user, password, prefix, role). Passwords are stored on the panel and never reported back. |
| Prefix | One topic prefix per panel, default `patternflow`. The prefix **is the channel** (below). No wildcards are used, so an ACL can be an exact list. |
| Roles | `off` (socket closed) · `publisher` (sends knobs, pattern and, on a show channel, a snapshot heartbeat) · `subscriber` (applies the retained snapshot, then follows the live topics). The two are exclusive: a Publisher ignores incoming knob and pattern writes. `GET /api/mqtt` reports the current role and `POST /api/mqtt?role=subscriber` flips it. |
| Channels | Prefix `patternflow` is **Broadcast**; `patternflow1` … `patternflow4` are **channels 1–4**; `patternflow5` is **Live**; anything else is **Custom**. Channels 1–4 force the Subscriber role. `GET /api/mqtt` reports the channel as `broadcast`, `ch1`–`ch4`, `live`, `custom` or `off`. |

## Topics

All under `<prefix>/`. Direction is from the panel's point of view.

| Topic | Direction | Payload | Retain | Obeyed in |
| :--- | :--- | :--- | :--- | :--- |
| `knob/1` … `knob/4` | out (publisher), in (subscriber) | absolute accumulated click count, signed integer | no | subscriber |
| `param/1` … `param/4` | out (publisher), in (subscriber) | absolute `0`–`1000`; empty payload releases the hold | no | subscriber |
| `pattern` | out (publisher), in (subscriber) | the pattern's display name or slug | no | subscriber |
| `message` | in | banner text shown on the panel | broadcast: yes · channels: no | either role |
| `sleep` | in | `1` / `on` / `true` / `sleep` · `0` / `off` / `false` / `wake` · `toggle` | no | either role |
| `sleep/state` | out | `0` or `1`, on every change and once per connection | no | — |
| `snapshot` | out (publisher, every 8 s), in (subscriber) | compact JSON of the mid-join state, including `param:[a,b,c,d]` | yes | channels 1–4 and Live only |

Director-only, on a local broker and not part of the public ACL: `query` (panel → its module inventory), `select` (Director → mark modules on `/patterns` for ZIP export), `select/ack` (panel → `{matched, presets, missing, rev}`). Ignore them unless you are that tool.

`sleep` and `message` are the two topics a panel obeys in **either** role: they are "tell the panels something", not "mirror this panel", and a panel that publishes its knobs is still one you want to switch off from home automation. Publishing `1` to `<prefix>/sleep` puts the panel to sleep, `0` wakes it, and `sleep/state` mirrors the result — enough for a Home Assistant switch.

## Which topic to write

Decided per pattern by `absoluteReady` in its sidecar (`GET /api/patterns/<slug>/sidecar` — see `rest-api.md`).

- **`absoluteReady: true`** → publish `0`–`1000` to `param/<n>`. The pattern pins that parameter to a fraction of its declared range; the value is idempotent and survives a restart of whatever is driving it. Physical encoder motion releases the hold, so a hand on the panel always wins. An empty payload releases it explicitly.
- **`absoluteReady: false`** (every module built before the parameter bus existed, and presets, which cannot be interrogated) → publish a new absolute click count to `knob/<n>`. The panel diffs it against the last value it received and injects the difference as a detent delta. This is a **relative** control: the pattern integrates the delta through its own step size, so the number you send is not a value the parameter will arrive at.

`knob`, `param` and `pattern` are obeyed **only in Subscriber role**; a Publisher ignores them silently.

## The channel decides whether your writes survive

Channels 1–4 and Live subscribe to the retained `<prefix>/snapshot`, whose `param:[…]` the firmware applies straight onto the knobs, exactly as if it had arrived on `param/<n>`. A Publisher on the channel re-sends one every 8 seconds, and the retained copy is redelivered on every reconnect. So on those five channels an external controller is not the only writer: its value is overwritten a moment later by whatever the snapshot last said, with every write succeeding and nothing reporting an error. The symptom is a control that will not stay where it is put.

**Broadcast has no snapshot subscription.** For one panel driven by one external controller — home automation, a script, a dashboard — **Broadcast + Subscriber** is the combination that behaves. The show channels exist for a Director driving several panels, which is a different job.

## Knob ordering

Two orderings exist. **Physical** is K1–K4 left to right on the front panel. **Logical** is the order patterns read parameters in. The MQTT indices are **logical**, like the OSC indices, `knobs[]` in a sidecar and `/api/status`. The mapping between the two is in `rest-api.md` under [Knob ordering](rest-api.md#knob-ordering).

## Examples

Home Assistant, a switch that sleeps and wakes the panel:

```yaml
mqtt:
  switch:
    - name: Patternflow
      command_topic: patternflow/sleep
      state_topic: patternflow/sleep/state
      payload_on: "0"
      payload_off: "1"
      state_on: "0"
      state_off: "1"
```

Node-RED, driving knob 2 of an `absoluteReady` pattern from a slider: an `mqtt out` node on topic `patternflow/param/2` with the slider's `0`–`1000` value; put the panel on Broadcast in Subscriber role first.

Two panels following each other: point both at the same broker, same prefix on a show channel (`patternflow1`), one as Publisher and the other as Subscriber.

## Version history

- **1.0** (2026-09-14) — first written contract. Lifted verbatim, with no behaviour change, from the header comment of `firmware/patternflow/features/mqtt/core_mqtt.h` and the "Which topic to write" and "The channel decides" sections of `rest-api.md` 1.x.
