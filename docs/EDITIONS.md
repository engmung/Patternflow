# Features, compositions and editions

**How Patternflow is put together, and how to build your own firmware on it.**

Read this before writing a feature or cutting a firmware. It is the reasoning;
the two references it points at are the mechanics.

---

## Where the line is

**Patternflow is a device that loads interactive patterns and runs them under
four knobs.** That sentence decides everything below it, and it is the only
test worth applying.

What that sentence names is not a feature and never composes out: the pattern
loader, the four encoders, the panel driver, Wi-Fi, `/update`, sleep, the
console. Those are the device. **The default build carries no features at
all**, and a panel running it does the whole of what Patternflow is for.

Everything else — sequences, MQTT, OSC, weather, audio — is a way of driving
that device from somewhere else. Real, wanted, first-class, and not the thing
itself. Each belongs to an edition somebody chooses.

The line is easy to draw somewhere flattering instead. An earlier version of
this document used a different test — *does this need infrastructure outside
the room* — which is a fine question about what is **separable** and a bad one
about what is **core**: it kept OSC and the show player in a build called
standard for no better reason than that they need nothing running to work.
Cheap is not the same as central.

The measurement agrees with the definition, which is the part worth trusting.
On hardware, the largest contiguous block a loadable `.pfm` can claim:

| build | largest free block |
|---|---|
| **default — patterns and knobs** | **92,148** |
| performance — sequences, MQTT, weather | 77,812 |
| audio — OSC, browser audio, microphone | 69,620 |

The build that matches "this device runs patterns" is also the build that
gives patterns the most room to be.

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
in one click. Three exist:

| | carries | whose |
|---|---|---|
| **Patternflow** | nothing — the device itself | the product |
| **Audio** | OSC, MIDI, browser audio, the on-board microphone, Bluetooth Wi-Fi setup | SeungHun Lee |
| **Performance** | sequences, MQTT, FlowLocal, the Director, weather | Simone Majocchi |

The word "feature" is retired. It suggested something optional or third-party,
and none of these are: they are first-class capabilities that happen to live
behind an interface.

---

## Why editions exist

### It is not a hierarchy

Start here, because the structure is easy to misread and the misreading is
costly.

This says nothing about which features matter, who is important, or whose work
is central. There is no tier of features, no promotion, no demotion. MQTT is
not less than patterns because it can be composed out; the show player is not
less than OSC because a build might not carry it. **Every feature sits in the
same tree, under the same interface, with the same standing.** A composition is
a build-time choice, not a verdict.

The shelf does have tiers — official and community — and even that is not about
standing. It answers one question: *who do you ask when it breaks?* A firmware
built here gets compiled against every core change before that change lands. A
firmware built elsewhere is its author's to keep working. Different maintenance
obligations, not different worth.

Nothing here decides who owns anything. It decides what is in the room when you
compile.

### It is entirely about how the work gets done

The reason is development ergonomics, and specifically the shape development
has now.

Most edits to this firmware are made by an agent. Not "assisted by" — made by.
It reads what it is shown, changes what it was asked to change, and does not
remember what it learned yesterday. That is a fine way to work and it is how
this project moves as fast as it does, but it changes which safeguards are
worth anything.

Consider the two ways to keep an audio change from breaking MQTT:

| | |
|---|---|
| **"Be careful not to touch MQTT."** | An instruction. Depends on the reader having read the MQTT code, held it in mind, and noticed the interaction. Costs nothing to say and guarantees nothing. Degrades with every file added to the tree, and does not survive a fresh context at all. |
| **MQTT is not in this build.** | A fact. The compiler enforces it. It does not degrade, it does not depend on anyone's attention, and it is exactly as true on the hundredth edit as the first. |

The second is worth having and the first is not, and the gap between them grows
every time the codebase grows or the person changes.

Working on audio means building the audio edition: OSC, browser audio, the
on-board microphone. MQTT, the show player and weather are not compiled, so
nothing done to audio can reach them. The change under review is smaller, the
thing to hold in mind is smaller, and the guarantee is mechanical instead of
attentional.

### What this does and does not buy — honestly

