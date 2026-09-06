# Feature Guide — making the firmware do a new thing

Patternflow's firmware is built so that **you can add your own feature without
touching a single existing file** — and so that an AI coding agent can do the
work for you, safely.

This page has two halves. The first half is for you. The second half is for
the agent.

---

## Why it's built this way

Every open firmware eventually meets the same death: someone forks it to add
their thing, their fork edits a few core files, and from then on every
upstream update is a merge conflict. The chore gets skipped once, then
always, and a year later the fork is a stranded island running year-old code.

Patternflow's answer is a hard line:

- The **core** is the device itself — panel, four knobs, pattern loader,
  Wi-Fi, console. It never names a feature.
- A **feature** (OSC, audio, MQTT, the show player…) attaches through a small
  hook interface. The core doesn't know it exists.
- An **edition** is a named firmware built from the core plus a chosen set of
  features — described by **two files**, neither of which is a core file.

So your firmware adds its own directory and its own two files, and edits
nothing. Taking a core update becomes `git checkout <newer tag>` — nothing to
merge, ever. That promise is enforced by CI, not by good intentions: a
checker fails the build if any core file so much as names a feature.

The full reasoning lives in [`docs/EDITIONS.md`](docs/EDITIONS.md). It's a
good read if you want to know where the line between "device" and "feature"
sits, and why the default build ships with no features at all.

## How to actually do it

You don't need to learn the codebase. **Point an AI coding agent (Claude
Code, Cursor, Copilot…) at this file** — say something like:

> Read FEATURE_GUIDE.md in this repo and build me a feature that does X.

The second half of this document tells the agent everything it needs: the
rules, the file map, the checkers that must pass, and what done looks like.
The architecture was shaped precisely so this works — the boundary an agent
must not cross is checked by scripts, not by hoping it read carefully.

**The process:**

1. **Start in your own repository — always.** Fork this repo (or vendor it)
   and build your feature there. Don't open with a PR against this repo;
   features need room to be wrong for a while, and out-of-tree is where the
   architecture wants them anyway.
2. **Build it, run it on your panel, live with it a bit.**
3. **Share it.** Open an issue here (or post in the Discord) with a link to
   your repo — working or half-working, both welcome. I'll link it from the
   project so others can find and flash it.
4. **If it's something the main firmware should carry**, we integrate it here
   together. Most features are happiest staying yours — that's the design,
   not a rejection.

The test a feature has to pass to move in-tree is one sentence, and it's the
same sentence the whole architecture hangs on: *Patternflow is a device that
loads interactive patterns and runs them under four knobs* — a feature is a
way of driving that device from somewhere else, and it must cost a build
that doesn't include it exactly nothing.

---

## For the AI agent

You were pointed here to build a Patternflow firmware feature. Read this
section fully before writing code.

### Read first, in this order

1. [`docs/EDITIONS.md`](docs/EDITIONS.md) — what a feature/edition is and the
   promises every build keeps.
2. [`firmware/patternflow/features/README.md`](firmware/patternflow/features/README.md)
   — the hook interface in full, and what proved each hook.
3. [`firmware/bundles/README.md`](firmware/bundles/README.md) — the two files
   that compose an edition.

### The rules

- **Never edit a core file.** Core = `firmware/patternflow/patternflow.ino`
  and `firmware/patternflow/src/`. If your feature seems to need a core
  change, the answer is a hook (or the feature is trying to be the device).
  The test: *would your edit still be correct on a build without your
  feature?* If it would do nothing or be wrong, it belongs in your feature.
- **A feature is a directory** under `firmware/patternflow/features/<name>/`
  with `feature_<name>.h` (its descriptor and hook wiring) and whatever
  `core_<name>*.h` internals it needs. Follow the shape of an existing one:
  [`osc/`](firmware/patternflow/features/osc/) is the smallest,
  [`audio_in/`](firmware/patternflow/features/audio_in/) the fullest.
- **A firmware is two files** (see
  [`bundles/audio/`](firmware/bundles/audio/) for a complete example):
  `features_local.h` — includes + `PF_FEATURE_LIST` naming the descriptors in
  dispatch order — and `overrides.h` — any `#ifndef`-guarded setting, each
  with its reason, including `PF_VARIANT` / `PF_VARIANT_VERSION` (the name
  and version the panel reports; `shelf.sh` refuses an image whose version
  string doesn't match).
- **Your HTTP handlers run on the network core, not the frame's.** Since
  3.9.1 the console's server is serviced by a task on Core 0 while `loop()`
  renders on Core 1. A handler that reads a word of state, or writes a value
  the next frame picks up, needs nothing. One that touches what the frame is
  using right now — starts or stops something your `loop` hook is ticking,
  reconnects a client it polls, frees a buffer it reads — wraps that part in
  `PFLoopSync::run([&] { ... })` (`src/core_loop_sync.h`): the body runs on
  the loop task at the frame boundary and the handler waits for it.
  [`show/`](firmware/patternflow/features/show/), `mqtt/` and `weather/`
  show the shape.

### The seam, file by file

| file | role |
| --- | --- |
| `features/pf_feature.h` | The `PFFeature` descriptor struct — the entire interface between core and features. |
| `features/pf_features.h` | The dispatcher: walks `PF_FEATURE_LIST`, null-check per feature per hook. |
| `features/features.h` | Core-owned composition point; includes `features_local.h` if present, steps aside if not. |
| `features/feature_presets.h` | Patterns contributed *by* features (rarely needed). |
| `features/<name>/<name>_index.h` | A feature's console page — generated from `console/<name>.html` by `firmware/toolchain/console_pages.py build`, which also lays the gzip twin (`<NAME>_GZ`, the bytes the device actually sends) under the literal. Edit the HTML, never the header. |

Existing features to learn from: `osc` (UDP in/out), `audio` (WebSocket
server, [`docs/audio-ws-spec.md`](docs/audio-ws-spec.md)), `audio_in` (device
task + HTTP API + console page + NVS persistence), `midi` (a transport-agnostic
mapping with the network transport beside it, [`docs/midi-spec.md`](docs/midi-spec.md)),
`ble` (a radio that starts itself only when needed and hands its memory back;
in no edition yet),
`mqtt`, `show`, `weather`, and `clock` — settings in NVS, a page with a live
preview, and the first user of `composeFrame` (drawing into the frame with
alpha, before the blit) — the one to read first.

### What done looks like

All of these, locally, before calling it finished:

```
python firmware/toolchain/check_boundaries.py    # core names no feature
python firmware/toolchain/check_abi_freeze.py    # public headers unchanged (abi/abi.sums)
python firmware/toolchain/check_sources.py
python firmware/toolchain/console_pages.py check # if you added a console page
./firmware/bundles/build.sh all                  # every edition compiles + marker scan
```

Compiling is not testing — most historical regressions were invisible on the
build in front of whoever caused them, which is why `build.sh all` exists.
CI runs the same set ([`firmware-checks.yml`](.github/workflows/firmware-checks.yml),
[`console-sync.yml`](.github/workflows/console-sync.yml)).

If the user asks for a PR against this repository: it should touch only
`features/<theirs>/` plus a bundle, pass everything above, and follow
[`CONTRIBUTING.md`](CONTRIBUTING.md) (inbound = outbound licensing, commit
style). Otherwise keep everything in the user's own repository — that is the
preferred home for a new feature.
