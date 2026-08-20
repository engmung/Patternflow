# Patternflow for Home Assistant

A Patternflow panel as a Home Assistant device: switch it on and off, pick a
pattern, and see how it is doing. Everything runs over the device's own HTTP API
on your LAN — no cloud, no account, nothing leaves the network.

Built against [`docs/rest-api.md`](../../docs/rest-api.md), which is the contract
for the device's HTTP API. If something here disagrees with the device, that file
is the thing to check first.

## What you get

| Entity | |
| --- | --- |
| **Switch** | The panel, on or asleep. On means lit. |
| **Select** | Every installed pattern; picking one switches the panel to it. |
| **Numbers** | The four knobs, as a percentage of whatever the running pattern maps them to. Named after the pattern's own labels. |
| **Sensors** | Free internal memory, free storage, Wi-Fi signal, frame rate, last boot. |
| **Binary sensors** | MQTT connected, storage mounted, console paused. |

Sleep is not deep sleep. The panel goes dark, the HUB75 transfer stops, the CPU
drops to 80 MHz — and the board stays associated to Wi-Fi the whole time, which
is the entire point: a panel you could only wake by walking over and pressing a
button would make this switch a one-way trip.

**Console paused** deserves a word, because it looks like a fault and is not.
Opening the device's own web console evicts the running pattern from RAM to make
room — a console page and a resident pattern module cannot both have the internal
memory they need — and the panel shows a CONSOLE PAUSED card until the console
has been idle for 25 seconds. This integration never touches those pages, so it
never causes that state, but it will show you when something else has.

## Installing

Copy the integration into your Home Assistant configuration directory and
restart:

```bash
cp -r integrations/homeassistant/custom_components/patternflow \
      /path/to/homeassistant/config/custom_components/
```

Then **Settings → Devices & services → Add integration → Patternflow**.

If the panel is on the same network, it usually finds itself: the device
advertises `_http._tcp` over mDNS whenever the browser self-update is compiled
in, and `_arduino._tcp` whenever OTA is, and a discovered panel shows up on the
integrations page on its own. Neither record carries anything Patternflow-
specific, so the integration confirms a find by asking `/api/status` before
offering it — a printer on the same service type is turned away rather than
offered as a panel.

Adding one by hand works too. The default address is `patternflow.local`; if mDNS
is unreliable on your network (it often is on Android), use the IP from the
device's NETWORK screen — hold K2.

## The dashboard card

The integration ships a Lovelace card: the running pattern playing live, the
four encoders laid over it as zones you drag, the panel switch, and the list of
installed patterns.

Add it once as a resource — **Settings → Dashboards → ⋮ → Resources → Add**:

| | |
| --- | --- |
| URL | `/patternflow_static/patternflow-card.js` |
| Type | JavaScript module |

Then **Add card → Patternflow** on any dashboard. It finds the device's entities
itself; the only thing worth setting is which device, if you have more than one.

```yaml
type: custom:patternflow-card
device_id: 1a2b3c...      # optional — it picks the first Patternflow device
preview: true             # run the pattern in the card
show_patterns: true       # list the installed patterns underneath
```

**The gesture is one gesture, mouse or touch.** Where your pointer is
horizontally picks the encoder — four zones, left to right, K1 to K4 — and
dragging up and down turns it. The wheel still works on a desktop, because that
is the muscle memory from the community site's wall. A double tap puts a knob
back to the middle of its range. Only the preview area takes the gesture, so the
card is not a scroll trap on a phone.

**The preview is not a video of your panel.** It is the pattern's own JavaScript
running in a sandboxed iframe in the browser you are looking at, driven by the
knob values Home Assistant holds. The panel is never asked for pixels — it
cannot spare them; a device-streamed frame endpoint was built for exactly this
and removed the same day. So the preview is a faithful rendering of the same
pattern at the same settings, not a mirror. A pattern nobody has turned in a
while will match; one that has just been turned by hand at the device catches up
on the next poll.

That also bounds what can be previewed. The card bundles the JavaScript of the
**Basics pack** — the 33 patterns that ship with Patternflow — matched to the
modules on your device by slug. A community pattern or a hand-built module has
no bundled twin, and a preset has no slug at all; both show the controls without
a picture rather than an error. `preview: false` turns the iframe off entirely.

### Running more than one panel

Give each one its own `PF_OTA_HOSTNAME` in `firmware/patternflow/net_config.h`
and reflash.

This is not a preference. There is no MAC address, serial number or any other
hardware identifier on any endpoint the device serves, so the mDNS hostname is
the only thing that can identify a board — and two panels answering to
`patternflow.local` cannot both be resolved anyway, which is why `net_config.h`
already asks for this. Adding a second default-named panel is refused with an
explanation rather than silently taking over the first one's entry.

## Polling, and why it is not faster

The device runs one synchronous, single-client web server, and its render loop is
paused while a response is being sent. Two requests per poll is the floor this
integration works at: `/api/status` and `/api/mqtt` every tick, the pattern list
every sixth tick and immediately after any change.

