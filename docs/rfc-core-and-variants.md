# RFC: the core, and the firmwares built from it

*Restructuring the firmware. Written 2026-08-26.*

> **Status, 28 August 2026.** The seam shipped in 3.7.0: every feature is a
> module in this tree, a named firmware is two files, and nothing edits a core
> file to exist. **The code is not splitting up** — §2.13 has the measurement
> and the argument. **What each published build carries is open** — §2.15 has
> why. Part 2 below describes the tree; the history is in
> [the progress log](rfc-core-and-variants-progress.md) and in git.

This document is two things on purpose. **Part 1 is the maintainer, in
his own words** — the decision and why. **Part 2 is the specification** —
precise and mechanical, written so a contributor (or an AI agent handed
this file) can implement against it without asking what was meant.

---

# Part 1 — Why

> Written 26 August 2026, before any of it was built, and left as written.
> The one thing in it that did not survive contact is the ask that everyone
> keep their firmware in their own repository — see §2.13. The rest still
> stands, and it is why any of the work happened.

I'm thinking of tearing down the whole structure of the firmware. There
have been moments like this before, but back then the refactoring was for
me. This time it's a refactoring for me *and* for other people — for you.
Let me give some background, to explain why.

Recently, and I'm grateful for it, a few of you (three) built or modified
the features you needed and wanted, proposed them, and upgraded
Patternflow together with me. I genuinely wanted and welcomed that, and
they were all good features, so I did my best to integrate them. But at
the same time I was carrying a lot: an anxiety about the firmware's
overall performance ceiling, and a sense that in order to keep control of
it I had to understand all of it. Straining to integrate the features
people proposed, I stopped actually enjoying this, and it started to feel
like I was struggling to keep up. I think Simone sensed exactly that,
which is why he suggested this shape to me first.

He was right. And I think this is the direction that fits. At the center
of Patternflow there would be something like a core template — the thing
that any Patternflow can be built from — plus a well-kept guide to the
community's many Patternflows; and each individual Patternflow gets made
and shared by whoever makes it. How best to guide people to them is still
an unknown: a document in the repo that points the way, or wiring it into
the web console itself so switching and discovery are easy there, or
something else. I intend to design it to be as accessible as I can.

So what I want to say is: it will be a bit of a nuisance, but each of you
will need to keep your own firmware version as its own repo. Please know
that's the direction, and prepare for it. I can't build a completely new
structure in a few days, but by next week — **September 3rd** — I'm going
to rework the main firmware this way. After that I'll likely tidy the
repo up bit by bit too. So, bendobos, I'd love it if your IoT integration
were managed as its own repo.

I really hope you'll understand. If I keep going the way I have been, and
three or more feature proposals arrive at once, I don't think I'll hold
up. I feel I need to get this structure in place now, before the influx
comes. And — thank you for the features you built, and Simone, thank you
for the idea and the suggestion!

*What I wrote ends here. Below is a draft Claude put together. Have a
look if it's useful. If you have other ideas, or anything you'd like to
see included as the new structure is designed, please say so freely —
I'll probably start this work over the weekend.*

---

# Part 2 — The specification

*Normative. Written to be implemented from directly — by a contributor or
an AI agent — without further interpretation. Where Part 1 says why, this
part says exactly what. It is a draft in the sense that the open
questions (§2.12) are genuinely open; the rest is the intended shape.*

## 2.1 The principle that draws the line

> **The core guarantees a *capability* by its most self-contained means.
> Protocol adapters to outside infrastructure are variants.**

Applied: "control this device on the LAN" is a capability, and plain HTTP
covers it — pattern select, sleep, and (new, §2.2) a parameter write.
MQTT re-exposes those same capabilities *through a broker*: that is an
adapter, and needing a broker is the "outside infrastructure" test. OSC
passes the same test from the other side — direct UDP, no infrastructure,
and live control is what the instrument is for — which is why OSC is core
and MQTT is not, without either being a special case.

Two clauses complete the principle: anything **safety- or
recovery-adjacent** is core and unconditional (power clamp, sleep,
`/update`); anything that exists to be **disagreed about** — schedulers,
bridges, radio trade-offs — is where a named build gets to differ.

**What this principle decides, now that nothing leaves.** It is not a rule
about which repository code lives in — all of it lives here. It is the rule
for what a firmware may *turn off* and still be Patternflow. Adapters and
disagreeable things may be dropped by a build; the contract in §2.2 may
not.

