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
is editable the same way.

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
  are features; a build may have none of them. Ask `/api/status` — its `caps`
  array lists what is actually loaded — and hide what is not there. The nav
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
