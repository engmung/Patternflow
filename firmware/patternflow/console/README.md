# The device console

These are the pages the panel serves over your LAN. They are ordinary HTML
files — open one in a browser, edit it, refresh.

You do not need the firmware, a device, or a toolchain to work on them.

```bash
python firmware/toolchain/console_serve.py
```

`http://localhost:8322` — every page, with a fake device behind it answering
all the same `/api/*` calls with data captured off a real panel. Save a file,
hit refresh. Devtools work, which they never did before.

Pages go out exactly as the panel sends them: stamped (below), with the
same ETags, 304s, redirects and cache headers. The mock's `build` changes
whenever you save a page, so a tab left open reloads itself onto your edit
the way a real one does after a firmware update. To see the console the way
a phone on the panel's hotspot does, `--slow` (gzip, 0.4 s round trips,
5 KB/s, one request at a time); `/mock?hotspot=1` and `/mock?busy=update`
set what `/api/status` says; `--chrome404` runs every page on its fallback.
The script's docstring has the rest.

When you are done:

```bash
python firmware/toolchain/console_pages.py build
```

That splices the HTML back into the `*_index.h` headers the firmware compiles.
CI checks the two stay in sync.

## What goes where

| page             | URL         | served by                                | HTML lands in                          |
| ---------------- | ----------- | ---------------------------------------- | -------------------------------------- |
| `home.html`      | `/`         | `src/core_home_http.h`                   | `src/home_index.h`                     |
| `patterns.html`  | `/patterns` | `src/core_patterns_http.h`               | `src/patterns_index.h`                 |
| `status.html`    | `/status`   | `src/core_status_http.h`                 | `src/status_index.h`                   |
| `wifi.html`      | `/wifi`     | `src/core_wifi_http.h`                   | `src/wifi_index.h`                     |
| `knobs.html`     | `/knobs`    | `src/core_knobs_http.h`                  | `src/knobs_index.h`                    |
| `update.html`    | `/update`   | `src/core_web_update.h`                  | `src/web_update_index.h`               |
| `show.html`      | `/show`     | `features/show/core_show_http.h`         | `features/show/show_index.h`           |
| `weather.html`   | `/weather`  | `features/weather/core_weather_http.h`   | `features/weather/weather_index.h`     |
| `mqtt.html`      | `/mqtt`     | `features/mqtt/core_mqtt_http.h`         | `features/mqtt/mqtt_index.h`           |
| `audio-in.html`  | `/audio-in` | `features/audio_in/core_audio_in_http.h` | `features/audio_in/audio_in_index.h`   |
| `midi.html`      | `/midi`     | `features/midi/core_midi_http.h`         | `features/midi/midi_index.h`           |
| `clock.html`     | `/clock`    | `features/clock/core_clock_http.h`       | `features/clock/clock_index.h`         |

The list `console_pages.py` splices is `PAGES` at the top of that script — add a
row there when you add a page. `audio-in.html` is itself generated, from the
browser extension's mapping editor, by `firmware/toolchain/build_audio_in_page.py`;
edit the extension, run that, then `console_pages.py build`. CI runs
`build_audio_in_page.py --check`, so a page that was not rebaked after an
editor change fails there rather than shipping stale.

Pages under `src/` belong to the core and may not name a feature — not in a
nav row, not in a sentence (see `docs/EDITIONS.md`). Pages under `features/`
belong to their feature.

The shared header band, nav and light/dark toggle are not in these files.
They live in `src/theme_index.h`, served at `/pf-console.js`, and every page
loads it with one `<script src>` in `<head>`. Change the chrome once, every
page follows. `console_serve.py` serves it live from that header too, so it
is editable the same way. The chrome draws itself inside a shadow root
(`<pf-chrome>`): a page's CSS cannot reach it and its CSS cannot reach the
page, so do not style or query its insides. What a page may use is
`window.PF`, below.

## Writing a page: `window.PF`

The panel's web server answers one connection at a time, and on its own
hotspot every request costs a phone waking from power save. A page that
polls on its own timer competes with every other page, with the chrome, and
with itself, and on a slow link that is what makes the console feel dead.
So the chrome owns the device's time, and a page asks it:

