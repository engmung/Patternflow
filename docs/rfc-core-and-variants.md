# RFC: a small core, and variants around it

*A proposal to restructure the firmware — for agreement, not yet for
implementation. Discussion happens on the pull request that carries this
file. Written 2026-08-26.*

---

## The problem, honestly

Integrating the performance-director work took two full days of one
maintainer's time, and it was *good* work arriving from *one* person who
communicates well. The merge surfaced a Wi-Fi aliasing bug, an ABI default
that silently disabled a headline feature, and a font-API compatibility
shim — none of which either tree had alone. That cost is not an accident to
be optimized away; it is what integrating two living firmwares costs.

Crowdfunding multiplies the number of people who will send firmware. The
current model makes every one of those contributions the maintainer's
integration problem. It does not scale to two Simones, let alone ten.

And the model already fails a real group today: **people whose units have
bad Wi-Fi.** The fix is known — drop the HUB75 clock to 8 MHz, raise the
radio's TX power — and the core cannot ship it: the clock change costs
colour depth on every healthy unit, and 13 dBm TX is a conformance setting
on funded hardware, not a preference ([the
investigation](investigations/2026-08-the-panel-clock-and-the-wifi-radio.md)).
So today those people get a documentation page telling them to edit
`config.h` and build a toolchain. Under this proposal they get a link and a
file to drop on `/update`.

Simone has recommended this direction independently. This RFC is the shape
of it.

## The idea in one line

**The core stops being a product with every feature, and becomes the stable
ground variants stand on.** One maintainer keeps the ground solid; everyone
else ships their firmware as *their* firmware — a bin anyone can flash with
one drop, and leave with one drop.

The mechanism already exists and needs no invention: `POST /update` accepts
any app image today. Switching to a variant *is* a firmware update.
Switching back is the browser flasher. What is missing is the contract that
makes this safe, and the shelf that makes it discoverable.

---

## The core contract

The core is defined by what it **guarantees**, not by what it includes. A
variant may add anything; it must not break these, because these are what
make "drop a bin, drop back out" safe and what keep the pattern ecosystem
shared:

| guarantee | why it is the contract |
| --- | --- |
| **Partition layout + `/update`** | The escape hatch. Any variant can be entered and left over Wi-Fi. A variant that changes partitions strands its users — this is the one hard MUST NOT. |
| **`.pfm` module ABI + loader** (`abi/pf_abi.h`, `pf_params.h`, the FFat volume) | Patterns are the shared economy. Every variant plays the same community modules or the split fractures the interesting part of the project. |
| **Absolute parameter bus** (`InputFrame.paramAbsolute*`) | Part of the module ABI, not a feature: `ABSOLUTE_READY` patterns read it. Players/bridges that *drive* it are variant territory; the bus itself is ground. |
| **Panel driver, canvas, encoders, power clamp** | The hardware floor. The clamp ships enabled on funded units; a variant may re-tune it for its audience (that is the radio variant's whole point) but the core default stays conservative. |
| **Wi-Fi + provisioning** (Improv serial, `/wifi`, multi-network + boot slot) | A device you cannot reach is a brick with LEDs. |
| **OSC** | Required (live control floor). |
| **Sleep** | Small, safety-adjacent (power/heat), console needs it. |
| **Minimal HTTP surface**: `/`, `/patterns`, `/status`, `/wifi`, `/update` + their `/api/*` | What the site, the docs and the HA integration's read path assume exists everywhere. |
| **`/api/status` reports `variant`** *(new)* | One string, e.g. `"core"`, `"simone-pd"`, `"radio"`. How the console, the site and support tell what they are talking to — and how the update banner knows not to offer a core bin on top of a variant. |

Everything in this table is what "I maintain the frame" means. It is small,
it changes slowly, and none of it is where the creative disagreements live.

## What leaves the core

| leaves | natural home | notes |
| --- | --- | --- |
| **Show player** (`core_show*`, `/show`, schedule, night/wake) | Simone's variant | v3.6.3 integrated his stack whole and is the natural fork point — his variant starts *finished*. |
| **MQTT** (all modes incl. FlowLocal, `/mqtt`) | Simone's variant / an IoT variant | |
| **Weather** (`core_weather*`, `/weather`) | Simone's variant | |
| **Audio-react websocket** (`core_audio_ws`, `/audio`) | its own variant (or retired) | OSC stays in core; this is only the browser-mic path. |
| **Home Assistant / IoT** | an IoT variant + the existing HA repo path | The HA integration's *read* path is plain core HTTP and keeps working everywhere; its knob-*write* path is MQTT and therefore follows MQTT out. The integration should detect and say so rather than half-work silently. |

**PFST / `.pfs` gets split down the middle, deliberately:** the *format* and
its authoring stay with the project — [the spec](pfst-v2-spec.md), the test
vectors, and Pattern Lab's Director are web-side and cost the firmware
nothing. *Playback* leaves with the show player. The lab's "upload to my
device" affordances probe the device (`/api/shows` answering is the
capability check) and appear only when the firmware in front of them can
play — so the lab works identically against core and variants.

