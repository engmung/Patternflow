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
| `setup()` | boot, before Wi-Fi | show player, weather config |
| `onNetwork()` | Wi-Fi connected, and every reconnect — register HTTP routes here | `/show`, `/weather` |
| `loop(frame)` | every frame; **must not block** | show cue table, weather polling |
| `fillInput(input)` | before the pattern sees the input frame — drive a knob lane from a reading | weather |
| `onUserInput()` | a human turned a knob or pressed a button | night/wake scheduler |
| `claimsPattern()` | "I am driving the pattern" — remote pickers stand down | a running show |
| `takePattern(&idx)` | "switch to this pattern, please" — the sketch performs it | show pattern cues |
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
    nullptr,       // fillInput
    nullptr,       // onUserInput
    nullptr,       // claimsPattern
    nullptr,       // takePattern
    drawOverlay,
};
```

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
| `show/` | player, HTTP page, night/wake schedule, library pull | The first port, deliberately the hardest — it touches every hook. |
| `weather/` | readings, HTTP page, corner clock | The second port, and the one that grew the interface. |

## What the ports taught

Recorded because it is the evidence behind the hook list, and because the
same shape keeps recurring.

**A second port is what tells you the interface was designed rather than
fitted to the first one.** The show player fit perfectly and looked like
proof. Weather then needed two hooks it had never asked for: `fillInput`,
and `chromeVisible` on the frame — which in the sketch had been four
separate globals an addon could not see and should not have to.

**Infrastructure hides inside whichever feature needed it first.** Three
times now, and always found the same way — by trying to remove something:

| what | was living in | moved to |
| --- | --- | --- |
| the console web server | `core_audio_ws.h` | `src/core_http.h` |
| the absolute parameter bus | `core_mqtt.h` | `src/core_bus.h` |
| local wall time (NTP, timezone) | `core_weather.h` | `src/core_clock.h` |

The clock is the clearest case: the night/wake scheduler was reaching into
weather to ask what time it was, so an addon depended on another addon and
removing weather would have broken sequences. "What time is it" is not a
weather question.

**A feature's file set is not obvious from its name.** `core_library_http.h`
read as core until the compiler disagreed: it installs `.pfs` files from a
FlowLocal host, so it belongs with sequences.
