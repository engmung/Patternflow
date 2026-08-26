# Core/variants split — progress

Running log of the restructuring proposed in
[rfc-core-and-variants.md](rfc-core-and-variants.md), against the six-step
migration order in §2.11. Updated as steps land.

**Where it stands: steps 1–3 done, 4–6 open.** Everything so far is
neutral — no feature has left the core, nothing behaves differently, and
the tree is in a state that can simply be left alone if the discussion in
the RFC issue changes the plan.

| step | what | state |
| --- | --- | --- |
| 1 | Move contract code out of leaving files | **done** |
| 2 | `POST /api/params`, `variant` + `caps` in status | **done** |
| 3 | Compile each leaving feature out, prove the seams | **done** |
| 4 | Cut the hooks + `addons/`; port the show player onto it | open |
| 5 | Delete the extracted features → core 4.0.0 | open |
| 6 | Variants fork | open |

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

## What is deliberately not done yet

Step 4 cuts the hook interface, and **a hook is a contract once it is
published** — a variant author builds on it, and changing it later breaks
their firmware. The hook list in RFC §2.4 was derived from what the
already-integrated features needed, which is evidence about the past, not
about anyone's roadmap. Question 3 in the RFC issue asks exactly this, and
it is cheap to answer now and expensive to answer after step 4.

So the tree waits here, in a state that costs nothing to wait in.
