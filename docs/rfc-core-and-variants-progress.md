# Core/variants split — progress

Running log of the restructuring proposed in
[rfc-core-and-variants.md](rfc-core-and-variants.md), against the six-step
migration order in §2.11. Updated as steps land.

**Where it stands: all four steps are done.** Step 4 shipped in 3.7.0 and
the editions in 3.8.0; the tree now has the `features/` + `bundles/` layout
that [`EDITIONS.md`](EDITIONS.md) describes, and that document — not this
log — is where the current vocabulary lives (this log says *addon* and
*variant* where the tree now says *feature* and *edition*). The entries below
are kept as they were written.

| step | what | state |
| --- | --- | --- |
| 1 | Move contract code out of leaving files | **done** |
| 2 | `POST /api/params`, `variant` + `caps` in status | **done** |
| 3 | Compile each leaving feature out, prove the seams | **done** |
| 4 | Cut the hooks + `addons/`; port the show player onto it | **done** — shipped in 3.7.0 |
| 5 | Delete the extracted features → core 4.0.0 | **cancelled** — see the end of this log |
| 6 | Variants fork | **cancelled** with step 5 |

---

## Step 1 — contract code moved out of leaving files

Two pieces of shared ground were living inside features that are supposed
to leave, so deleting either feature would have taken the core with it.

**The web server** (`df00e49`). One `WebServer` serves every console page,
and it lived in `core_audio_ws.h` because audio was the first feature to
need one. Every other page borrowed it behind an `#if PF_AUDIO_ENABLED`
fork with a fallback server of its own — five copies of the same
conditional. Ownership moved to a new `core_http.h`, and the home page
(never about audio) to `core_home_http.h`. Net −95/+30 lines in the files
that borrowed it.

**The absolute parameter bus** (`2185af6`). The four channels an
`ABSOLUTE_READY` pattern reads out of its `InputFrame` — module-ABI
ground — lived in `core_mqtt.h`, so the show player called
`PatternflowMqtt::applyRemoteParam()` to move a knob. Moved to
`core_bus.h`; MQTT keeps its references through using-declarations and
four forwarders, and now reads as one driver among several.

## Step 2 — the additive endpoints (`37d0bb9`)

Both ship *before* anything leaves, so the ecosystem can rely on them
first.

- **`POST /api/params`** — write the absolute bus over plain HTTP
  (`p1..p4`, `0..1000`, any subset, one shot per request). Until now the
  only door into the bus was MQTT, which made remote knob control require
  a broker. Home Assistant's knob write moves here, so **HA works against
  a bare core** and MQTT can leave without taking a capability with it.
- **`variant`** in `/api/status` — `"core"` by default, overridden by a
  variant from its own header (`PF_VARIANT`) so its diff against the core
  stays additions-only.
- **`caps`** in `/api/status` — what this build can do, e.g.
  `["patterns","params","osc","sleep","shows","mqtt","audio","weather"]`.
  Clients should probe this rather than assume a feature exists.
  `patterns` and `params` are always present.

Both documented in [rest-api.md](rest-api.md).

## Step 3 — the seams, tested (`2d96e7b`)

Compiling each leaving feature out is how you find out whether a seam is
real. Shows, weather and audio came out cleanly. **MQTT did not build at
all**: `core_library_http.h` and the sketch call `isFlowLocalMode()` and
`flowLocalHost()` unconditionally, and the disabled branch never defined
them. Stubs added.

Worth recording *why* nobody had hit this: `patternflow_secrets.h` sets
`PF_MQTT_ENABLED` with a bare `#define`, which by design overrides
anything passed with `-D`. On any tree with a secrets file the flag
silently does nothing, so that branch had never been compiled. It was
found by building a copy of the sketch with no secrets file — worth
remembering for any future compile-out check.

`PF_SHOW_HTTP_ENABLED` also moved to `net_config.h` alongside every other
feature flag: defined inside the feature it guarded, it was invisible to
the `caps` list.

### What the slim core measures

