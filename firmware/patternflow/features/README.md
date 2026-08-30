# features/

Features that attach to the core without the core knowing they exist.

> **New here? Read [`docs/EDITIONS.md`](../../../docs/EDITIONS.md) first.** It
> is the short version of what a feature is, what an edition is, and which
> promises every build has to keep. This file is the reference underneath it:
> the hooks, in full, and what proved each one.

This directory is the answer to one question: *when the core updates, how
does somebody else's firmware take the update without pain?* Git merges are
only painful when both sides edit the same files — so the rule is that a
variant edits none.

> **A variant adds directories here and two files of its own. It edits
> nothing.** `git merge upstream` has nothing to conflict over, ever.

An earlier version of this said "and one line to `features.h`" — which was
one line in a *core* file, so every variant conflicted on it at every core
update, forever, on the same line. One line is enough to make taking
updates a chore that eventually stops happening, and a firmware that stops
taking updates is the fork this directory exists to prevent.

| the firmware's own file | what it decides |
| --- | --- |
| `features_local.h` | which features this firmware has, in what order |
| `overrides.h` | any `#ifndef`-guarded setting: transmit power, panel clock, its own name and version |

Both are gitignored here, because they belong to a firmware rather than to
the core. The ones this repository publishes live in
[`firmware/bundles/`](../../bundles/README.md) — `build.sh audio` copies a
pair in, builds, and takes them away again.

Somebody building a firmware outside this tree writes the same two files.
That is the entire difference between a bundle and somebody else's firmware:
where the two files live, and therefore who to ask when it breaks.

See [`docs/rfc-core-and-variants.md`](../../../docs/rfc-core-and-variants.md)
for why any of this exists.

---

## The three files

| file | what it is |
| --- | --- |
| `pf_feature.h` | The interface. What a feature may be asked, and what it is told. |
| `pf_features.h` | The dispatcher. Walks the list and fans each moment out. |
| `features.h` | The default list, and the escape hatch. **The core owns it; no firmware edits it.** |
| `feature_presets.h` | Patterns contributed by features. Same arrangement: `#ifndef PF_FEATURE_PRESETS`, so a firmware can decline them. |

A variant's `features_local.h` defines `PF_FEATURE_LIST` and `features.h` steps
aside. It may add, drop and reorder; `PF_FEATURES_NONE` builds with none at
all:

```c
#include "audio_in/feature_audio_in.h"
#define PF_FEATURE_LIST            \\
    &PFFeatureOsc::descriptor,     \\
    &PFFeatureAudioIn::descriptor
```

`overrides.h` is included from `config.h` before any default applies, so
it reaches settings the feature list cannot:

```c
#define PF_VARIANT          "audio"
#define PF_VARIANT_VERSION  "v0.1.0"   // reported in /api/status, worn as
                                       // a badge in the console header
#define PF_WIFI_TX_POWER    WIFI_POWER_17dBm
#define PF_FEATURE_PRESETS                // no presets from features you lack
```

A feature is a `PFFeature` — a name, a capability string, and a set of function
pointers. Every hook is optional: leave a field `nullptr` and that moment
passes the feature by.

## The hooks

Derived from what real features actually needed, not from imagination —
each row says which port proved it.

