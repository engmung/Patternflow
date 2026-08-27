# Patternflow HTTP API Specification

**Spec version: 1.0** · applies to firmware **≥ 3.5.1**.

One piece of bookkeeping, because it misleads at a glance: `CHANGELOG.md` still lists sleep mode and the absolute parameter bus under `[Unreleased]`, since those entries are held back to release together with the performance-director firmware. The *code* shipped — the `v3.5.1` tag contains all of it, and the firmware tree has not changed since. Everything documented here is in a released build.

Patternflow serves a plain HTTP server on port 80 over the local Wi-Fi network. It carries two different things: the **device console** — HTML pages a person opens in a browser — and a **JSON API** under `/api/`, which is the contract between the firmware and any host software that drives a device over the network. The Home Assistant integration in `integrations/homeassistant/` is built against this file. If you build another one, build it against this file, not against the firmware source.

`docs/osc-spec.md` is the sibling contract for OSC over UDP, aimed at DAWs and show software. The MQTT topic layout is documented in the header comment of `firmware/patternflow/addons/mqtt/core_mqtt.h`. The three are not interchangeable — see [Choosing a transport](#choosing-a-transport).

## Transport

| | |
|---|---|
| Base URL | `http://patternflow.local/` — mDNS, hostname from `PF_OTA_HOSTNAME`. The raw IP works too and is the fallback on clients with poor mDNS (Android). |
| Port | **80** for everything documented here. One server carries the console, the API, the audio-react UI and `/update`. The audio-react feature adds a WebSocket on **81** (`PF_AUDIO_WS_PORT`), which is not part of this contract. |
| Advertised over mDNS | `_http._tcp` on port 80 (`core_web_update.h`, whenever `PF_WEBUPDATE_ENABLED`) and `_arduino._tcp` (ArduinoOTA, whenever `PF_OTA_ENABLED`). The first carries no TXT records at all and the second only ArduinoOTA's own (board type, auth flags) — nothing Patternflow-specific either way. A discovering client must probe `GET /api/status` to confirm what it found. |
| Concurrency | **One connection.** See [Rules that will bite you](#rules-that-will-bite-you). |
| Authentication | **None.** No token, no password, no session. Anyone on the LAN can call anything here, including `POST /update`. This is a deliberate trust model, the same one ArduinoOTA's empty-password default has; `PF_WEBUPDATE_ALWAYS_ARMED 0` is the one lever that narrows it. |
| CORS | Only `/api/patterns/select` and `/api/display` send `Access-Control-Allow-Origin: *`. Everything else is same-origin only, so a browser page on another origin cannot read it. Server-side clients are unaffected. |
| Cache | Every JSON endpoint sends `Cache-Control: no-store`. |
| Encoding | Responses are `application/json`, hand-assembled in the firmware. Request parameters are **query-string or form-encoded, never a JSON body** — `POST /api/sleep?on=1` and a form body with `on=1` are the same call. |

## Rules that will bite you

Three properties of this server are not obvious from the endpoint list, and each one has already cost a feature.

**One connection at a time, and the render loop pays for it.** The vendored `WebServer` accepts a single client, and the panel is not being drawn while a response is being sent. A device-streamed frame preview (`GET /api/frame`, 24 KB per poll) was built, shipped and removed the same day: polling it while a pattern module was resident captured the render loop for seconds at a time and piled requests up until the device read as dead. `/remote` and `/api/knob` were removed alongside it as unused. **Issue requests strictly sequentially**, and treat a poll interval under a second as a bug rather than a feature. The lesson that came out of that day is written into the firmware as a design rule: a live pattern preview renders in the client from the pattern's own JS — *the device never streams pixels*.

**Opening an HTML console page no longer pauses the pattern** (since 3.6.3). It used to, and the old rule is worth knowing because the flag it left behind is still in the payload: on the core-3 builds a resident `.pfm` and a page render could not share the ~15 KB of post-services DRAM, so every console page evicted the module and held it out for 25 s of idle. The PlatformIO core-2 builds freed ~96 KB, and the page sender streams PROGMEM in small slices under a hard 5-second budget — so `GET /`, `/status`, `/patterns`, `/wifi`, `/mqtt`, `/show` and `/weather` all serve with the pattern running.

Two things stayed true. **Installing patterns still evicts the running module for the duration of the upload batch** — the panel shows PAUSED and restores itself — which is what `status.consolePaused` reports now; treat it as "an install is in progress", not "somebody looked at the console". And a page load still momentarily competes with the render loop on this one-connection server, so sending a person to `http://patternflow.local/` is fine and expected; **polling HTML pages remains a bug** — automated clients keep to `/api/*`.

**Some writes report the state before they take effect.** Stopping a DMA engine, reclocking the CPU, reading FATFS and running the ELF relocator are not things a handler does inside an open HTTP transaction — the firmware queues them and `loop()` performs them. `POST /api/sleep` and `GET /api/patterns/select` therefore return the *previous* state. Set your own state optimistically and let the next poll confirm it; do not parse the reply's state field as the new value.

## Device state

### `GET /api/status`

The numbers that explain a device when something is off. Requires `PF_STATUS_HTTP_ENABLED` (default on).

```json
{
  "version": "3.5.1", "uptime": 4213, "panel": "128x64",
  "wifi": true, "ssid": "studio", "ip": "192.168.1.42", "rssi": -54,
  "host": "patternflow",
  "heapInternal": 11052, "heapLargest": 8192, "heapPsram": 4194304,
  "fsMounted": true, "fsTotal": 6291456, "fsUsed": 204800,
  "patterns": 34, "presets": 1, "modules": 33,
  "active": "Wave Saw", "activeIsModule": true,
  "sleep": false,
  "knobs": [12, 0, -3, 40], "params": [500, 500, 750, 500],
  "paramActive": [false, false, true, false],
  "consolePaused": false,
  "frameUs": 16400, "presentUs": 3100, "loopCore": 1,
  "colorBits": 6, "refreshHz": 121,
  "loadError": "", "load": { "total": 0, "read": 0, "relocate": 0, "setup": 0 },
  "mqttRole": "off", "mqttState": "idle", "mqttConnected": false
}
```

| Field | Meaning |
|---|---|
| `version` | Firmware version string (`PF_IMPROV_FW_VERSION`). |
| `uptime` | Seconds since boot. |
| `panel` | Physical matrix, `"<w>x<h>"`. The closest thing to a model number. |
| `host` | mDNS hostname, i.e. `PF_OTA_HOSTNAME`. **Not unique** — every device ships as `"patternflow"`. See [Identifying a device](#identifying-a-device). |
| `heapInternal` | Free internal DRAM. The scarce one: HUB75's DMA buffers live there, and below roughly 10 KB the console starts answering with headers and no body while Wi-Fi and OSC carry on looking healthy. Worth watching. |
| `active` | **Display name** of the running pattern, or `"-"`. Not a slug and not an index. |
| `activeIsModule` | `true` for an uploaded `.pfm`, `false` for a preset compiled into `firmware.bin`. |
| `sleep` | Panel off / board idling. A sleeping device answers every other field here looking perfectly healthy. |
| `knobs` | The four encoders' absolute accumulated click counts — the same numbers the running pattern sees. Signed, unbounded, and meaningful only as a difference: there is no scale and no zero. |
| `params` | The absolute parameter bus, 0..1000 per lane. What `POST /api/params`, OSC and MQTT all write to. |
| `paramActive` | Per lane: is a remote writer currently holding it? Goes `false` a beat after somebody turns that encoder, because a hand in the room outranks the network. |
| `consolePaused` | A pattern-install batch is in progress and the module is evicted. Not an error. (Console pages stopped pausing the pattern in 3.6.3 — the name is older than that.) |
| `frameUs` / `presentUs` | Smoothed frame time and the part of it spent pushing pixels. `1e6 / frameUs` is the honest fps. |
| `colorBits` / `refreshHz` | What the HUB75 driver actually settled on — it trades colour depth against the requested refresh rate, so these are read back rather than configured. |
| `loadError` | Why the last module load failed, empty when it did not. Without it a refusal is invisible from the network. |
| `variant` | Which firmware this is: `"core"`, or a variant's own name. What the site's variant list matches, and what stops the update banner offering a core build on top of someone's chosen firmware. |
| `caps` | What this build can do, e.g. `["patterns","params","osc","sleep","shows","mqtt","audio","weather"]`. **Probe this rather than assuming a feature exists** — the core is shrinking and features are moving into variants (see [the RFC](rfc-core-and-variants.md)). `patterns` and `params` are always present. |
| `mqttRole` | `"off"`, `"publisher"` or `"subscriber"`. Decides whether the device obeys knob and pattern topics — see [Knobs](#knobs-and-parameters). |

### `POST /api/params`

Write the absolute parameter bus — the four channels a pattern reads as
set-points beside the physical encoders.

`p1`..`p4`, each `0..1000`, any subset; at least one required. A channel is
**held** once written and released the moment somebody turns that knob, so
an automated source can pin a look and hands always win it back. Patterns
see it only if they declare `ABSOLUTE_READY` and were built at module ABI 2.

    curl -X POST http://patternflow.local/api/params -d "p1=750&p3=250"
    → {"ok":true,"params":[750,500,250,500],"active":[true,false,true,false]}

**One shot per request, by contract.** This server takes a single connection
and pauses drawing while it answers, so a slider must debounce rather than
stream a value per pixel of travel.

This is the plain-HTTP door to a capability that used to require an MQTT
broker; it exists so that MQTT can live in a variant without taking remote
knob control out of the core with it.

### `POST /api/sleep`

Panel off, board idling, **still on the network**. Not `esp_deep_sleep`: that would take the draw to microamps and the radio with it, and then "lights out from the sofa" has no way back.

| Parameter | Values |
|---|---|
| `on` | `1` / `true` / `sleep` · `0` / `false` / `wake` · `toggle`. Default `1` when omitted. |

```json
{ "ok": true, "requested": true, "sleep": false }
```

`sleep` is the state **before** the transition — the request is only queued here. `400` with `{"ok":false,"error":"on must be 1, 0, or toggle"}` for anything else.

Any physical knob turn or button press wakes the device, as does an incoming firmware image. A knob message arriving over OSC or MQTT deliberately does **not**: a show still streaming knob values at a sleeping panel should not switch the lights back on.

### `GET /api/display`

Runtime display calibration, power telemetry, and a read-only mirror of `sleep`. Requires `PF_STATUS_HTTP_ENABLED && PF_DISPLAY_HTTP_ENABLED`. `GET` on purpose rather than `POST`: it is meant to be tunable from a browser address bar, and the local tuning page fires simple no-preflight requests at it. Sends CORS `*`.

Any subset of these may be set in the query string; the response always reports the full state afterwards.

| Parameter | Range | |
|---|---|---|
| `wb_r` `wb_g` `wb_b` | 0 – 1.5 | White balance per channel |
| `gamma_r` `gamma_g` `gamma_b` | 0.2 – 5 | Gamma per channel |
| `sat` | 0 – 4 | Saturation boost |
| `screen` | 0 – 3, or `-1` | Summons the calibration test card over the running pattern; `-1` dismisses it |
| `level` | 8 – 255 | Drive level of the WHITE test screen |
| `power_budget` | mA | Total power clamp budget |
| `power_limit` | `0` / `1` | Enable the clamp |

Read-only in the response: `brightness` (owned by the K1 long-press UI and NVS — there is **no** way to set it over HTTP), `calib`, `sleep`, `power_ma`, `power_demand`, `power_limiting`, `power_applied`.

Colour values are session-only; a reboot restores the `config.h` defaults. The point is the tuning loop — put a test card on the panel, drag sliders until it looks right, then copy the converged numbers into `config.h` as the new shipped defaults.

## Patterns

Requires `PF_PATTERNS_HTTP_ENABLED` (default on).

A device's pattern list has two halves. **Presets** are compiled into `firmware.bin`; only `Origin` ships as one now, as the failsafe that runs even when the filesystem will not mount. **Modules** are `.pfm` files on the FATFS partition, discovered at boot and appended after the preset — a ~6 KB upload instead of a 1 MB reflash. Presets are listed but never deletable.

### `GET /api/patterns`

```json
{
  "active": 3, "presets": 1, "mounted": true, "free": 6086656,
  "patterns": [
    { "index": 0, "name": "Origin", "module": null },
    { "index": 1, "name": "Wave Saw", "module": "wave_saw" }
  ],
  "pendingRev": 0, "pending": []
}
```

`active` is an index into `patterns`, or `-1` while nothing is loaded. `module` is the slug for an uploaded module and `null` for a preset. `pending` / `pendingRev` are the slugs a Performance Director has marked for ZIP export over MQTT — ignore them unless you are that tool.

**Indices are not stable.** Installing or deleting a single `.pfm` renumbers everything after it, which is why the firmware persists the running selection as a slug rather than an index. Re-read this endpoint after any upload or delete.

**Display names are not unique either.** Two modules may legitimately carry the same `name` in their sidecar. Address a pattern by `index` and disambiguate by `module` slug; `?name=` exists but stops at the first match.

### `GET /api/patterns/select`

| Parameter | |
|---|---|
| `index` | Registry index, 0 – `patterns-1` |
| `name` | Display name, exact match. Only if you have no index. |

```json
{ "ok": true, "index": 3, "name": "Firefly Hollow" }
```

Queued and applied in `loop()`, for the same reason as sleep: activating a module reads FATFS and runs the relocator. `404` for an out-of-range index or an unknown name. Sends CORS `*`.

An explicit pick here supersedes a pending console restore — without that, a pattern chosen over the network ran until the console went idle and then snapped back to whatever had been playing before.

### `GET /api/patterns/file`

| Parameter | |
|---|---|
| `slug` | Module slug. Sanitised the same way uploads are. |
| `ext` | `pfm` (default) or `json` |

`ext=json` returns the module's **sidecar** — the only place per-pattern metadata is exposed over HTTP:

```json
{
  "name": "Layer Stack", "namespace": "LabStack_Layer_Stack",
  "author": "unknown", "license": "CC-BY-SA-4.0",
  "abi": 2, "knobs": ["Waves", "Speed", "Sun", "Glitter"],
  "slug": "layer_stack", "absoluteReady": true,
  "panel_w": 128, "panel_h": 64, "module": "layer_stack.pfm",
  "size": 6144, "opt": "-Os"
}
```

`knobs` is the four knob labels in **logical** order (see [Knob ordering](#knob-ordering)). `absoluteReady` says whether the module was built against the absolute parameter helpers, which decides how it can be driven remotely. A missing sidecar or a missing key both mean "no".

Presets have no sidecar. Their knob labels and their `ABSOLUTE_READY` flag live in the C++ `PatternEntry` and are **not** readable over HTTP — a client should fall back to `K1`–`K4` and assume `absoluteReady: false`.

`404` if the file is not there, `409` if storage is not mounted. This is a file download (`Content-Disposition: attachment`), one file at a time — the server is single-connection.

### Installing and removing modules

| Route | |
|---|---|
| `POST /api/patterns` | Multipart upload of one `.pfm` / `.json`. Kept for `curl` and older pages. |
| `PUT /api/patterns` | **Preferred.** Raw body; filename in the `X-PF-Name` header. |
| `DELETE /api/patterns?slug=…` | Remove one module and its sidecar. |
| `POST /api/patterns/delete` | Body is one slug per line, or a single `*` for all. `{"ok":true,"removed":n,"missing":n}` |
| `POST /api/patterns/format` | Formats the FATFS volume. Destroys modules **and** `.pfv` clips. |

Raw `PUT` is what the device's own page uses: this `WebServer`'s multipart parser is the flakiest part of the stack, and a raw octet stream sidesteps all of its boundary handling.

Batching matters. A rescan-and-reload after every file is what made installing a pack of four fail on the fourth: a resident module owns 5–8 KB of internal DRAM, which is exactly what parsing an upload body needs. Mark every file but the last with `last=0` (form field) or `X-PF-Last: 0` (header) and the reload runs once per batch. Sending neither is treated as a batch of one.

A successful reply means the bytes arrived **and** the file re-read as structurally a module — a truncated upload is rejected here rather than revealing itself when somebody turns the knob to it.

```json
{ "ok": true, "slug": "firefly_hollow", "bytes": 6144, "patterns": 34 }
```

Uploading evicts the running module for the duration of the batch, so the panel shows a PAUSED screen and comes back afterwards. An abandoned batch restores itself after 5 s.

## Knobs and parameters

Both directions work over HTTP. This section used to say the opposite, and it was true until `POST /api/params` landed.

**Reading.** `GET /api/status` reports `knobs` (absolute accumulated clicks, the same numbers a pattern sees), `params` (the absolute bus, 0..1000) and `paramActive` (whether each lane is currently held by a remote writer rather than a hand). This is core and is always present.

`GET /api/mqtt` reports the same three fields and has since before `/api/status` did — but it lives in the MQTT addon, so a build without MQTT does not serve it. **Read knob state from `/api/status`**, not from `/api/mqtt`, unless you specifically want the broker fields alongside it.

**Writing.** `POST /api/params` sets any subset of the four lanes, 0..1000, and is core — see above. A hand on the encoder releases the lane it touches, so a remote value never fights a person. `/patternflow/knob/N/delta` over OSC (`docs/osc-spec.md`) and `<prefix>/knob/N` / `<prefix>/param/N` over MQTT do the same job for clients already speaking those.

`/api/knob` and `/remote` existed and were removed as unused alongside the `/api/frame` incident; do not look for them.

### `GET /api/mqtt`

```json
{
  "ok": true,
  "role": "subscriber", "channel": "broadcast", "state": "connected",
  "host": "192.168.1.10", "port": 1883, "user": "ha", "prefix": "patternflow",
  "pattern": "Wave Saw", "error": "", "mode": "normal",
  "connected": true, "configured": true, "hasPassword": true, "forcesSub": false,
  "knobs": [128, -4, 0, 96],
  "params": [500, 500, 500, 500],
  "paramActive": [true, false, false, false]
}
```

| Field | |
|---|---|
| `role` | `"off"` / `"publisher"` / `"subscriber"` — which topics the device obeys |
| `prefix` | Topic prefix. Read it here rather than asking the user twice. |
| `forcesSub` | The selected channel (1–4) pins the role to Subscriber |
| `knobs` | Absolute accumulated click counts, signed, unbounded. Live in every role. |
| `params` | Absolute parameter bus, 0–1000 per channel |
| `paramActive` | Whether that channel is currently *held* at its absolute value |

Also reported: `normalHost`, `normalPort`, `normalUser`, `normalPrefix`, `normalHasPassword` (the saved Normal-mode broker, kept while Director mode overlays it) and `directorHost`. Passwords are never returned — only whether one is set.

### Which topic to write

Decided per pattern by `absoluteReady` from the sidecar.

**`absoluteReady: true`** → publish `0`–`1000` to `<prefix>/param/<1..4>`. The pattern pins that parameter to a fraction of its declared range; the value is idempotent and survives a restart of whatever is driving it. Physical encoder motion releases the hold, so a hand on the device always wins. An empty payload releases it explicitly.

**`absoluteReady: false`** — every module built before the bus existed, and presets, which cannot be interrogated — → publish a new absolute click count to `<prefix>/knob/<1..4>`. The device diffs it against the last value it received and injects the difference as a detent delta. This is a **relative** control: the pattern integrates the delta through its own step size, so the value you send is not a value the parameter will arrive at.

`<prefix>/sleep` is the exception to everything above: it is obeyed in **either** role, because a panel that publishes its knobs is still a panel somebody wants to be able to switch off. `<prefix>/sleep/state` mirrors it on every change and once per connection.

Everything else — `knob`, `param`, `pattern` — is obeyed **only in Subscriber role**. A device set to Publisher will ignore knob writes silently. `POST /api/mqtt?role=subscriber` flips it, at the cost of the device no longer publishing its own knob turns; the two roles are exclusive.

### The channel decides whether your writes survive

The prefix **is** the channel: `patternflow` is Broadcast, `patternflow1`–`patternflow4` are channels 1–4, `patternflow5` is Live, anything else is Custom. Setting a prefix therefore selects a channel, which is not obvious from either end.

It matters because **channels 1–4 and Live also subscribe to a retained `<prefix>/snapshot`**, whose payload carries `param:[a,b,c,d]` — and the firmware applies those values straight onto the knobs, exactly as if they had arrived on `param/N`. A Publisher on the channel re-sends one every 8 seconds, and the retained copy is redelivered on every reconnect.

So on those five channels an external controller is not the only writer. Its value is overwritten a moment later by whatever the snapshot last said, the write having succeeded, MQTT being healthy, and nothing anywhere reporting an error. The symptom is a control that will not stay where it is put.

**Broadcast has no snapshot subscription.** For a single panel driven by one external controller — home automation, a script, a dashboard — Broadcast plus Subscriber is the combination that behaves. The show channels are for a Director driving several panels, which is a different job and the reason the snapshot bus exists at all.

`GET /api/mqtt` reports the channel as `broadcast`, `ch1`–`ch4`, `live`, `custom` or `off`, so a client can check this rather than guess.

### Knob ordering

Two orderings exist and they are not the same.

- **Physical**: K1–K4 left to right on the front panel. This is what an encoder turn produces and what a person means.
- **Logical**: the order patterns read parameters in (hue, speed, mode, freq/offset). `knobs[]` in a sidecar, the OSC and MQTT indices, and `InputFrame` are all logical.

The mapping lives in `web/src/lib/patternflowControls.ts` as `LOGICAL_KNOB_TO_WEB_KNOB = ['c1','c2','c4','c3']` — note that K3 and K4 swap. Convert once, at the boundary of your client, and say in a comment which side of it you are on.

Scale constants live in the same file and are the contract for anything converting between a parameter value and encoder detents: `ENCODER_CLICKS_PER_TURN = 24`, `TURNS_PER_FULL_RANGE = 2` — so 48 detents cross a parameter's entire declared range, whatever that range is.

## Wi-Fi

Requires `PF_WIFI_HTTP_ENABLED` (default on). Up to `PatternflowWifi::MAX_NETWORKS` are remembered and tried in order.

| Route | |
|---|---|
| `GET /api/wifi` | `{max, connected, current, ip, status, bootIdx, networks:[{ssid}]}` — SSIDs only, never passwords |
| `POST /api/wifi?ssid=…&pass=…` | Store a network. Add `connect=1` to switch immediately. |
| `DELETE /api/wifi?ssid=…` | Forget one. `404` if it was not saved. |
| `POST /api/wifi/boot` (`bootIdx=…`) | Which saved slot the next boot tries first. Stored in NVS, deliberately **not** applied live — the request rides the connection it would drop. |
| `POST /api/wifi/reboot` | Replies `{ok:true}` first, restarts 400 ms later. |

`POST` stores without switching by default: the usual reason to add a network here is to pre-register somewhere the device is *going*, and switching now would drop the connection serving the request and lose the reply. With `connect=1` the reply is sent first and the link torn down after.

Passwords travel in the clear over LAN HTTP and are never sent back. Same trust model as `/update` and `/patterns`.

## Shows (Sequences)

`.pfs` cue tables live on the pattern volume under `/shows` and play on a wall clock — cues fire by `millis()`, not by frame. Format: PFST v1 (whole-second cues) and v2 (deciseconds + eased cues); see `docs/pfst-v2-proposal.md`.

| Route | |
|---|---|
| `GET /show` | The Sequences console page. |
| `GET /api/shows` | Player status plus the catalog: `shows:[{slug,title,length,cues,loop}]`. |
| `GET /api/shows/status` | Status alone: `playing`, `paused`, `t` / `length` (seconds), `slug`, `title`, `missing[]`, playlist / variance / schedule state. |
| `PUT /api/shows` (raw body, `X-PF-Name: <name>.pfs`) | Install a table. The slug is derived from the name. |
| `DELETE /api/shows?slug=…` | Remove one; a playing show is stopped first. |
| `POST /api/shows/control` | `op=play&slug=…[&loop=1]` · `op=playlist&slugs=a,b[&loop=1]` · `op=pause` · `op=resume` · `op=stop` · `op=loop&loop=1` · `op=variance&en=…&cue=…&param=…` |
| `POST /api/shows/schedule` | Night/wake schedule — fields as on the page. |

**Pause banks the wall clock, resume re-bases it** — cues (and a v2 ease mid-ramp) continue exactly where they stopped, and the paused look stays on the panel. `missing[]` lists pattern names a show calls that are not on the device; those cues are skipped rather than failing the show. A show's opening cue may name a pattern — the device switches to it when playback starts, matching preset names and module filenames case-insensitively.

## Firmware update

Requires `PF_WEBUPDATE_ENABLED` (default on).

| Route | |
|---|---|
| `GET /update` | Drop-zone page |
| `POST /update` | Multipart firmware image, streamed into `Update.h` |
| `GET /update/status` | `{armed, busy, version, lastError, lastRejected, lastOk, received, expected, attempts}` |

`armed` is the gate. With `PF_WEBUPDATE_ALWAYS_ARMED 1` (the default) it is always true and anyone on the Wi-Fi can flash the device from a phone browser — the same exposure ArduinoOTA's no-password default already has, and the right call on a home or studio network. Set the flag to `0` for shared, office or exhibition Wi-Fi and uploads are refused unless the UPDATE screen is physically open on the device (hold K2 → NETWORK, turn K4).

An incoming image also wakes a sleeping device.

## Identifying a device

There is **no** MAC address, serial number or other hardware identifier on any endpoint. What exists:

- `status.host` — the mDNS hostname, which is `"patternflow"` on every device out of the box.
- `status.ip` — DHCP, so it moves.
- `status.panel` and `status.version` — a model and a firmware version, not an identity.

A client that has to key on something stable should use the hostname and require that a second device on the same network be given a different `PF_OTA_HOSTNAME` — which `net_config.h` already asks for, and which is also the only way `patternflow.local` resolves to the right board. Detect the collision (same hostname, different IP) and say so; do not quietly overwrite the first device.

## Choosing a transport

| | HTTP | OSC | MQTT |
|---|---|---|---|
| Read device state | **yes**, everything | announce burst + heartbeat | knob / pattern / sleep topics, in Publisher role |
| Read knob positions | **yes**, `/api/mqtt`, any role | on change | in Publisher role |
| Write knobs | **no** | **yes**, deltas | **yes**, Subscriber role only |
| Switch pattern | **yes** | yes | Subscriber role only |
| Sleep / wake | **yes** | no | **yes**, either role |
| Install / delete patterns | **yes** | no | no |
| Wi-Fi, firmware, calibration | **yes** | no | no |
| Latency | poll-bound, seconds | sub-frame | broker-bound |
| Needs infrastructure | nothing | nothing | a broker |

In short: HTTP is the management and state transport, OSC is the low-latency performance transport, MQTT is the one that reaches into home automation and mirrors one panel onto another. A home-automation client wants HTTP for everything except knob writes, and MQTT for those.

## Conventions for future additions

- JSON lives under `/api/`; anything else on this server is a page for a person.
- Parameters are query-string or form-encoded. There is no JSON request body anywhere, and adding one would need a body parser the firmware does not have.
- Errors are `{"ok":false,"error":"<lowercase sentence>"}` with a `4xx`/`5xx` status. Success bodies vary; the ones that report a mutation start with `"ok":true`.
- A handler must never touch FATFS, the ELF loader, the DMA engine or the CPU clock. Queue the work and let `loop()` do it; the reply then reports the pre-transition state, which callers already expect.
- New endpoints are gated by a `PF_*_ENABLED` flag and must leave the sketch compiling when set to `0`.
- Nothing here may stream per-frame pixel data. That has been tried.

## Version history

- **1.0** — first written contract for the HTTP API. Covers status, sleep, display calibration, patterns (list / select / sidecar / install / delete), the MQTT status and configuration endpoints, Wi-Fi, and firmware update; documents the single-connection rule, the console-pause rule, the queued-write rule, and the knob read/write asymmetry.