Built with shows, weather, audio, the library page and MQTT all out —
what core 4.0 is expected to be, without anything being deleted yet:

| | full build | slim core | change |
| --- | ---: | ---: | ---: |
| flash | 1,412,297 B | **1,097,269 B** | **−315 KB (−22%)** |
| static RAM | 92,896 B | **85,196 B** | −7.7 KB |
| free internal heap *(on hardware)* | 84,432 B | **96,460 B** | **+12 KB** |
| largest free block *(on hardware)* | 73,716 B | **86,004 B** | **+12.3 KB** |

*Re-measured 27 August 2026 under a controlled procedure — flash, reboot,
wait 80 s, take **one** reading — and the last row was low: the bare core
reads **92,148**, **+18.4 KB**. `heapLargest` decays 2,048 B at a time as the
device serves HTTP, so a number sampled repeatedly reads lower than one
sampled once, and nothing here recorded which was done. RFC §2.13 has the
three-build table.*

The last row is the interesting one: a loadable `.pfm` needs one
contiguous block of internal RAM, so that number *is* the ceiling on how
big a pattern can be. The slim core raises it by 12 KB.

**Frame time is unchanged** by any of this: 16.28 ms measured after,
against 16.29–16.38 ms before the refactoring started. Nothing here
touches the render loop.

## Verified on hardware

After each step, on an ESP32-S3 panel: all console pages and `/api/*`
routes answer, `/pf-console.js` serves, unknown paths 404 from the core's
handler, the audio websocket still completes its handshake on :81, and
the panel renders at its usual rate. The bus was checked with
[`docs/pfst-v2-vectors/a-ease-ramp.pfs`](pfst-v2-vectors/), whose expected
trajectory the spec prints — it climbed 26 → 46 → 71 → 92 → 118 → 155 →
182 through the eased segment and released every channel on stop.
`POST /api/params` was checked on a build with MQTT compiled out, which is
the case it exists for.

## Step 4 (in progress, branch `fw/addon-seam`)

Being built on a branch rather than guessed at, because a hook is a
contract the moment it is published — and the hook list in the RFC was
derived from what already-integrated features happened to need, which is
evidence about the past. Porting real features onto it turns the open
question into a measurement. **Nothing here is merged.**

The seam is three files (`addons/pf_addon.h`, `pf_addons.h`, `addons.h` —
since renamed `features/pf_feature.h`, `pf_features.h`, `features.h`)
documented in [`firmware/patternflow/features/README.md`](../firmware/patternflow/features/README.md).
The rule it enforces: a variant adds a directory and one line, so its whole
diff against the core is additions and `git merge upstream` cannot conflict.

### Ported so far