| hook | when | proven by |
| --- | --- | --- |
| `setup()` | boot, before Wi-Fi | show player, weather config, MQTT role |
| `onNetwork()` | Wi-Fi connected, and every reconnect — register HTTP routes here | `/show`, `/weather`, `/mqtt`, `/audio` |
| `loop(frame)` | every frame; **must not block** | show cue table, weather polling, MQTT client |
| `observeFrame(input, frame)` | the *finished* input frame, for features that mirror rather than produce | MQTT publishing knob values; OSC reporting outward |
| `fillInput(input)` | before the pattern sees the frame — drive a lane from a reading | weather, audio bands, MQTT deltas |
| `onUserInput()` | a human turned a knob or pressed a button | night/wake scheduler |
| `claimsPattern()` | "I am driving the pattern" — remote pickers stand down | a running show |
| `takePattern(&idx)` | "switch to this pattern, please" — the sketch performs it | show cues, MQTT pattern topic |
| `onSleep(bool)` | the panel slept or woke | MQTT state publishing |
| `requestSleep(&bool)` | "sleep / wake the device, please" — again a request | MQTT sleep topic |
| `shortName` + `isRuntimeEnabled()` + `setRuntimeEnabled(bool)` | the device's own NETWORK screen lists and toggles this feature | audio |
| `navPath` + `navLabel` + `navDesc` | the console header links the page, and the home screen gives it a row with that one-line description — the core never learns the path | /show, /mqtt, /weather, /audio-in |
| `appendStatus(String&)` | append `,"key":value` fields to `/api/status` | MQTT role/state |
| `drawOverlay(frame)` | after the pattern draws, before present | scheduler clock, weather clock |

`PFFeatureFrame` carries what those hooks need so a feature never reaches into
the sketch's globals: `dt`, `patternName`, `running`, `chromeVisible` (the
device's own UI is on screen — decorative overlays stay off), plus
`patternIndex` and `appMode` for the one case that has to report raw
values outward on a published wire protocol.

**`takePattern` is a request, not an action.** Loading a module is the
sketch's job; a feature asks and the sketch performs.

It also reports *who* asked, and that changes what the sketch does
afterwards. A feature that **claims** the pattern owns the panel while it
runs — a show cycling cues — so its choices are transient and must not be
written to NVS every cue. One that only **asks** is relaying a person:
somebody picked a pattern from Ableton or a phone, and that should survive
a reboot exactly as turning the knob does. Only a person's choice is
remembered.

## Writing one

```
features/
  yourthing/
    feature_yourthing.h     ← the descriptor: which function answers which hook
    core_yourthing.h      ← your actual feature, unchanged
```

```c
inline const PFFeature descriptor = {
    "yourthing",   // name
    "yourthing",   // cap string reported in /api/status caps, or nullptr
    setup,         // or nullptr
    onNetwork,
    loop,
    nullptr,       // observeFrame
    nullptr,       // fillInput
    nullptr,       // onUserInput
    nullptr,       // claimsPattern
    nullptr,       // takePattern
    nullptr,       // onSleep
    nullptr,       // requestSleep
    nullptr,       // shortName - set it to appear in the device's NETWORK screen
    nullptr,       // isRuntimeEnabled
    nullptr,       // setRuntimeEnabled
    nullptr,       // appendStatus
    drawOverlay,
    "/yourthing",  // navPath - the console header link, or nullptr
    "Yourthing",   // navLabel
    "One line for the home screen's row.",   // navDesc
};
```

The order matters — these are positional. Copy the block from an existing
feature and fill in what you need; the compiler catches a slot in the wrong
place as a type error, which is how the ports found their own mistakes.

Then one line in `features.h`, and nothing else in the tree changes.

### House rules

- **The loop hook must not block.** No `delay()`, no waiting on a socket.
  The panel is not being drawn while it runs.
- **Buffers of 1 KB or more go through `PFMem`** (PSRAM). Internal heap is
  the scarcest thing on the board and it is what caps how big a loadable
  pattern can be.
- **Own servers and tasks are fine** — the audio feature runs its own
  websocket port — as long as the loop hook itself stays quick.
- **Settings live in your own NVS namespace.** Read and write the core's
  existing keys (Wi-Fi, brightness, selected pattern) so users switch
  firmwares without re-provisioning, but never invent new keys inside a core
  namespace.

## What lives here so far

| feature | files | notes |
| --- | --- | --- |
| `show/` | player, HTTP page, night/wake schedule, library pull | The first port, deliberately the hardest. |
| `weather/` | readings, HTTP page, corner clock | Grew the interface: `fillInput`, `chromeVisible`. |
| `mqtt/` | client, all roles + FlowLocal, HTTP page | Grew it again: `observeFrame`, sleep in both directions, `appendStatus`. |
| `audio/` | FFT bands over a websocket, HTTP page | The one with a server of its own, and a row in the device's own menu. |
| `osc/` | Max / TouchDesigner / Ableton, both directions | The fifth, and the first that did not fit — see below. |