## 2.2 The core contract

The core is defined by what it **guarantees**, not by what it includes:

| guarantee | why it is the contract |
| --- | --- |
| **Partition layout + `/update`** | The escape hatch. Any variant can be entered and left over Wi-Fi. Changing partitions strands users — the one hard MUST NOT. |
| **`.pfm` module ABI + loader** (`abi/pf_abi.h`, `pf_params.h`, the FFat volume) | Patterns are the shared economy. Every variant plays the same community modules or the split fractures the interesting part of the project. |
| **Absolute parameter bus** (`InputFrame.paramAbsolute*`) | Part of the module ABI, not a feature: `ABSOLUTE_READY` patterns read it. Players/bridges that *drive* it are variant territory; the bus itself is ground. |
| **Panel driver, canvas, encoders, power clamp** | The hardware floor. The clamp ships enabled on funded units; a variant may re-tune it for its audience (the radio variant's whole point) but the core default stays conservative. |
| **Wi-Fi + provisioning** (Improv serial, `/wifi`, multi-network + boot slot) | A device you cannot reach is a brick with LEDs. |
| **OSC** | Live control floor; no infrastructure needed. |
| **Sleep** | Small, safety-adjacent (power/heat); the console needs it. |
| **Minimal HTTP surface**: `/`, `/patterns`, `/status`, `/wifi`, `/update` + their `/api/*` | What the site, docs and the HA integration's read path assume exists everywhere. |
| **`POST /api/params`** *(new)* | The capability MQTT was the only carrier of: write the four absolute channels over plain HTTP, one shot per request, same release-on-touch semantics as the bus. It was added so MQTT *could* leave without any capability leaving with it. MQTT is staying (§2.13) and this earned its place anyway: HA's knob write moved to it, and it is the one way to drive the bus that needs no broker and no UDP. (The old `/api/knob` was removed as *unused*, not unsafe; the rule against polling this one-connection server stands.) |
| **`/api/status` reports `variant` + `caps`** *(new)* | `variant`: one human-readable string (`"core"`, or whatever a variant calls itself). `caps`: machine-probed feature list (`["shows","mqtt"]`) for the site/lab. Also how the update banner knows not to offer a core bin on top of a variant. |

This table is the whole of "maintaining the frame". It is small, changes
slowly, and none of it is where creative disagreements live.

## 2.3 Which feature is which files

Every one of these is an addon, and every one is in the firmware that ships
on the board. This is the map — what each feature is made of, and therefore
what a named build would be leaving out if it dropped one. Nothing here
leaves the tree; §2.13 has the measurement that settled that.

| feature | addon | notes |
| --- | --- | --- |
| **Show player** (`core_show*`, `core_show_schedule`, `/show`, night/wake) | `show/` | The largest of them, integrated whole in v3.6.3. Also owns the `Black` preset, which left the pattern carousel with it. |
| **MQTT** (all modes, `/mqtt`) | `mqtt/` | The one that fails the infrastructure test — it needs a broker — and the reason the split looked attractive: ~1,500 lines of state machine serving the minority who run one. FlowLocal is Simone Majocchi's work and the Director lives inside FlowLocal, so this travels as one piece rather than being parcelled out by mode. Every capability it holds is also reachable over plain HTTP, including the knob write via `/api/params`. |
| **Weather** (`core_weather*`, `/weather`) | `weather/` | |
| **Audio-react websocket** (`core_audio_ws`, `/audio`) | `audio/` | The browser-microphone path, and the one addon with a server of its own. |
| **On-board audio** (512-pt FFT) | `audio_in/` | Needs a microphone soldered to the DevKit, which is why it is the reason the `audio` build exists at all. |
| **OSC** (`core_osc`, both directions) | `osc/` | Direct UDP, no infrastructure — it passes the test MQTT fails. The fifth port, and the first that did not fit the hook set: `observeFrame` had to be widened for it. |
| **Home Assistant** | *not an addon* | A Python component for a different product; it never compiled into the board's image. Its read path is plain core HTTP and its knob write moved from MQTT to `/api/params`, so it works against any firmware here. It moves to bendobos' own repository when he has one — §2.12 q2. |

**PFST / `.pfs` is split between the tree and the web, deliberately:** the
*format* and its authoring are web-side and cost the firmware nothing — [the
spec](pfst-v2-spec.md), the test vectors, and Pattern Lab's Director.
*Playback* is the `show/` addon. The lab's "upload to my device" affordances
probe the device (`/api/shows` answering = the capability check) and appear
only when the firmware in front of them can play, so the lab works
identically against any build. The format itself is frozen — §2.14.

## 2.4 The seam: how a variant stays current

The question that decides whether the model works: *when the core
updates, how does a variant take the update without pain?*

**Not runtime loading.** `.pfm` works because a pattern's interface is
tiny — three functions and an input frame. A *feature* needs web routes,
loop time, NVS, libraries; loading that dynamically on an ESP32 means
building an operating system. Rejected.

**A compile-time addon seam**, built on one observation: git merges are
only painful when both sides edit the *same files* — which is exactly
what made integrating the performance-director tree cost two days
(FlowLocal and the anti-brick guards interleaved in `core_mqtt.h`, both
trees' cards interleaved in `home_index.h`). Hence the rule:

> **A variant never edits a core file.** It *adds* files under `addons/`
> and registers them in one list (`addons/addons.h`). Its entire diff
> against the core is additions — `git merge upstream` is clean by
> construction, and taking a core update is one button.

The hooks the core commits to — derived from what the integrated
features actually needed, so the list is known sufficient:

| hook | what an addon gets | proven by |
| --- | --- | --- |
| `setup()` / Wi-Fi-connected edge | start services | show `begin()`, MQTT connect |
| `loop()` — non-blocking, no `delay()`, no long holds | per-frame work | show `tick()`, weather poll |
| HTTP route registration (handed the server) | own pages + `/api/*` | `/show`, `/mqtt`, `/weather` |
| status JSON extension | contribute to `caps`, add fields | lab's capability checks |
| console nav entry | a link on every page | already centralized in `/pf-console.js` |
| own NVS namespace | settings that survive switching | rule 5, §2.6 |
| the input frame + absolute bus | drive and read the knobs | the show player itself |
| input injection | push knob deltas / lane values / absolute holds | weather already drives the audio lane; MQTT injects deltas |
| overlay draw (after the pattern draws, before present) | clocks, banners, subtitles | the schedule's clock overlay |
| own FFat directory | file formats beyond patterns (`/shows` today, `/gifs` tomorrow) | the show player's table store |

Ground rules that ride along: **memory** — buffers ≥1 KB go through
`PFMem` → PSRAM (internal heap is the scarcest thing on the board); **own
servers/tasks are allowed** (the audio addon runs its own websocket port)
as long as the loop hook stays non-blocking.

**A second expansion axis, distinct from addons: overrides.** The `radio`
variant adds no feature — it re-tunes the panel clock and TX power. That
must not require editing core files either: the core's config carries an
official override point (the `#ifndef` guard pattern `net_config.h`
already uses, plus an `addons/overrides.h` the core includes first). A
settings variant is then also an additions-only diff.

**Proof of sufficiency is built into the migration:** the core's own show
player becomes the first addon. If it ports onto the hooks cleanly, the
seam is real — and the result doubles as the reference any variant
can start from.

**Deliberately out of reach in v1** (stated up front): the home page's
PROGMEM cards; new screens in the device's physical UI (the K2 menu is
core-owned — addons get a nav link and capability-driven web UI); the
render pipeline between canvas and panel (post-processing hooks — color
calibration, rotation — are a real future want but carry per-frame cost;
open question, not a v1 promise).

**Feasibility, measured against the code as it stands:** the shape is
half-built — every feature already registers its own HTTP routes in its
own `begin()`, twelve `PF_*_ENABLED` flags exist, the console nav is one
shared file. The honest cost is also measured: the `.ino` touches the
leaving features at **67 call sites** (MQTT 27, shows 13, weather 12,
audio 9, schedule 6), each of which becomes a hook invocation; and one
structural debt clears first — **the absolute parameter bus lives inside
`core_mqtt.h`** (`applyRemoteParam`, the held flags, `fillAbsolute`):
contract code inside a leaving file, with the show player calling
`PatternflowMqtt::` directly. Moving the bus to a neutral `core_bus` is
the same kind of step-one as moving the web server out of audio. A large
refactor, not a rewrite.

## 2.5 What every firmware has, concretely

Below the addons there is a floor that no build drops. This is it — and by
subtraction it is also the list of what a named build is turning off when it
leaves an addon out.

- **Console pages:** `/` (home), `/patterns`, `/status`, `/wifi`,
  `/update` — five, plus `/pf-console.js`. `/audio`, `/show`, `/weather`
  and `/mqtt` belong to their addons and are absent from a build that
  omits them; the nav is driven by `caps`, so nothing dangles.
- **API:** `status`, `patterns` (+ select/file/format/pending), `wifi`
  (+ boot/reboot), `update` (+ status), `sleep`, `params` *(new)*.
- **Feature-owned, and therefore droppable:** `core_show*`,
  `core_show_schedule`, `core_mqtt*`, `core_weather*`, `core_library_http`,
  `core_audio_ws`, and the page bundles `show_index` / `weather_index` /
  `mqtt_index` / `audio_index`. All of them live under `addons/` now, which
  is what makes dropping one a two-file decision instead of a fork.
- **Always present** (beyond the contract table): the fonts (console UI assets),
  `core_pack_select`, power clamp, sleep, OSC, Improv, the module loader
  and the whole `abi/`.

## 2.6 What a variant is

There are two kinds, and the rules below apply to both.

**Official** — a firmware built from *this* repository.
`firmware/bundles/<name>/` is two files saying which addons compile in and
what the build calls itself. No fork, no vendored code, no release cadence
of its own: a core change has to compile against it before it lands, which
is the point. This is what the `audio` firmware is.

**Community** — somebody else's repository, releases, issues and bin. A
fork, and that is fine: the right shape when the work is genuinely theirs
and its lapsing should cost this project nothing.

Rules a listed firmware agrees to, either kind (few, and all user-safety):

1. **Never change the partition table.** `/update` in, `/update` (or the
   flasher) out — always.
2. **Keep `/update` working.** Removing the escape hatch delists the
   variant.
3. **Report `variant` (and its own version) in `/api/status`.**
4. **Keep the `.pfm` loader and ABI intact** at whatever core version it
   tracks.
5. **NVS: shared namespaces are read-write only for their existing
   keys** — Wi-Fi credentials, brightness, selected pattern — so users
   switch without re-provisioning. Variant-own settings go in the
   variant's own namespace (`sm_*`, `radio_*`, …), never as new keys with
   new meanings inside core namespaces. This is what makes switching
   non-destructive in both directions.
6. **State plainly what it changes** — one honest paragraph. For `radio`
   that includes "8 MHz costs color depth on video content, 13 dBm
   exceeds the conformance TX setting; you opt out of both defaults
   knowingly."

## 2.7 How people find and switch

Built, and live at
[patternflow.work/variants](https://patternflow.work/variants).

- **The page** — a hand-curated list (curated by the maintainer, no
  formal listing process yet) on the site, linked from the console home
  page. Name, maintainer, one-line difference, the honest paragraph.
- **Hosting.** Official firmwares are built here and their images sit under
  `/flash/bin/<name>-<version>/` like any other release. A community bin can
  be hosted too, through `/api/variant-bin`. This is not generosity: the
  board cannot fetch over TLS, so one-click install works by handing the
  *browser* a `?src=` URL, and that fetch is cross-origin. GitHub release
  assets send no CORS header at all. Hosting is the only place one-click can
  happen, which makes "we host it" and "somebody vouched for it" the same
  boundary — deliberately.
- **Switch:** one click from the card, which opens the panel's own `/update`
  with the image URL. Anything not hosted here is downloaded by hand and
  dropped on `/update`. Settings survive either way (rule 5).
- **Return:** the browser flasher at patternflow.work/flash, or the core
  bin on `/update`.
- **The update banner** checks `variant`: on a variant it offers the
  variant's declared update feed, or stays quiet — never a core bin on
  top of someone's chosen firmware.

## 2.8 Where people talk

Role model: **monome** — code (GitHub), docs, and above all **lines**
(llllllll.co), a classic searchable thread-based Discourse forum whose
years of archive *are* the community's knowledge base. That is the shape
variant support needs: threads that get found next year, not chat that
scrolls away.

Staged, so nobody runs an empty forum:

1. **Now:** GitHub Discussions on this repo — variant authors are already
   here; announcements, variant support threads, firmware Q&A.
2. **When funded units ship:** a proper Discourse in the lines mold —
   classic, plain, general-purpose.
3. **The pattern gallery (`/community`) stays what it is** — patterns,
   decks, send-to-board: the part of the site monome doesn't have. It
   does not need to also be the forum.
4. **The workshop page retires *into* the forum, not into neglect.** Its
   intent — pin yourself, say what you're building, start a thread — was
   right; only the territory-map metaphor kept it from being general.
   Once the forum stands: pins and threads (people's words — never
   deleted) migrate or get linked, the first pinned forum thread inherits
   the job, the page redirects. A parked half-alive space reads as
   "nobody's home", which is worse than no space.

## 2.9 The shelf

Two firmwares, and both are built from this repository:

1. **Patternflow** — everything. What ships on the board.
2. **Patternflow Audio** — everything, plus a microphone that needs four
   wires soldered to the DevKit and a transmit power that is not the
   conformance-tested one. Neither belongs in the firmware everybody gets,
   which is the only reason this exists. When the microphone is a part on
   the board, it moves into the default and this stops existing.

An earlier draft of this section listed three firmwares and, with them,
three people who had never been asked whether they wanted to maintain one.
That was published for a few hours and taken down the same day. Naming
somebody as the future maintainer of a fork, in public, before asking,
makes the decision look already taken and leaves them to accept it or
object in front of an audience.

Somebody else's firmware is welcome and has its own tier on the page. That
tier is **empty**, and the page says so with a slot rather than hiding the
section — a shelf with a gap reads as somewhere things arrive; a shelf with
one thing on it reads as finished.

What would go in it: a build for a panel this project does not sell, a
performer's own pattern set baked in, an installation pinned to a firmware
that must never move again. What would *not* is "the default, minus a few
things" — §2.13 has the numbers on why that buys nobody anything.

## 2.10 Known tricky parts

- **The web server lives in the audio file** (`core_audio_ws.h` owns
  `httpServer`, serves `/` and `/audio`; every page attaches to it).
  Server ownership moves to a neutral `core_http.h` first. Mechanical,
  but step one.
- **The absolute bus lives in `core_mqtt.h`** (see §2.4) — moves to
  `core_bus` first, same class of step.
- **Fields the site reads** (`consolePaused`, `/api/mqtt`, …) need an
  absent-field audit: what does each web surface render when a feature is
  gone?
- **HA:** knob write moves to `/api/params` (works everywhere); anything
  MQTT-only must detect a core-only device and say so visibly, not fail
  silently.
- **`/api/params` write discipline:** sliders can fire dozens of writes a
  drag on a one-connection server. One-shot by contract; clients
  debounce; stated in rest-api.md the day it ships.
- **The lab's device-upload buttons** switch to capability probing.
- **Versioning:** nothing breaks, so there is no 4.0. The seam shipped as
  **3.7.0**, a feature release, and every firmware from 3.6.3 onward
  contains everything it always did. A named build from this tree states
  which core it was built against; one built elsewhere versions itself and
  reports the same through `/api/status`.

## 2.11 Migration order

*Progress against this order is tracked in
[rfc-core-and-variants-progress.md](rfc-core-and-variants-progress.md).*

Steps 1–4 landed, and shipped as 3.7.0. Steps 5 and 6 were the split
itself, and they are cancelled — §2.13.

1. Move the two pieces of contract code out of leaving files, no
   behaviour change: `httpServer` → neutral `core_http`; absolute bus →
   neutral `core_bus`.
2. Add `variant`/`caps` to `/api/status` + banner logic, and
   `POST /api/params` (all ship in a 3.6.x so the ecosystem — HA
   included — can rely on them before the split).
3. Extract shows, weather, MQTT, audio-ws behind `PF_*_ENABLED` flags
   (compile-out proves each seam); let what the flags reveal finalize the
   hook list.
4. Cut the hooks + `addons/` seam; **port the show player onto it as the
   first addon** — sufficiency proof and reference implementation.
5. ~~Delete the extracted features from core → 4.0.0.~~ **Cancelled**
   (§2.13). Nothing leaves. The seam is used to publish *named builds*
   from this tree instead — `firmware/bundles/`, two files each.
6. ~~Somebody forks v3.6.3 and publishes a variant.~~ **Cancelled with
   step 5.** A firmware built from this repository is not a fork and does
   not need one. Somebody else's fork is still welcome; it is just not the
   plan any more.

What is left is not a migration. It is: keep the formats frozen (§2.14),
and add a named build when — and only when — something turns up that the
default genuinely cannot carry.

## 2.12 Open questions

1. *(answered — no, and he was right)* Simone — running the
   show/MQTT/weather stack as a separate firmware. He argued in
   [#349](https://github.com/engmung/Patternflow/issues/349) that it
   redefines a product already sold, at a reliability tier the funded
   page never disclosed. Measuring it agreed with him from the other
   direction: the move buys nothing. See §2.13.
2. *(answered — yes; not yet done)* bendobos — the HA integration moves
   to his own repo, and he reports nothing missing from the hook table for
   it. The HA knob write is core HTTP either way, so HA works against a
   bare core with no variant at all. **It stays in this tree until he has a repo
   and tells us** — that was the agreed order, so nothing is removed here
   ahead of somewhere for HA users to go. Unaffected by the withdrawal in
   §2.13, which is about firmware features; see the note there on the HACS
   URL having to survive the move.
3. Anything the hook table (§2.4) misses for what you'd want to build?
   It was derived from the features already integrated — but you know
   your own roadmaps, and hooks are easiest to add *before* they are a
   published contract.
4. *(answered — built)* How should people find and switch between
   firmwares? [patternflow.work/variants](https://patternflow.work/variants):
   official builds from this tree and community ones from elsewhere, each
   card saying why it is not simply the default, with one-click install
   for images served from here. The original text follows.

   > How should people find and switch between variants? §2.7 proposes a
   > curated list on the site plus a link from the console, but this is the
   > part the maintainer is least settled on — a repo document, deeper
   > console integration, something else entirely. Accessibility is the
   > goal; suggestions welcome.

*(Already settled, so nobody spends a comment on them: sleep stays core —
power/heat-adjacent, and the console needs it. Timing is not gated on the
campaign; units are months from shipping and the firmware changes all the
way there, so sooner is better. Both `variant` and `caps` ship in status —
machines probe `caps`, humans read `variant`. Variants stay
maintainer-curated with no formal listing process, deliberately.)*

## 2.13 What changed, and why step 5 is withdrawn

*Added 2026-08-27, after the seam was built and the first firmware was
published from it.*

> **Half of this was amended the next day — see §2.15.** The seam, the
> measurement and the drift argument stand. The conclusion drawn from them —
> that every feature therefore ships in one default build — rested on
> "a feature you install is not a feature the product has", which this
> project's own patterns disprove. Which features each edition carries is
> open again; where the code lives is not.

Steps 1–4 were right and they shipped. Step 5 was wrong, and it was wrong
for a reason worth writing down rather than quietly deleting.

### The measurement that killed it

Three builds, one panel, 27 August 2026. **The procedure matters more than
it looks** — see the note below:

| build | addons | `.bin` on disk | free internal heap | **largest free block** |
|---|---|---|---|---|
| default — what ships | 5 | 1,412,816 | 84,896 | **73,716** |
| the `audio` bundle | 3 | 1,134,288 | 83,264 | **73,716** |
| `PF_ADDONS_NONE` | 0 | 1,095,200 | 101,472 | **92,148** |

Two notes on the columns, because this project has already published numbers
that measured different things under the same name:

- **`.bin` on disk** is the file you flash. The toolchain reports a figure
  ~360 B smaller (1,412,457 for the default = **44.9 %** of the 3,145,728 B
  app partition) — that is program storage, before the image header, padding
  and hash. Elsewhere in this repo the toolchain figure is the one quoted.
- **Free internal heap** is read from the running device. It is *not* the
  92,920 B that appears next to these flash figures elsewhere: that number
  is static RAM **used**, 28.4 % of 327,680 B, and an earlier version of this
  table printed it in this column by mistake.

The largest free block is the ceiling on how big a loadable `.pfm` can be.
Read the table honestly and it says two things, one of which argues against
this section:

- **A firmware somebody would actually ship gains nothing.** The `audio`
  bundle drops the show player, weather and MQTT — 278,528 bytes of flash,
  a fifth of the image — and lands on **exactly the same ceiling**, to the
  byte. That is the whole
  case for step 5, tested against the one real build that exists, and it
  comes back zero.
- **A build with no addons at all gains 18 KB** (92,148, +18,432). Not
  nothing. But that is a compile flag, not a product: no shows, no MQTT, no
  weather, no OSC, no sound. And it is headroom on top of headroom — the
  real community library runs 4.6–17.5 KB per `.pfm` (median 5,924 B across
  42 patterns) and the largest module anyone has built is 29 KB, against a
  ceiling already two and a half times that, on a board using 45 % of its
  flash. Loading that 29 KB module is itself what moves the number: with one
  resident the largest block was 65,524 B at 48.5 fps — measured on v3.5.2,
  a core-2.x build, so treat it as the shape rather than today's figure.
  What a big pattern competes with is the last big pattern, not the addons.

An earlier version of this section reported +12.3 KB here, and so did the
[RFC issue](https://github.com/engmung/Patternflow/issues/349) publicly. That
figure came from a step-3 measurement recorded in
[the progress log](rfc-core-and-variants-progress.md#what-the-slim-core-measures)
and appears to have been carried over from `firmware/README`'s v3.5.2
core-2.x table rather than re-taken. It was stale, and it was **low**: the
real gap is larger. The argument survives being corrected upward.

### How these were measured, because it decides the numbers

Flash the build, reboot, wait ~80 s, and take **one** reading of
`/api/status`. Not two.

`heapLargest` decays as the device serves HTTP — in steps of exactly 2,048
bytes. Polling it eighteen times walks the bare core from 92,148 down to
88,052, so a build sampled more often looks worse than one sampled less,
and any two numbers taken over different windows are not comparable. Every
figure above is a single post-boot read, and none of the earlier numbers in
this project recorded which procedure produced them.


### What it would have cost

The Crowd Supply page lists MQTT and bidirectional OSC under Software — as
things the device does, not things you bolt on. Backers funded that. Moving
those into separately-owned repositories would have redefined the product
after it was sold, and at a reliability tier the page never disclosed.

Simone Majocchi ([@SimonePDA](https://github.com/SimonePDA)) put that
argument in [#349](https://github.com/engmung/Patternflow/issues/349), and
it is correct.

### And it works against the thing this document was for

The stated motive was to stop the maintainer being the integrator of
everything — specifically, to stop his tree and other people's trees drifting
apart between merges.

**A separate repository is where that drift happens.** With an addon in this
tree, changing a hook fails the build immediately and is fixed in the same
commit; that is exactly what happened when `observeFrame` was widened for OSC
and MQTT broke in the compiler a second later. With the same addon in
somebody else's tree, nothing happens, it silently rots, and the eventual
re-convergence is worse than the merge that was being avoided.

The seam already solved the hard half. Merge conflicts are gone because a
firmware adds files and edits none. What remained was never a merge problem —
it was "am I responsible for understanding this?", and that is answered with
a rule, not with a repository boundary.

### What replaces it

**Everything stays in this tree.** MQTT, the show player, weather, OSC,
audio. *(The second half of that sentence — that the default build is all of
them — is what §2.15 reopens. The first half is not in question.)*

**Named firmwares are built from it.** `firmware/bundles/<name>/` is two
files — `addons_local.h` and `overrides.h` — saying which features compile in
and what the firmware calls itself. No code, no fork, no duplication.

**A bundle earns its place only by carrying what the default cannot**: a part
that is not on the board yet, a setting that must not be universal, or a
build somebody needs pinned so a show behaves the same at the next gig.
"Everything minus a few things" is not a reason and the numbers above are why.

**Somebody else's firmware is still welcome** — that is what the community
tier on the shelf is for. Nobody has published one yet.

**"Nothing leaves" is about the firmware.** One agreed move is not covered by
it and should not be read as reversed: bendobos taking the Home Assistant
integration to his own repository (§2.12 q2). That is not a variant and not a
fork — it is a Python component for a different product, it never compiled
into the board's image, and its read path is plain core HTTP that works
against any firmware here. It stays here **until he has a repo and says so**, which is the
agreed order and not an oversight: it lives in `integrations/homeassistant/`,
`hacs.json` sits at this repository's root, and every release attaches its
zip, so HA users keep working the whole time. It comes out of this tree on
his word, not on a date. The one thing that has to be handled when it does:
the HACS custom-repository URL people already pasted points here, so it has
to keep resolving or existing installs break.

### The rule that was missing

A contributed addon arrives with a bundle its author owns. If that author
stops and the addon breaks, **it drops out of the next default build** — no
argument, no negotiation, and the bundle stays on the shelf pinned to the
last core it worked on.

Without this the maintainer eventually carries every feature anybody ever
contributed, which is the position this whole document was written to escape.
With it, "in this tree" costs a compile, not a promise.

## 2.14 The formats are frozen

The real guarantee a performer needs is not that the firmware never changes.
It is that **the files keep working**.

Two contracts, and from here they do not move:

| | what is fixed |
|---|---|
| **`.pfm` ABI** (`abi/pf_abi.h`) | `PFInputFrame`, `PFHostAPI`, `PFPatternModule` — field order and meaning |
| **`.pfs` shows** (PFST v1/v2) | 76-byte header, 16-byte cues, the flag bits |

**Frozen means:** bytes do not move. Fields are appended, never reordered and
never reinterpreted. Old files play forever. Anything else takes a version
byte, and the old version keeps working — which is how `paramAbsolute` was
added without breaking a single existing module, and how PFST v2 kept v1
byte-identical.

This is already the practice. It has not been a promise, and it should be.

**Before it is signed, the people who wrote these formats get the last word.**
The show format is Simone's; the module ABI has been shaped by everyone who
has shipped a pattern against it. If anything needs to change, it changes
now — after this, it does not.

One candidate is already visible: a pattern reads sound through
`knobAudioValue[4]`, four numbers mapped to the knobs. On-board audio is
coming, and a pattern that wants a spectrum rather than four bands would need
a wider lane. Adding that later is an ABI 3. Deciding it now is free.

## 2.15 Editions: the pattern precedent

> This section is the argument. **[EDITIONS.md](EDITIONS.md) is the document
> to actually use** — what a feature is, how to write one, how to cut an
> edition, and what every build has to promise.

*Added 28 August 2026. This amends §2.13, which was written the day before
and concluded that every feature ships in one default build. The seam and the
freeze in §2.13 and §2.14 stand; the composition question is reopened, on an
argument §2.13 did not consider.*

### What §2.13 assumed, and why it was wrong

Withdrawing the split rested on a claim that looks obvious and is not: that a
feature you have to install is a feature the product does not have. The
funded page lists MQTT and bidirectional OSC under Software; if a stock panel
did not answer MQTT, the reasoning went, the page would be a lie.

**This project already refutes that, and it refutes it with its best work.**

Community patterns are not in the firmware. A panel arrives with a loader and
a catalogue; the patterns come from the shelf, one click, over Wi-Fi, and
nobody has ever suggested that a pattern somebody installed is therefore not
Patternflow. The 42-pattern library is the most alive part of the project and
none of it ships in the image.

A firmware edition is the same shape by the same route: the same shelf, the
same one click, the same `/update`, and settings, networks and installed
patterns all survive it. If "you install it" demotes MQTT, it demotes every
pattern anyone has written, which is plainly false. So it demotes neither.

### What separation is actually for

Not flash. §2.13 measured that and the numbers hold: dropping features buys
the person holding the panel nothing they can use.

**It is for the blast radius of a change.** With one build carrying
everything, every edit is potentially cross-cutting and the only proof
otherwise is reading. With a build that does not contain MQTT, a mistake in
audio *cannot* have broken MQTT — not "was reviewed and probably didn't", but
could not, because it was not there to break.

That matters more now than it would have a year ago, because most of the
editing is done by an agent rather than by the person who wrote the file. A
guarantee the compiler enforces is worth more than a habit a reviewer keeps,
and it is the only kind that survives being handed to something that does not
remember yesterday.

### What this does not change

- **Every feature stays in this tree.** `addons/` holds them all; nothing
  moves to another repository and nothing is anybody else's to maintain. That
  half of §2.13 was right for the reasons given there, and the drift argument
  is unaffected: a hook change still breaks the build in the same commit.
- **A core change still has to compile against every published edition**
  before it lands. Composition is not ownership.
- **The formats stay frozen** (§2.14). An edition change must never make a
  `.pfs` or a `.pfm` stop opening — that is the guarantee a performer
  actually needs, and it is orthogonal to which features a build carries.
- **Leaving an edition stays one click**, and remains the rule for being
  listed at all.

### Naming

"Addon" was the wrong word and should be retired. It suggests something
optional, third-party, bolted on — none of which is true of a directory in
this repository implementing a first-class feature behind a fixed interface.
They are **features**; a build is a **composition** of them; a published
composition is an **edition**.

### Still open

Which features each edition carries, and whether a default edition keeps
everything, are decisions for the person shipping the product, not for this
document. What this section settles is only that "it has to be installed" is
not an argument against, because the project has been distributing its most
important content that way since it began.
