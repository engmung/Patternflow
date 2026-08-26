# addons/

Features that attach to the core without the core knowing they exist.

This directory is the answer to one question: *when the core updates, how
does somebody else's firmware take the update without pain?* Git merges are
only painful when both sides edit the same files — so the rule is that a
variant edits none.

> **A variant adds a directory here and one line to `addons.h`. That is its
> entire diff against the core.** `git merge upstream` then has nothing to
> conflict over.

See [`docs/rfc-core-and-variants.md`](../../../docs/rfc-core-and-variants.md)
for why, and the progress log beside it for where this stands.

---

## The three files

| file | what it is |
| --- | --- |
| `pf_addon.h` | The interface. What an addon may be asked, and what it is told. |
| `pf_addons.h` | The dispatcher. Walks the list and fans each moment out. |
| `addons.h` | **The list.** The one line a variant adds. |

An addon is a `PFAddon` — a name, a capability string, and a set of function
pointers. Every hook is optional: leave a field `nullptr` and that moment
passes the addon by.

## The hooks

Derived from what real features actually needed, not from imagination —
each row says which port proved it.

| hook | when | proven by |
| --- | --- | --- |
| `setup()` | boot, before Wi-Fi | show player, weather config, MQTT role |
| `onNetwork()` | Wi-Fi connected, and every reconnect — register HTTP routes here | `/show`, `/weather`, `/mqtt`, `/audio` |
| `loop(frame)` | every frame; **must not block** | show cue table, weather polling, MQTT client |
| `observeFrame(input, name)` | the *finished* input frame, for addons that mirror rather than produce | MQTT publishing knob values |
| `fillInput(input)` | before the pattern sees the frame — drive a lane from a reading | weather, audio bands, MQTT deltas |
| `onUserInput()` | a human turned a knob or pressed a button | night/wake scheduler |
| `claimsPattern()` | "I am driving the pattern" — remote pickers stand down | a running show |
| `takePattern(&idx)` | "switch to this pattern, please" — the sketch performs it | show cues, MQTT pattern topic |
| `onSleep(bool)` | the panel slept or woke | MQTT state publishing |
| `requestSleep(&bool)` | "sleep / wake the device, please" — again a request | MQTT sleep topic |
| `shortName` + `isRuntimeEnabled()` + `setRuntimeEnabled(bool)` | the device's own NETWORK screen lists and toggles this addon | audio |
| `appendStatus(String&)` | append `,"key":value` fields to `/api/status` | MQTT role/state |
| `drawOverlay(frame)` | after the pattern draws, before present | scheduler clock, weather clock |

`PFAddonFrame` carries what those hooks need so an addon never reaches into
the sketch's globals: `dt`, `patternName`, `running`, and `chromeVisible`
(the device's own UI is on screen — decorative overlays stay off).

**`takePattern` is a request, not an action.** Loading a module is the
sketch's job; an addon asks and the sketch performs.

## Writing one

```
addons/
  yourthing/
    addon_yourthing.h     ← the descriptor: which function answers which hook
    core_yourthing.h      ← your actual feature, unchanged
```

```c
inline const PFAddon descriptor = {
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
};
```

The order matters — these are positional. Copy the block from an existing
addon and fill in what you need; the compiler catches a slot in the wrong
place as a type error, which is how the ports found their own mistakes.

Then one line in `addons.h`, and nothing else in the tree changes.

### House rules

- **The loop hook must not block.** No `delay()`, no waiting on a socket.
  The panel is not being drawn while it runs.
- **Buffers of 1 KB or more go through `PFMem`** (PSRAM). Internal heap is
  the scarcest thing on the board and it is what caps how big a loadable
  pattern can be.
- **Own servers and tasks are fine** — the audio addon runs its own
  websocket port — as long as the loop hook itself stays quick.
- **Settings live in your own NVS namespace.** Read and write the core's
  existing keys (Wi-Fi, brightness, selected pattern) so users switch
  firmwares without re-provisioning, but never invent new keys inside a core
  namespace.

## What lives here so far

| addon | files | notes |
| --- | --- | --- |
| `show/` | player, HTTP page, night/wake schedule, library pull | The first port, deliberately the hardest. |
| `weather/` | readings, HTTP page, corner clock | Grew the interface: `fillInput`, `chromeVisible`. |
| `mqtt/` | client, all roles + FlowLocal, HTTP page | Grew it again: `observeFrame`, sleep in both directions, `appendStatus`. |
| `audio/` | FFT bands over a websocket, HTTP page | The one with a server of its own, and a row in the device's own menu. |

Emptying `addons.h` leaves the bare core: **1,090,569 B** flash against
1,405,809 with all four loaded, and the sketch is byte-identical either
way.

## What the ports taught

Recorded because it is the evidence behind the hook list, and because the
same shape keeps recurring.

**A second port is what tells you the interface was designed rather than
fitted to the first one.** The show player fit perfectly and looked like
proof. Weather then needed two hooks it had never asked for: `fillInput`,
and `chromeVisible` on the frame — which in the sketch had been four
separate globals an addon could not see and should not have to. MQTT
added four more, audio three. The list stopped growing at four ports,
which is the only reason to believe it is close to complete.

**Where the boundary actually is.** The RFC said the device's own UI was
out of scope for addons, and audio walked straight into it: a row on the
NETWORK screen and a knob that turns it off. The resolution was not to
give addons the menu, but to let the menu describe them — an addon says
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

**A feature's file set is not obvious from its name.** `core_library_http.h`
read as core until the compiler disagreed: it installs `.pfs` files from a
FlowLocal host, so it belongs with sequences.
