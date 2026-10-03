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
set what `/api/status` says; `/mock?audio=…` sets what the panel hears
(below); `--chrome404` runs every page on its fallback. The script's
docstring has the rest.

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
row there when you add a page. A file here whose name starts with an
underscore is a source, not a page. `audio-in.html` is the one page you do
not edit: it is assembled from other files (below).

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

## The page that is assembled: `/audio-in`

`audio-in.html` is generated. Edit what it is made from, and
`console_pages.py build` assembles it before it bakes the headers (the step
is `firmware/toolchain/build_audio_in_page.py`; its docstring has the detail).
`console_serve.py` does not read the generated file: it assembles the page
from these sources on every request, with the same code, so here too it is
save and refresh. A source the build would refuse shows as the build's own
message instead of a page.

| source | what it is |
| ------ | ---------- |
| `tools/patternflow-audio-extension/editor.html`, `editor.css`, `editor.js` | the mapping editor, shared with the browser extension: one copy, so the two cannot drift |
| `_audio_in_bar.html` | the device bar: what only the panel has (microphone, input gain, reset) |
| `_audio_in.css` | the panel's styles, applied after the editor's |
| `_audio_in_adapter.js` | `window.PFAdapter`, the editor's one way out, spoken over `/api/audio-in` |

Comment those files as much as they need. Whole-line comments, indentation
and blank lines are dropped as the page is assembled, which is a quarter of
its weight on the wire. Nothing parses the JavaScript to do it, so the build
refuses the few things that would make it unsafe and names the line; the one
you might meet is a template literal that runs across lines. Line numbers in
the browser's console are the generated page's.

It is the heaviest page in the console, so its size is pinned: `BUDGET` in
`build_audio_in_page.py`, in bytes of the stamped page gzipped as the panel
sends it. `console_pages.py build` prints how much is spare. CI fails when the
page is over it, and when `audio-in.html` is not what its sources assemble to
(`build_audio_in_page.py --check`; `console_pages.py check` says so too).

The page is an editor, so on the mock it has a panel that behaves. Its
endpoints (`/api/audio-in`, `/api/audio-in/reset`, `/api/audio`) are the one
part of `console_serve.py` that is a port of the firmware's handlers and not
a fixture: a request changes only the fields it carries, the two pairs settle
as they do on a panel, a curve table that is not 33 numbers is ignored with
`{"ok":true}`, a POST without the form `Content-Type` has no arguments at
all, and replies have the handler's field order and decimals. The sound is
made up; what is done with it is not. What the panel hears is a state you
pick, and each address lands on `/audio-in`:

| `/mock?audio=` | the panel |
| -------------- | --------- |
| `music` | microphone on, a room with music in it (the default) |
| `silence` | on, a quiet room: every gate shut, every knob at rest |
| `off` | switched off after music: the poll's numbers are the last window's, not zeros |
| `fresh` | nobody has configured it: off, nothing heard, the factory mapping |
| `nomic` | on, nothing on the data pin: `source` is `pdm (no mic - data pin idle)` |
| `stalled` | on, the microphone stopped answering: `synth (mic stalled)`, and the numbers are the test tones |
| `phone` | off, the phone app posting monitor frames: `phone`, `ext:true`, its own units |
| `ext` | off, the browser extension connected: `audioClients` is 1 |
| `noread` | the configuration read gets no reply; the poll and every POST still answer |

The switches on the page work from any of them. A build can also have the
microphone without the browser path: `/mock?caps=patterns,params,sleep,audio-in`,
where `/api/audio` is a 404. When a handler in `features/audio_in/` or
`features/audio/` changes, the port in `console_serve.py` changes with it.

## The look

The console is light unless someone picks dark. The choice is the toggle in
the header, kept in `localStorage` as `pf-theme`, and the chrome sets
`data-theme` on `<html>` before the first paint. Every core page opens its
`<style>` with the same base block (the `Console base` comment): the tokens,
light in `:root` and dark under `html[data-theme=dark]`, then the parts every
page shares: `.btn` (`.pri`, `.dan`, `.sm`), `.chip`, `.notice`, `.list`,
the fields and the footer. Copy it rather than restyle it, and leave out the
rules for parts a page never uses. Identical text costs almost nothing
gzipped, and a page that is a little different is how the console stopped
looking like one thing before.

The chrome injects the same light palette for every token name a page might
use, which is what turns the feature pages light without editing them. If
you change a light token value, change it in the chrome (the `html:root[data-theme=light]`
rule in `theme_index.h`) and in every core page's `:root` together, or the
chrome's copy wins. The accent is the LED orange, and only for what is live:
the current tab, the playing pattern, the panel's on state. Labels are
sentence case in the sans; mono is for numbers, addresses, versions and
file names.

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

The one exception is `/audio-in`'s endpoints, which are ported from the
firmware (above). Even there the microphone is invented: what a real one
does in a real room is still only on a panel.