| call | what it is for |
| ---- | -------------- |
| `PF.status(cb)` | `/api/status`. `cb(status)` on every fresh copy (at once if one is known). The chrome fetches it once, after the page's own first requests — never fetch it yourself. Also sets `window.pfStatus` and fires the `pf-status` event, for older code. |
| `PF.watchStatus(ms)` | keep status fresh every `ms`; one shared poller at the smallest interval anyone asked for. |
| `PF.poll(src, ms, cb, opts)` | anything the page refreshes. `src` is a URL (GET, JSON) or a function returning a Promise; `cb(data, null)` or `cb(null, err)`. Returns `{stop(), now(), set(ms)}`. Runs are chained, never overlap, back off when the link is slow or the panel busy, pause while the tab is hidden and stop when you navigate away. `opts.first === false` skips the immediate first run. |
| `PF.get(url, opts)` | a page's first data and its actions: a Promise of JSON (`opts.text` for text), with a timeout. Not queued behind the pollers. |
| `PF.hold(promise, opts)` | wrap anything long (an upload, a flash). While it runs this tab's pollers wait, and other console tabs poll no faster than every 5 s and skip prefetch (10 min at most). `PF.get` is not held. `opts.guard` asks before the user leaves. Returns the promise. |
| `PF.busy(button, promise)` | disables the button until the promise settles. Returns the promise. |
| `PF.say(text, kind, slot)` | a result: `kind` is `'ok'`, `'err'` or `'info'`. With `slot` (an element) the text goes there and `'ok'` clears itself; without, it is a toast. |
| `PF.waitForDevice(opts)` | after a reboot or a Wi-Fi switch: resolves with status once the panel answers again (with `opts.build`, once it answers with a different build); rejects after `opts.timeout` (90 s). |
| `PF.state` | `connecting`, `live`, `offline` or `restarting`; the `pf-state` event fires on change, and `<html>` carries `pf-connecting` / `pf-offline` / `pf-restarting` for your CSS. |
| `PF.dirty` | set it `true` while a form holds unsaved edits (see versions, below). |
| `PF.v`, `PF.inflight()` | the build this page was loaded as; how many of the page's own requests are in flight. |

The rules that follow from it:

- **Never `setInterval` (or a `setTimeout` loop) for a device request.** Use
  `PF.poll`. The only timers a page should own are for its own animation.
- **Never fetch `/api/status`.** `PF.status(cb)`; `PF.watchStatus(ms)` if
  the page shows something that changes.
- **Plain `fetch` still works** — the chrome wraps it so same-origin reads
  are cancelled when you navigate away — but `PF.get` adds the timeout and
  tells the connection chip what happened.
- **Links** to other console pages can stay plain (`href="/patterns"`). The
  nav's own links carry the build (below) and cost nothing once cached; a
  plain one costs one round trip for a 304.

## Versions, caching and the stamp

Every firmware image has a `build`, eight hex digits in `/api/status`.
Page URLs carry it — the nav links to `/patterns?v=<build>` — and the panel
serves a page whose `v` names the running build as immutable: the browser
keeps it and never asks again until the firmware changes. A `v` naming any
other build is redirected to the current one; a bare URL (typed, a bookmark,
a `?src=` handoff) is revalidated with an ETag and answered with a 304 when
nothing changed. None of this applies under a Host that could be someone
else's site — on the hotspot every name resolves to the panel, so only an
address, a bare name or a `.local` name gets anything cacheable.

So a page can only change with the firmware, and a tab left open across an
update is out of date. The chrome notices on the next status: it reloads
the page onto the new build by itself if nobody has touched it yet, and
otherwise offers "Console updated — tap to reload". That is what `PF.dirty`
is for: a page with unsaved edits is never reloaded out from under them.

The chrome itself is keyed by its own CRC. You write

```html
<script src="/pf-console.js"></script>
```

exactly once, in `<head>`, and `console_pages.py build` stamps it in the
header as

```html
<script src="/pf-console.js?h=<crc32 of the chrome>"></script><script>…fallback…</script>
```

`extract` strips it back, so the HTML never carries a stamp — never write one
by hand. Because every page carries the chrome's CRC, **an edit to
`src/theme_index.h` or `_pf_fallback.js` makes every page header stale**:
run `build`, and CI's `check` names each page `(stale chrome stamp)` until
you do. A page without exactly one bare tag fails `build`.

The inline script after it is `_pf_fallback.js`: when `/pf-console.js` did
not load (a dropped connection on a bad link), it defines a minimal
`window.PF` — the same calls, without the queue, toasts, connection state or
nav — so the page still works instead of throwing on its first `PF.` call.
Its `poll` keeps the same promises (chained, never overlapping, `now()` a
no-op while a run is in flight or after `stop()`). It rides in every page,
about 600 bytes gzipped each, so it stays one line of ES5 and gains nothing
a page can do without; `check_sources.py` syntax-checks it and the chrome. See it in action with
`console_serve.py --chrome404`.

## Rules the device imposes

The panel is an ESP32 with no internet connection, serving these out of
flash. That constrains what a page may do:

- **No build step, no framework, no bundler.** Plain HTML, plain CSS, plain
  ES5-flavoured JS. What is in the file is what runs.
- **No external assets** other than the Google Fonts links already present,
  which degrade to system fonts when the LAN has no internet — as it often
  does not. Everything else must be inline or served by the device.
- **Size is flash.** These strings live in the firmware image. A page that
  doubles in size takes that space from patterns.
- **Nothing may assume a feature exists.** Sequences, MQTT, Weather and Audio
  are features; a build may have none of them. Ask `PF.status(cb)` — the
  status's `caps` array lists what is actually loaded — and hide what is not
  there. The nav
  does this for you. If your page has its own links or rows, mark them
  `data-cap="shows"` and see `gate()` in `home.html`.

  In `console_serve.py`: `/mock?caps=bare` and `/mock?caps=full` switch
  between a stripped core and everything, so you can look at both.

## What the mock does not do

It answers the same URLs with the same JSON shapes. That is all it promises.

Anything that lives in C++ — whether an upload actually parses, what the
panel does when a show plays, whether a Wi-Fi switch really reconnects — is
not modelled. A page that works against the mock still has to be tried on a
real device before you believe it.
