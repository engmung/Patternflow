# RFC: a small core, and variants around it

*Restructuring the firmware. Written 2026-08-26; the work starts this
weekend and lands by September 3rd. Discussion happens on the issue that
announces this file — the open questions at the end are real ones.*

This document is two things on purpose. **Part 1 is the maintainer, in
his own words** — the decision and why. **Part 2 is the specification** —
precise and mechanical, written so a contributor (or an AI agent handed
this file) can implement against it without asking what was meant.

---

# Part 1 — Why

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
recovery-adjacent** is core (power clamp, sleep, `/update`); anything
that exists to be **disagreed about** — schedulers, bridges, radio
trade-offs — is a variant, because disagreement is what variants are for.

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
| **`POST /api/params`** *(new)* | The capability MQTT was the only carrier of: write the four absolute channels over plain HTTP, one shot per request, same release-on-touch semantics as the bus. This is what lets MQTT leave without any capability leaving with it — HA's knob write moves to it. (The old `/api/knob` was removed as *unused*, not unsafe; the rule against polling this one-connection server stands.) |
| **`/api/status` reports `variant` + `caps`** *(new)* | `variant`: one human-readable string (`"core"`, `"simone-pd"`, `"radio"`). `caps`: machine-probed feature list (`["shows","mqtt"]`) for the site/lab. Also how the update banner knows not to offer a core bin on top of a variant. |

This table is the whole of "maintaining the frame". It is small, changes
slowly, and none of it is where creative disagreements live.

## 2.3 What becomes a variant

Nothing is discarded — each feature is handed to the people who care
about it most, and the day it moves, its replacement is already in place:
a listed variant, one file drop away.

| leaves | natural home | notes |
| --- | --- | --- |
| **Show player** (`core_show*`, `core_show_schedule`, `/show`, night/wake) | Simone's variant | v3.6.3 integrated his stack whole and is the natural fork point — his variant starts *finished*. |
| **MQTT** (all modes, `/mqtt`) | Simone's variant | Fails the infrastructure test (needs a broker); ~1,500 lines of state machine serving the minority who run one. **Corrected from an earlier draft**, which split this across two variants: FlowLocal is Simone's and the Director lives inside FlowLocal, so the MQTT code goes to him whole. That does not dissolve the IoT variant — bendobos's integration is its own body of work, and where the two meet is for them to agree. Every capability MQTT held stays reachable in core over HTTP, including the knob write via `/api/params`. |
| **Weather** (`core_weather*`, `/weather`) | Simone's variant | |
| **Audio-react websocket** (`core_audio_ws`, `/audio`) | its own variant (or retired) | OSC stays core; this is only the browser-mic path. |
| **Home Assistant / IoT** | an IoT variant + the existing HA repo | The integration's *read* path is plain core HTTP and works everywhere; its knob-*write* path moves from MQTT to `/api/params`, so **HA works fully against the bare core**. The MQTT half (publisher role, bridges) follows MQTT into the IoT variant. |

**PFST / `.pfs` splits down the middle, deliberately:** the *format* and
its authoring stay with the project — [the spec](pfst-v2-spec.md), the
test vectors, and Pattern Lab's Director are web-side and cost the
firmware nothing. *Playback* leaves with the show player. The lab's
"upload to my device" affordances probe the device (`/api/shows`
answering = the capability check) and appear only when the firmware in
front of them can play — the lab works identically against core and
variants.

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
seam is real — and the result doubles as the reference addon `simone-pd`
starts from.

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

## 2.5 What stays in 4.0, concretely

- **Console pages:** `/` (home), `/patterns`, `/status`, `/wifi`,
  `/update` — five, plus `/pf-console.js`. `/audio`, `/show`, `/weather`,
  `/mqtt` leave with their features.
- **API:** `status`, `patterns` (+ select/file/format/pending), `wifi`
  (+ boot/reboot), `update` (+ status), `sleep`, `params` *(new)*.