| addon | what moved | what it taught |
| --- | --- | --- |
| `show/` | player, `/show`, night/wake schedule, library pull | Needed `onUserInput`, `claimsPattern`, and `takePattern` as a *request* (loading a module is the sketch's job). Loop and overlay hooks need frame context or the addon reaches into sketch globals. |
| `weather/` | readings, `/weather`, corner clock | Needed **two hooks the first port never asked for**: `fillInput` (a reading drives the knob lanes) and `chromeVisible` on the frame (four sketch globals an addon could not see). |
| `mqtt/` | client, all roles + FlowLocal, `/mqtt` | Four more: `observeFrame` (the *finished* frame, mirrored outward — the opposite end from `fillInput`), `onSleep` / `requestSleep`, and `appendStatus`, because the core was reporting `mqttRole` in `/api/status` itself. |
| `audio/` | FFT bands over a websocket, `/audio` | Walked into the boundary the RFC drew around the device's own UI — it has a row on the NETWORK screen and a knob that toggles it. Resolved by letting the menu *describe* addons (`shortName`, `isRuntimeEnabled`, `setRuntimeEnabled`) rather than giving addons the menu. |

The sketch named show 13 times, weather 11, MQTT 23 and audio 9. **All
four are now zero** — it dispatches moments and knows no feature by name.
`drawClockOverlay()` and `drawMqttMessageOverlay()`, 60 lines of the core
knowing what a clock and a banner look like, left with their features.

### Infrastructure hiding inside features — four times now

Twice more during the ports. The night/wake scheduler was reaching into
weather to ask what time it was, and a show cue displayed its banner by
calling `PatternflowMqtt::applyHeldMessage()` — so sequences depended on
weather for a clock and on a broker client for the ability to show text.

All four were found the same way: by trying to remove something.

| what | was living in | moved to | found in |
| --- | --- | --- | --- |
| console web server | `core_audio_ws.h` | `src/core_http.h` | step 1 |
| absolute parameter bus | `core_mqtt.h` | `src/core_bus.h` | step 1 |
| local wall time | `core_weather.h` | `src/core_clock.h` | step 4 |
| the banner (text on the panel) | `core_mqtt.h` | `src/core_banner.h` | step 4 |

### Independence, measured

Every combination builds, and the sketch is identical in all of them:

| addons enabled | flash |
| --- | ---: |
| all four | 1,405,809 B |
| **none (the bare core)** | **1,090,569 B** |
| show + weather | 1,404,629 B |
| weather only | 1,348,137 B |
| show only | 1,220,533 B |
| none | 1,348,241 B *(measured before weather moved)* |

Verified on hardware after each port: `/show` and `/weather` answer, a show
plays through the addon path, the scheduler still reads the clock
(`timeSynced` true), frame time 16.3–16.4 ms — unchanged throughout.

### Where it ended up

All four features ported. The bare core is **-308 KB of flash and -10 KB
of static RAM** below the full build, and every feature is a directory
plus one line in `addons.h`.

The hook list settled at 12 (plus three fields for the device-menu row).
It grew with the second and third ports and stopped with the fourth,
which is the only real evidence that it is close to complete — and the
question still worth putting to the people who would build on it.

### Reviewed, twice

Four green builds are not a review. Going back over it from angles the
compiler cannot check turned up five things, none of which failed loudly:

| what | why it mattered |
| --- | --- |
| the core was `#include`-ing addons | `core_status_http.h` pulled in the dispatcher to call `appendStatus`, so a core-only build would have needed addon headers to exist. The core now declares an extension point and the sketch — the one file allowed to know both — wires it. |
| **an NVS namespace typo** | the setup hooks opened `"pf"`; everything else uses `"patternflow"`. Reads returned defaults, writes went where nobody looks, and the audio switch and MQTT role would have quietly stopped surviving reboots. |
| the NETWORK screen had no row cap | rows start at y=22 on an 11 px pitch and the Wi-Fi line is fixed at y=50, so a third toggleable addon would have drawn over it |
| four documents named moved files | the PFST spec, `rest-api.md`, the vendored PubSubClient note, the site's encoder comment |
| a weather asset sat in the core | `weather_icons_32.h`, referenced by nothing |

The namespace typo is the one worth remembering: it is exactly the kind of
bug this whole restructuring can introduce — an addon owns its own settings
now, so it has to be handed the right drawer to put them in.

Checked and found clean: no public function was lost in any port (the
inline surface of all four features diffed before and after — only
weather's `ensureLocalTime`, which was internal and became `core_clock`'s
`ensure()`); the module build toolchain shares only
`core_color/math/noise`, all still in `src/`, and building a `.pfm` still
works; the PlatformIO source filter needed no change; the web smokes pass.

Hardware, after the fixes: nine console pages, a show playing and driving
the bus, pause/stop, the clock synced through `core_clock`, the audio
websocket handshaking on :81, `POST /api/params`, MQTT config restored
from NVS across a flash. Frame time 16.46 ms.

## What was deliberately not done yet

*As of the step-4 branch. Steps 5 and 6 were cancelled outright a week
later — the end of this log says why.*

Steps 5 and 6 — deleting the extracted features and cutting core 4.0.0,
then the variants forking — waited on agreement, and the branch above is
what makes that agreement concrete: the hook list is no longer a proposal,
it is a thing two real features are already standing on.

`dev` and `main` are untouched by step 4. The core there is still the full
firmware, so waiting costs nothing.

---

## Step 4½ — the console became editable, and §2.7 got built

Two things that were not on the numbered list but blocked work on it.

### The console pages are HTML files now

Nine console pages lived inside `R"HTML(...)HTML"` literals. That is the
right way to ship them onto a device with no filesystem and the wrong way
to work on them: no browser, no refresh, no devtools, and nothing you can
hand to somebody who designs in HTML but does not build firmware.

They now live in `firmware/patternflow/console/*.html`, with
`firmware/toolchain/console_pages.py` splicing them back into the headers
and `console_serve.py` serving every page against a fake device on
`localhost:8322`. CI checks the two stay in sync, because the one way this
arrangement fails silently is somebody editing a `.h` and having the next
`build` overwrite it.

The generator replaces **only** the bytes between the delimiters. A
whole-file generator was written first and thrown away: it deleted the doc
comment above each literal, which on `home_index.h` is the design intent
and on `patterns_index.h` is Simone's attribution for the browser-side
unzip. Worth remembering as a general shape — a generator that owns a whole
file owns everything a human wrote in it.

Within a minute of the pages being real files, two things surfaced that
PROGMEM had hidden:

| what | why it mattered |
| --- | --- |
| **the home page ignored `caps`** | the nav learned about capabilities in step 4; the page body never did. A bare core's console still advertised Sequences, MQTT, Audio and Weather — four dead links and a meaningless status row — which is exactly the failure the `caps` work existed to prevent, surviving in the one place nobody looked. |
| eight pages carried orphaned CSS | the body of the old `.pfnav` rule, left when its selector was deleted. A parse error and 492 dead bytes on every page. |

Rows now carry `data-cap`; `gate()` removes what is absent, drops any group
left empty, and renumbers the rest. To pay for it without a second request,
the shared chrome dispatches `pf-status` with the status it already fetches.

### §2.7 exists

`/variants` — the shelf, hand-curated, no listing process, nothing
mirrored. Performance Director, IoT and Radio, the last two with owners
still to confirm.

The device now participates: its console footer says whether it is running
core or a named variant and links to that entry, and **the update banner no
longer arms on a variant**. That last one is the substantive part. The
manifest at patternflow.work describes core releases; offering one to a
panel running somebody else's firmware would talk a person into flashing
away the thing they chose, on a version comparison that means nothing
across two release lines.

This is the first piece of the RFC that ships something a *user* touches
rather than something a maintainer does, and it is deliberately the piece
that makes leaving safe. The shelf is only worth having if the way back is
real.

### Steps 5 and 6 are withdrawn

*Updated 27 August 2026.*

They were waiting on agreement. The agreement went the other way, and the
measurement went with it — including the part of it recorded above.

The `audio` bundle, three addons out, leaves the ceiling on a loadable
pattern **exactly where it was**: 73,716 bytes either way, confirmed on
hardware, on a board using 45 % of its flash. The slim-core table further up
this log shows the other half honestly: strip *all five* addons and the
ceiling does rise, to 92,148 B — **+18.4 KB**, more than that table's
original figure. Both are true, and the difference is what
each one is. The bundle is a firmware somebody would ship; `PF_ADDONS_NONE`
is a compile flag with no shows, no MQTT, no weather, no OSC and no sound.
The prize for shipping it is 18.4 KB on a ceiling already two and a half
times the largest module anyone has built.

That is the whole of what a slim core was for, and it is not enough.

Steps 1–4 stand and shipped in 3.7.0. What replaces 5 and 6 is in RFC
§2.13: everything stays in this tree, and `firmware/bundles/` names
firmwares built from it — two files each, no fork, no vendored copies.

The part of this log that still reads true is the shape it kept finding:
**a feature is never as separable as it looks.** Four pieces of
infrastructure were hiding inside features, three interfaces reported a
feature that had left the build, and the hook set turned out to be one
field short — every one of them found by trying to move something, and
none by reading the code.
