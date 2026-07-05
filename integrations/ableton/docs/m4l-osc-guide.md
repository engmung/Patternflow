# OSC in Max for Live — the parts that bite

Everything in this guide was learned the hard way while wiring Patternflow into Ableton. It applies to any OSC hardware, not just Patternflow. Read this before debugging for an hour.

## Receiving OSC in Max

`[udpreceive 9000]` is all you need. It decodes incoming OSC automatically: a packet with address `/patternflow/knob/1/delta` and one int argument comes out of the outlet as the Max message `/patternflow/knob/1/delta 3`. Route it with `[route /patternflow/knob/1/delta ...]` or feed everything into a `[js]` and dispatch in `anything()` (what the bridge does).

Things that go wrong:

- **Nothing arrives at all → it's almost never Max.** Check, in order:
  1. **Firewall.** On Windows, the first time Max opens a UDP port a firewall prompt appears — if it was dismissed, incoming packets are dropped silently. Windows Security → Firewall → Allow an app → make sure *Max* (and *Ableton Live*) are allowed on private networks.
  2. **Same network.** Phone hotspots and guest Wi-Fi networks often isolate clients from each other (AP/client isolation). Both the computer and the device must be on the same normal LAN.
  3. **Port already taken.** Only one process can bind UDP 9000. A second `[udpreceive 9000]` — including one in a *second instance of the same device* on another track — silently gets nothing. One bridge per Live set.
- **`oscparse` is not needed** for plain messages. It's for working with OSC as dicts. If you see tutorials chaining `udpreceive → oscparse → ...`, that's an alternative style, not a requirement.
- **`#bundle` packets**: Max's `udpsend` sends bare messages, which is what Patternflow expects. If you use CNMAT's `o.` externals or python-osc's bundle mode, disable bundling — the device ignores bundles.

## Sending OSC from Max

`[udpsend patternflow.local 9001]`, then send it the message `/patternflow/ping`. Change target at runtime with `host <name-or-ip>` and `port <n>` messages.

- **mDNS (`patternflow.local`)** resolves fine on macOS and on Windows 10/11. If it doesn't (some corporate networks block mDNS), use the raw IP from the device's K2-longpress info screen.
- **Int vs float**: Max number boxes emit floats unless you're careful, and a float where an int is expected is the classic "silently ignored" OSC bug. Patternflow's firmware accepts both and rounds — but other OSC devices you'll meet won't. When in doubt, force ints in Max before `udpsend`.

## Driving Live parameters: `live.remote~`

`live.remote~` is the only object that can move a Live parameter continuously without creating undo history and without automation-lane fighting. The gotchas:

- **Bind by id**: send it `id 42` where 42 is a `LiveAPI` object id for a parameter (`DeviceParameter`). Send `id 0` to unbind. The `id` message goes into the **right inlet** — the left inlet only takes values, and an `id` sent there is rejected (red error in the Max window) so the parameter never locks. This one cost us an evening.
- **The parameter locks.** While bound, the parameter is greyed out in Live's UI, shows "Mapped", and the mouse can't move it. This scares people into thinking something broke. Unbind to release it.
- **Values are in the parameter's native range**, not 0–1. Read `min` and `max` from the parameter via `LiveAPI` and scale yourself: `out = min + v * (max - min)`. (This is what the M4L LFO does internally.)
- **Zipper noise**: `live.remote~` accepts both signals and floats. Float messages at encoder-event rate are fine for filter sweeps; for very zipper-sensitive targets (gain on a sustained pad), interpolate with `line~ → live.remote~` at signal rate.

## The Live API from `[js]`

- **You cannot touch `LiveAPI` in global code or `loadbang`.** The API isn't ready; calls fail or return id 0. Wait for the `[live.thisdevice]` bang — that is the "Live is ready" signal.
- **Ids are session-local; paths are not stable either.** A parameter's numeric id changes between Live sessions, and its canonical path (`live_set tracks 0 devices 1 parameters 3`) changes when tracks/devices are reordered. Persist the *path*, re-resolve to an id on load, and accept that reordering tracks may require re-mapping. (Robust tracking needs id-remap observers — v2 territory.)
- **`selected_parameter`** (`live_set view`): don't *read* it when your Map button is clicked — on some Live/OS combos (seen on Live 12 / Windows) it reads as `id 0` by then. Instead *observe* the property and remember the last non-zero id (with a freshness window); then both orders work: param-then-Map uses the remembered id, Map-then-param arms and waits for the next selection change. Same underlying flow as Live's stock LFO.
- **Observer callbacks run in Live's notification context**, and `live.remote~` refuses id changes from there: `Setting the id cannot be triggered by notifications. You will need to defer your response`. In `[js]`, stash the id and `Task.schedule(0)` the bind; in a patch, put `[deferlow]` before the id inlet.
- **Getting values**: `api.get("value")` returns an array — take `[0]`. Same for `min`, `max`, `name`.

## Persistence (mappings that survive save/reload)

M4L devices don't save arbitrary `[js]` state. The pattern that works:

1. Implement `getvalueof()` / `setvalueof()` in the js.
2. Put `[pattr something @bindto <js-varname> @autorestore 1]` in the patch.
3. `pattr` contents are stored in the Live set; `setvalueof()` runs on load.

Two traps: `setvalueof()` may run **before** the `live.thisdevice` bang (so don't touch LiveAPI from it — stash and bind later), and multi-word symbols get flattened in pattr lists (the bridge dodges this by storing paths with dots instead of spaces).

## Feedback loops in the patch

Any UI object you both *read from* and *write to* (number boxes, textedit) will re-emit what you send to its inlet — through your `prepend`, back into your js, forever. Write to displays with a `set`-prefixed message (`set 48`), which updates silently.

## Debugging checklist

1. Device K2 info screen: OSC `READY`/`WAIT HOST`? IP shown?
2. Max console (`Max window`): put `[print rx]` on `udpreceive`'s outlet — do packets arrive when you turn a knob?
3. Nothing? Firewall → same-network → port-conflict, in that order.
4. Packets arrive but the param doesn't move? Is the slot mapped (param greyed in Live)? Is the value scaled to the param's min/max?
5. Worked yesterday, dead today? The laptop's IP changed and the device was on a *static* remote host — click Connect (ping re-teaches the device), or stop using a static host.