- **src/ that leaves:** `core_show*`, `core_show_schedule`, `core_mqtt*`,
  `core_weather*`, `core_library_http`, `core_audio_ws` (its `httpServer`
  ownership moves to a neutral `core_http` first), and the page bundles
  `show_index` / `weather_index` / `mqtt_index` / `audio_index`.
- **Stays** (beyond the contract table): the fonts (console UI assets),
  `core_pack_select`, power clamp, sleep, OSC, Improv, the module loader
  and the whole `abi/`.

## 2.6 What a variant is

A **fork of the core that ships its own releases.** Not a submodule here,
not a branch here, not a PR queue — those re-create the integration
burden this RFC ends. The author owns their repo, issues, cadence, bin.

Rules a listed variant agrees to (few, and all user-safety):

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

- **A Variants page** — deliberately humble MVP: a hand-curated list
  (curated by the maintainer, no formal listing process yet) on the site,
  linked from the console home page. Name, maintainer, one-line
  difference, link to *their* releases, the honest paragraph. The core
  does not mirror or re-host variant bins.
- **Switch:** download their bin, drop it on `/update`. Settings survive
  (rule 5).
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

## 2.9 The first shelf

Three variants already visible — a good sign the shape is real:

1. **`simone-pd`** — shows, schedule, weather, MQTT (FlowLocal and the
   Director inside it are his), his fonts.
   Fork of v3.6.3; day-one finished.
2. **`iot`** — bendobos's existing IoT integration as its own repo.
   Not a gap to fill: it is built, and the split asks it to move out.
   Where it ends and Simone's MQTT begins is for the two of them.
   *(Owner to ask: @bendobos, who built the HA integration and sleep.)*
3. **`radio`** — the cartoonmonkeystudio configuration: 8 MHz panel
   clock, raised TX power, for hostile-Wi-Fi units. The patch the core
   rightly declined becomes a firmware someone rightly ships. *(Owner to
   ask: CE.)*

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
- **Versioning:** the slim core is a breaking change to what "the
  firmware" contains → **core v4.0.0**. v3.6.3 stands as the last
  full-integration snapshot and the fork point. Variants version
  themselves and state which core they track.

## 2.11 Migration order

*Progress against this order is tracked in
[rfc-core-and-variants-progress.md](rfc-core-and-variants-progress.md).*

Steps 1–3 are safe to land before anything is agreed — they are neutral
refactors and additive endpoints that improve the tree either way. Steps
4–6 are the split itself.

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
5. Delete the extracted features from core → **4.0.0**. Variants page +
   README table; lab upload buttons capability-probed.
6. Simone forks v3.6.3 (or adopts the addon port) → `simone-pd`; ask CE
   about `radio`, bendobos about `iot`.

## 2.12 Open questions

1. Simone — does the `simone-pd` shape match what you want to own?
   Anything in §2.3 you'd rather see stay core?
2. bendobos — the IoT integration as its own repo: does the `iot` split
   in §2.3 match how you'd want to carry it? (The HA knob write moves to
   core HTTP either way, so HA keeps working against a bare core.)
3. Anything the hook table (§2.4) misses for what you'd want to build?
   It was derived from the features already integrated — but you know
   your own roadmaps, and hooks are easiest to add *before* they are a
   published contract.
4. How should people find and switch between variants? §2.7 proposes a
   curated list on the site plus a link from the console, but this is the
   part the maintainer is least settled on — a repo document, deeper
   console integration, something else entirely. Accessibility is the
   goal; suggestions welcome.

*(Already settled, so nobody spends a comment on them: sleep stays core —
power/heat-adjacent, and the console needs it. Timing is not gated on the
campaign; units are months from shipping and the firmware changes all the
way there, so sooner is better. Both `variant` and `caps` ship in status —
machines probe `caps`, humans read `variant`. Variants stay
maintainer-curated with no formal listing process, deliberately.)*