## What a variant is

A **fork of the core that ships its own releases.** Not a submodule in this
repo, not a branch here, not a PR queue — those all quietly re-create the
integration burden this RFC exists to end. The variant author owns their
repo, their issues, their release cadence, their compiled bin.

The rules a listed variant agrees to (they are few, and they are all
user-safety):

1. **Never change the partition table.** `/update` in, `/update` (or the
   flasher) out — always.
2. **Keep `/update` working.** Removing the escape hatch delists the
   variant.
3. **Report `variant` (and its own version) in `/api/status`.**
4. **Keep the `.pfm` loader and ABI intact** at whatever core version the
   variant tracks.
5. **NVS: shared namespaces are read-write only for their existing keys.**
   Wi-Fi credentials, brightness, selected pattern — a variant reads and
   writes the same slots so users switch without re-provisioning. Variant-
   *own* settings go in the variant's own namespace (`sm_*`, `radio_*`, …),
   never as new keys with new meanings inside core namespaces. This is what
   makes switching non-destructive in both directions.
6. **State plainly what it changes** — one honest paragraph. For the radio
   variant that paragraph includes "8 MHz costs colour depth on video
   content, 13 dBm exceeds the conformance TX setting; you are opting out
   of both defaults knowingly."

## How people find and switch

- **A Variants page on the site** (and a table in the core README): name,
  maintainer, one-line difference, link to *their* releases, and the honest
  paragraph. The core does not mirror or re-host variant bins — the link
  goes to the author's release, the author owns what is in it.
- **Switch:** download their bin, drop it on the console's `/update` page.
  Settings survive (rule 5).
- **Return:** the browser flasher at patternflow.work/flash, or the core
  bin on `/update`.
- **The console's update banner** checks `variant`: on a variant it offers
  the *variant's* update feed if one is declared, or stays quiet — it never
  offers to overwrite someone's chosen firmware with the core bin.

## The first shelf

Three variants are already visible from here, which is a good sign the
shape is real:

1. **`simone-pd`** — shows, schedule, weather, MQTT/FlowLocal, his fonts.
   Fork of v3.6.3, which already integrated all of it; day-one finished.
2. **`radio`** — the cartoonmonkeystudio configuration: 8 MHz panel clock,
   raised TX power, for units with hostile Wi-Fi. The patch the core
   rightly declined becomes a firmware someone rightly ships. *(Needs an
   owner — CE would be the natural one to ask.)*
3. **`iot`** — MQTT + the HA knob-write path, for the smart-home crowd.

## The tricky parts (known before anyone starts)

- **The web server lives in the audio file.** `core_audio_ws.h` owns
  `httpServer` and serves `/` and `/audio`; every other page attaches to it.
  Extracting audio therefore starts with moving server ownership into a
  neutral `core_http.h`. Mechanical, but it is step one, not a footnote.
- **`consolePaused`, `/api/mqtt`, and other fields the site reads** need an
  audit: what does the web console render when a field's feature is gone?
  Absent-field tolerance is part of making the core surface minimal.
- **HA:** the integration must detect a core-only device and disable knob
  writes *visibly* (an entity that says why), not fail silently.
- **The lab's device-upload buttons** switch to capability probing (above).
- **Versioning:** the slim core is a breaking change to what "the firmware"
  contains → **core v4.0.0**. v3.6.3 stands as the last full-integration
  snapshot and the fork point. Variants version themselves and state which
  core they track.

## Migration order (when agreed)

1. Move `httpServer` ownership out of audio (no behaviour change).
2. Add `variant` to `/api/status` + banner logic (ships in a 3.6.x, so the
   ecosystem can rely on it before the split).
3. Extract shows, weather, MQTT, audio-ws behind their `PF_*_ENABLED` flags
   first (compile-out proves the seams), then delete for core 4.0.0.
4. Variants page + README table; lab upload buttons go capability-probed.
5. Simone forks v3.6.3 → `simone-pd`; ask CE about `radio`.

## Open questions (the ones this RFC wants answered)

1. Simone — does the `simone-pd` shape match what you want to own? Anything
   in the "leaves" table you'd rather see stay core?
2. Is one `variant` string enough, or do variants also want a feature-flags
   field (`"caps":["shows","mqtt"]`) so the site/lab can probe less?
3. Should sleep stay core (proposed: yes — power/heat) or go?
4. Does the funding campaign need the slim core *before* launch, or is
   "v3.6.3 now, 4.0.0 after" the calmer sequence?