**It is not mainly about memory**, and the numbers are more interesting than
either slogan. Dropping *some* features moves nothing: the audio edition sheds
278 KB of flash and lands on the same 73,716-byte ceiling the full build had.
Dropping *all* of them does move it, to 92,148 — but that is the default doing
the one job the device exists for, not a saving anyone engineered. Nobody
should sell composition as a memory trick. See
[RFC §2.13](rfc-core-and-variants.md#213-what-changed-and-why-step-5-is-withdrawn)
for the controlled measurement and the procedure it needs.

**It does not protect the core.** A change to `patternflow.ino`, the ABI, or
the bus reaches every edition, and composing features out does nothing about
it. The worst bug this project has shipped was exactly that shape — one missing
line in the sketch froze the show player, MQTT, weather and the audio websocket
at once, in every build. Editions would not have caught it. Nothing about this
structure makes core changes cheap, and they should still be made carefully and
measured on hardware.

**What it buys is the ordinary case**: work inside one feature, which is most
work. There, the blast radius stops at the build's edge, and it stops for a
reason a machine can check.

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

## What is promised, and to whom

"If the core keeps improving, will the things built against it keep
working?" - the right worry, so here is the contract, strongest first.
Everything below has an enforcer; a promise kept by memory is the kind that
was broken three times before the boundary checker existed.

**1. The module ABI (`firmware/patternflow/abi/`) - binary, strongest.**
Consumed by installed `.pfm` files that never recompile. Frozen field
layout, append-only growth, an explicit version handshake
(`PF_ABI_VERSION` 1 is frozen; modules stamp `PF_ABI_MODULE_VERSION`; the
loader accepts the range), and since 2026-08-30 a CI lock: `abi.sums` pins
every header's hash and `check_abi_freeze.py` fails any drift that was not
deliberately re-pinned in the same commit.

**2. The hook interface (`features/pf_feature.h`) - compile-time.** For
feature code that recompiles against a checkout, in-tree or out. Widening
is tail-append only (the rule and its reason are written on the struct);
the compiler surfaces every break at build, and `build.sh all` makes sure
"builds" means all three compositions. The two composition filenames and
their macros are the out-of-tree seam - renamed spellings are shimmed, and
shims get deleted only after their consumers migrate.

**3. The wire ([`rest-api.md`](rest-api.md), [`osc-spec.md`](osc-spec.md),
[`audio-ws-spec.md`](audio-ws-spec.md)) - runtime.** Integrations build
against the spec files, not the firmware source. Growth is additive; each
spec carries its own compatibility rule (probe `caps` before assuming an
endpoint; unknown WebSocket prefixes are ignored; new OSC addresses do not
move old ones) and its own version history.

**Explicitly not promised: everything else.** Core file layout, namespaces,
internal helpers, what a screen draws, which serial lines print - all of it
may change without notice, and the `addons/` -> `features/` rename is the
standing example: forty files moved, and nothing that speaks any of the
three contracts above noticed. That is the shape of the deal - the inside
stays free precisely because the edges are locked.

## Building a feature

Full reference, including all thirteen hooks and what proved each one:
[`firmware/patternflow/features/README.md`](../firmware/patternflow/features/README.md).

The shape, briefly. A feature is a directory with a descriptor:

```c
inline const PFFeature descriptor = {
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
// features_local.h — which features compile in, and in what order
#include "osc/feature_osc.h"
#include "audio/feature_audio.h"
#include "audio_in/feature_audio_in.h"
#define PF_FEATURE_LIST            \
    &PFFeatureOsc::descriptor,     \
    &PFFeatureAudio::descriptor,   \
    &PFFeatureAudioIn::descriptor
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
./firmware/bundles/build.sh all              # every composition, proven
```

`all` builds default, audio and performance, then scans each binary for one
marker string per feature — a literal that lives only in that feature's
sources. An edition must contain its own features' markers and none of the
others'. That is the composition checked in the shipped bytes: `features.h`
catches a misspelled macro, this catches the right macro building the wrong
thing. Run it before pushing anything that touches the core; it is the rule
"a core change is tested against every composition" as one command.

The boundary itself is mechanical too: `firmware/toolchain/check_boundaries.py`
(run in CI on every firmware change) fails the build if a core file references
a feature namespace, includes from the feature tree, or branches on a
feature's flags. The rule lived in comments first and was violated three times
before it grew teeth; on its first run the checker found a fourth, so the
lesson is written down here: **a rule an agent must remember is a rule that
will drift — put it where the build fails.**

`overrides.h` is included before any default in `config.h`, so it reaches every
`#ifndef`-guarded setting in the tree — panel clock, transmit power, brightness
cap, the lot. `features_local.h` sits beside the core's own list, which steps
aside when it finds one. **Neither file is a core file, and the build script
puts both back the way it found them.**

Order in `PF_FEATURE_LIST` is dispatch order, and it matters where features
compete: one that CLAIMS the pattern (a show) should come after ones that only
ASK (a remote picker), or the picker never gets a turn.

Two traps worth knowing before you cut one, both found by cutting these:

- **Libraries are named, not discovered.** PlatformIO's dependency finder
  scans includes and cannot evaluate the `__has_include` your composition
  arrives through, so a feature's library disappears the moment that feature
  leaves the default build. Anything a feature needs belongs in `lib_deps`.
  WebSockets went that way when audio left; HTTPClient followed when weather
  did.
- **`PF_FEATURE_PRESETS` cuts both ways.** Defining it as nothing is how a build
  *without* the show player keeps the scheduler's hidden `Black` pattern out
  of the carousel. In a build *with* the show player it deletes a pattern the
  scheduler calls by name, and the build fails on `'Black' has not been
  declared`. Copying another edition's `overrides.h` is how you get there.

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

## The rename (2026-08-30)

The directory was `firmware/patternflow/addons/` and the vocabulary was
"addon" until this document settled on "feature"; the tree now matches the
words. For a composition maintained OUT of this tree — two files copied over
a checkout — the old spellings still build: `addons_local.h` is accepted
beside `features_local.h`, `PF_ADDON_LIST` / `PF_ADDONS_NONE` map to the new
macros, the old `addon_<name>.h` descriptor headers exist as stubs, and
`PFAddonOsc`-style namespaces are aliases. The shims are marked in the tree
and get deleted once every out-of-tree bundle has migrated — copy the two
files into `features/` (the directory is the one thing a shim cannot rename)
and swap the prefixes at your leisure.

One migration is real rather than spelling: a composition that carries the
show player must now declare its night-face preset itself —

```c
#define PF_FEATURE_PRESET_INCLUDE "show/preset_black.h"
#define PF_FEATURE_PRESETS PATTERN_ENTRY_HIDDEN(Black),
```

— because the bare core no longer ships another feature's pattern by default.
Without those two lines the build stops at `'Black' has not been declared`,
which is the compiler saying the same thing this paragraph does.

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
| write a feature | [`features/README.md`](../firmware/patternflow/features/README.md) — the hooks, in full |
| cut an edition | [`bundles/README.md`](../firmware/bundles/README.md) — the two files, in full |
| know why any of this | [RFC](rfc-core-and-variants.md) §2.13, §2.14, §2.15 |
| talk to a panel | [`rest-api.md`](rest-api.md) |
| write a pattern | [`firmware/README.md`](../firmware/README.md) |
