# Features, compositions and editions

**How Patternflow is put together, and how to build your own firmware on it.**

Read this before writing a feature or cutting a firmware. It is the reasoning;
the two references it points at are the mechanics.

---

## The three words

**A feature** is a directory in this repository implementing one capability
behind a fixed interface — the show player, MQTT, weather, OSC, browser audio,
the on-board microphone. It never edits a core file. It registers itself in one
list and the core dispatches to it through thirteen hooks.

**A composition** is a choice of which features compile into a build. It is two
files, and no code: one saying which features, one saying what the build calls
itself and any settings it needs different.

**An edition** is a composition somebody published — a firmware with a name, a
version of its own, and a card on
[patternflow.work/variants](https://patternflow.work/variants) that installs it
in one click.

The word "addon" is retired. It suggested something optional or third-party,
and none of these are: they are first-class capabilities that happen to live
behind an interface.

---

## Why editions exist

Not to save flash. That was measured and it is not the reason: dropping three
of five features leaves the ceiling on a loadable pattern **exactly where it
was**, on a board using 45 % of its partition. See
[RFC §2.13](rfc-core-and-variants.md#213-what-changed-and-why-step-5-is-withdrawn).

### The blast radius of a change

With one build carrying everything, every edit is potentially cross-cutting,
and the only proof otherwise is that somebody read it and thought so.

In a build that does not contain MQTT, a mistake in audio **cannot** have
broken MQTT. Not "was reviewed and probably didn't" — could not, because MQTT
was not there to break. That is a guarantee the compiler enforces rather than
one a reviewer keeps.

It matters more than it used to. Most edits now come from an agent rather than
from the person who wrote the file, and an agent does not remember yesterday.
A habit does not survive that. A compile error does.

### It is how the panel already works

The obvious objection is that a feature you have to install is a feature the
product does not really have.

**This project already answers that, with its best work.** Community patterns
are not in the firmware. A panel arrives with a loader and a catalogue; the
patterns arrive from the shelf, one click, over Wi-Fi. Nobody has ever
suggested that a pattern somebody installed is therefore not Patternflow — the
42-pattern library is the liveliest part of the project and not one byte of it
ships in the image.

An edition takes the same route through the same shelf, with the same click,
and your patterns, networks and settings all survive it. If installing demotes
MQTT, it demotes every pattern anyone has written. It demotes neither.

Choosing an edition is choosing what this panel is for right now — sound, or a
show, or a room full of sensors — and changing your mind costs one click.

---

## What never changes, whatever you build

These are the promises an edition inherits, and the ones that make switching
safe. Break any of them and the firmware is a fork rather than an edition.

| | |
|---|---|
| **The partition table** | Byte-identical in every release since v3.1.0. Two 3 MB app slots, 10 MB of FFat for patterns, NVS for settings. A firmware that moves `ffat` erases every pattern on the board. |
| **`/update`, in and out** | Every edition can be entered and left over Wi-Fi. Removing the way out delists it. |
| **The `.pfm` ABI** | Frozen. Fields are appended, never reordered or reinterpreted; old modules keep playing. |
| **The `.pfs` show format** | Frozen the same way, version byte and all. |
| **Shared NVS keys** | Wi-Fi credentials, brightness, selected pattern. Read and write the existing keys so nobody re-provisions after switching; never invent new keys inside a core namespace — yours go in your own. |
| **`/api/status` reports `variant` and `caps`** | So the site, the lab and any integration can ask what this build can do instead of assuming. |

The formats are the guarantee that actually matters to somebody performing: not
that the firmware never changes, but that **the files keep opening**. See
[RFC §2.14](rfc-core-and-variants.md#214-the-formats-are-frozen).

---

## Building a feature

Full reference, including all thirteen hooks and what proved each one:
[`firmware/patternflow/addons/README.md`](../firmware/patternflow/addons/README.md).

The shape, briefly. A feature is a directory with a descriptor:

```c
inline const PFAddon descriptor = {
    "weather",      // name
    "weather",      // cap — what /api/status advertises, and what the nav gates on
    setup,          // boot, before Wi-Fi
    onNetwork,      // Wi-Fi up: register HTTP routes here
    loop,           // every frame — MUST NOT block
    nullptr,        // observeFrame — the finished frame, for features that mirror
    fillInput,      // drive a lane before the pattern sees the frame
    /* ... */
};
```

Four rules that are not negotiable:

- **The loop hook must not block.** No `delay()`, no waiting on a socket. The
  panel is not being drawn while it runs.
- **Buffers of 1 KB or more go through `PFMem`** (PSRAM). Internal heap is the
  scarcest thing on the board and it is what caps how big a loadable pattern
  can be.
- **Never edit a core file.** Your entire diff is additions. That is what makes
  taking a core update a file copy rather than a merge, and it is the whole
  reason the seam exists.
- **Your settings live in your own NVS namespace.**

Servers and tasks of your own are fine — the browser-audio feature runs its own
websocket on port 81 — as long as the loop hook stays quick.

---

## Building an edition

Full reference: [`firmware/bundles/README.md`](../firmware/bundles/README.md).

Two files under `firmware/bundles/<name>/`:

```c
// addons_local.h — which features compile in, and in what order
#include "osc/addon_osc.h"
#include "audio/addon_audio.h"
#include "audio_in/addon_audio_in.h"
#define PF_ADDON_LIST            \
    &PFAddonOsc::descriptor,     \
    &PFAddonAudio::descriptor,   \
    &PFAddonAudioIn::descriptor
```

```c
// overrides.h — what it calls itself, and anything it needs set differently
#define PF_VARIANT          "audio"
#define PF_VARIANT_VERSION  "v0.2.0"   // yours, moves at your pace
#define PF_WIFI_TX_POWER    WIFI_POWER_17dBm
```

Then:

```bash
./firmware/bundles/build.sh audio            # build it
./firmware/bundles/build.sh audio flash pf.local   # and push it to a panel
```

`overrides.h` is included before any default in `config.h`, so it reaches every
`#ifndef`-guarded setting in the tree — panel clock, transmit power, brightness
cap, the lot. `addons_local.h` sits beside the core's own list, which steps
aside when it finds one. **Neither file is a core file, and the build script
puts both back the way it found them.**

Order in `PF_ADDON_LIST` is dispatch order, and it matters where features
compete: one that CLAIMS the pattern (a show) should come after ones that only
ASK (a remote picker), or the picker never gets a turn.

### Versions are yours

An edition's version is its own and moves at whatever pace suits it — 0.2, 0.3,
5.0. It is reported in `/api/status` as `variantVersion`, worn as a badge on
every console page, and shown on the shelf card. It has nothing to do with the
core version, which is reported separately.

The core version an edition was built against is worth stating in its release
notes, because that is what makes a build reproducible later.

---

## Getting an edition listed

The shelf has two tiers, and the difference is who to ask when it breaks, not
quality.

**Official** — built from this repository. A core change has to compile against
it before that change lands, so it cannot silently rot. Its image is served
from patternflow.work, which is also what makes one-click install possible: the
board cannot fetch over TLS, so the browser does the download, and that fetch
needs a CORS header only a host we control can send.

**Community** — your repository, your releases, your issues, your binary. A
fork, and that is fine. Anything hosted elsewhere is downloaded by hand and
dropped on `/update`.

To be listed, either way:

1. Keep the partition table. Never change it.
2. Keep `/update` working, in and out.
3. Report `variant` and its version in `/api/status`.
4. Keep the `.pfm` loader and ABI intact.
5. Share the core NVS keys; keep your own settings in your own namespace.
6. **Say plainly what it changes** — one honest paragraph. If it raises the
   transmit power or needs a part soldered on, that belongs on the card, not in
   a footnote.

An edition earns a place on the shelf by carrying something the default
cannot — a part that is not on the board yet, a setting that must not be
universal, a build somebody needs pinned so a show behaves the same at the next
gig. Rule 2 is the one that matters most: **a firmware you cannot leave is a
fork, not an edition.**

---

## Where the code lives

**Every feature is in this repository.** Nothing is moving out, and this is
settled — see [RFC §2.13](rfc-core-and-variants.md#213-what-changed-and-why-step-5-is-withdrawn).

The reason is not ceremony. In this tree, widening a hook breaks every feature
that used it *in the compiler, in the same commit* — which is exactly what
happened when `observeFrame` grew a parameter for OSC and MQTT failed to build
a second later. In somebody else's tree nothing happens, it rots quietly, and
the eventual reconvergence is worse than the merge that was being avoided.

A separate repository is where trees drift apart, not where they stop.

So: **the code is together, the builds are separate.** Those are different
questions and this project answers them differently. Somebody else's firmware
is still welcome — that is what the community tier is for — but the features
that make this Patternflow live here.

---

## Reading order

| you want to | read |
|---|---|
| write a feature | [`addons/README.md`](../firmware/patternflow/addons/README.md) — the hooks, in full |
| cut an edition | [`bundles/README.md`](../firmware/bundles/README.md) — the two files, in full |
| know why any of this | [RFC](rfc-core-and-variants.md) §2.13, §2.14, §2.15 |
| talk to a panel | [`rest-api.md`](rest-api.md) |
| write a pattern | [`firmware/README.md`](../firmware/README.md) |