The default interval is 10 seconds and the options flow will let you set 5 to 60.
Turning it down is not free. A device-streamed frame preview once existed on this
API and was removed on the day it shipped, because polling it captured the render
loop for seconds at a time and piled requests up until the panel read as dead.
The same lesson applies to any client, including this one.

Everything this integration touches is under `/api/`. It never fetches a console
page, because that would pause the pattern every poll.

## Knobs, and the one asymmetry in this integration

**Reading is HTTP and always works.** `/api/mqtt` reports live knob positions in
any MQTT role, and with no broker configured at all, because the firmware copies
the input frame into that state before it looks at its role. If the endpoint is
missing entirely — a build with `PF_MQTT_ENABLED 0` — the knob entities are not
created, rather than sitting there permanently unknown.

**Writing is MQTT, and needs three things at once:** MQTT set up in Home
Assistant, the panel pointed at a broker Home Assistant can also reach, and the
panel in **Subscriber** role. There is no HTTP alternative — `/api/knob` and
`/remote` existed once and were removed as unused. Sleep and pattern selection
are unaffected; they are HTTP.

Setup offers to make the role change for you when that is the only thing
missing, and says what it costs: a Subscriber stops publishing its own knob
turns, because Publisher and Subscriber are exclusive. You still see the knobs
move, since that reading comes over HTTP rather than from the topics.

When a write cannot land, the slider says why — no broker, wrong role, broker
unreachable, or no MQTT in Home Assistant — instead of failing quietly.

### Absolute and relative, and why the difference shows

Each knob carries an `absolute` attribute, and it changes with the pattern.

`absolute: true` — the pattern was built against the firmware's absolute
parameter bus. The slider is a **set-point**: the device pins the parameter
there, reports it back, and a physical turn of the encoder takes it back. What
you see is what the device is doing.

`absolute: false` — a pattern from before that bus existed, or any preset. The
slider is then a **relative** control. Moving it sends detents; the pattern
integrates them through its own step constant; nothing reads back. The number
shown is what Home Assistant believes, not what the device confirms — the count
in `/api/mqtt` is the physical encoder, and an injected turn never appears
there. Two turns of the knob cross the whole range, matching the encoder, so the
feel is right even though the loop is open.

Presets land in the second category for an unavoidable reason: a preset's
`ABSOLUTE_READY` flag is a C++ constant on the pattern entry and no endpoint
exposes it. Assuming `false` costs a closed loop on one pattern; assuming `true`
would send set-points into a pattern that ignores them, which looks exactly like
a broken integration.

## Not here yet

- **Previews for community patterns.** Only the Basics pack's JavaScript is
  bundled; anything else shows the controls without a picture. A device stores
  compiled modules and no source, so there is nothing to read off the panel.
- **HACS.** The integration lives in `integrations/homeassistant/`, which is the
  right place in this repository and not where HACS looks — it expects
  `custom_components/` at the repository root. Manual installation, above, is
  the supported path for now.
- **Brightness.** `/api/display` reports it but has no way to set it; the value
  lives in the K1 long-press UI and in NVS.
- **Knob labels for compiled-in presets.** A module carries its labels in a
  sidecar the device will serve; a preset keeps them in C++ where no endpoint
  exposes them, so those fall back to K1–K4.
- **Firmware update entity.** `/update/status` is there; nothing reads it yet.

## Developing

```bash
cd integrations/homeassistant
pip install ".[dev]"     # needs Python 3.13, same as Home Assistant
ruff check . && ruff format --check .
pytest -q
```

The test suite deliberately runs without Home Assistant installed. It covers the
REST client — that it serialises requests, retries once, tells a 404 apart from a
failure, and never trusts the reply of a queued write — the pure translations
between device state and Home Assistant, and the metadata that `hassfest` would
check for an integration living in Home Assistant core. Entity and config-flow
behaviour needs `pytest-homeassistant-custom-component` and the full harness;
that is a follow-up, and its absence is why nothing in `tests/` imports
`homeassistant`.

The dashboard card is built from `web/`, not from here, because it imports the
knob scale constants and the `@knobs` parser from `web/src/lib` — a copy of
those would go quietly wrong the next time a knob range is refactored:

```bash
cd web
npm run build:ha-card        # → custom_components/patternflow/www/
npm run check:ha-card        # fails if the committed bundle is stale
npm run check:ha-card-smoke  # the bundle loads, and still matches the sandbox
```

The bundle and `pattern-sandbox.html` are committed because Home Assistant is
handed a directory, not a build. CI rebuilds and compares, so a source change
without a rebuild fails rather than shipping a stale card.

`tests/fixtures/` holds recorded device responses. To refresh them against a real
panel:

```bash
curl -s http://patternflow.local/api/status  | python3 -m json.tool
curl -s http://patternflow.local/api/patterns | python3 -m json.tool
curl -s http://patternflow.local/api/mqtt     | python3 -m json.tool
```

## Licence

MIT, like the rest of the firmware and web code in this repository. See
[`LICENSE-MIT`](../../LICENSE-MIT).