`PF_FEATURES_NONE` leaves the bare core: **1,094,813 B** flash and 82,068 B of
static RAM, against 1,412,457 and 92,920 with all five loaded. The sketch is
byte-identical either way.

That gap buys the person holding the panel almost nothing, which is why
nothing was ever removed from the core. Flash sits at 45 % of the partition
even with all five loaded. The ceiling on a loadable `.pfm` — the largest
contiguous block — is 73,716 B with everything and **the same 73,716 B in the
`audio` bundle**, three features out. Only the bare `PF_FEATURES_NONE` build moves
it, to 92,148 B, and that is a compile flag rather than a firmware anybody
would ship. 18 KB more room, in a build with no shows, no MQTT, no weather, no
OSC and no sound, on top of a ceiling already two and a half times the
largest module anyone has built (29 KB; the 42-pattern community library tops
out at 17.5 KB). (All three read once, ~80 s after a reboot — `heapLargest`
decays under HTTP traffic, so repeated polling reports a lower number.) A named firmware exists to carry what the default cannot,
not to be smaller — see RFC §2.13 for the whole measurement.
See [`../../bundles/README.md`](../../bundles/README.md).

## What the ports taught

Recorded because it is the evidence behind the hook list, and because the
same shape keeps recurring.

**A second port is what tells you the interface was designed rather than
fitted to the first one.** The show player fit perfectly and looked like
proof. Weather then needed two hooks it had never asked for: `fillInput`,
and `chromeVisible` on the frame — which in the sketch had been four
separate globals a feature could not see and should not have to. MQTT
added four more, audio three. The list stopped growing at four ports,
which is the only reason to believe it is close to complete.

**Where the boundary actually is.** The RFC said the device's own UI was
out of scope for features, and audio walked straight into it: a row on the
NETWORK screen and a knob that turns it off. The resolution was not to
give features the menu, but to let the menu describe them — a feature says
its short name and whether it is on, and the core renders the row. The
core still owns its UI; it just no longer knows what audio is.

**Infrastructure hides inside whichever feature needed it first.** Four
times now, and always found the same way — by trying to remove something:

| what | was living in | moved to |
| --- | --- | --- |
| the console web server | `core_audio_ws.h` | `src/core_http.h` |
| the absolute parameter bus | `core_mqtt.h` | `src/core_bus.h` |
| local wall time (NTP, timezone) | `core_weather.h` | `src/core_clock.h` |
| the banner (text on the panel) | `core_mqtt.h` | `src/core_banner.h` |

The last two are the clearest. A show cue displayed its banner by calling
`PatternflowMqtt::applyHeldMessage()`, so putting text on the panel
required a broker client to exist; and the night/wake scheduler asked
weather what time it was, so sequences depended on weather for a clock.
Neither "show some text" nor "what time is it" is a feature question.

**The fifth port is what found the gap.** Four features ported cleanly and
that looked like proof; OSC did not, and that is the useful part. All four
earlier features spoke in names and booleans, so `observeFrame` handing over a
pattern *name* was enough. OSC publishes `/patternflow/pattern/index` and an
app-mode integer, both fixed in a released wire specification that hosts are
built against — the index cannot be quietly swapped for the name. So
`PFFeatureFrame` gained two fields and `observeFrame` takes the frame.

A hook list stops being a guess only when something nobody had in mind when
it was written is pushed through it.

**Moving a feature out is not finished when it compiles.** OSC leaving found
three places the interface had not been told: a preset hardcoded from another
feature's directory, a pattern counter that counted entries it would never stop
on, and a status row reporting a feature the build did not have. The
compiler helps with none of them. `caps` is the only mechanism that scales,
and anything hardcoded beside it will drift.

**A feature's file set is not obvious from its name.** `core_library_http.h`
read as core until the compiler disagreed: it installs `.pfs` files from a
FlowLocal host, so it belongs with sequences.
