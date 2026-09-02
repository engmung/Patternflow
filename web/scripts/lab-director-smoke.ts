// Smoke test for the Director bake pipeline (lib/lab/director): curves sample
// correctly, lanes merge into sparse cues, budgets flag, the baked show
// survives the full community rail (validate → encodePfst → decodePfst →
// re-import → identical staircase), and the show rides project persistence.
// Run: npx tsx scripts/lab-director-smoke.ts

import {
  bakeShow,
  bakeShowV2,
  continuousLaneValue,
  cubicBezierY,
  resolveLane,
  showFromPerformance,
} from "../src/lib/lab/director/bake";
import {
  DEFAULT_CURVE_CP,
  directorId,
  emptyShow,
  type DirectorKeyframe,
} from "../src/lib/lab/director/types";
import {
  decodePfst,
  encodePfst,
  serializePerformance,
  validatePerformance,
} from "../src/lib/pattern/pfst";
import { sampleShow, toKnobFrames } from "../src/lib/lab/director/sample";
import { MIDI_LANE_CCS, showToMidi } from "../src/lib/lab/director/exporters/midi";
import { deserializeProject, serializeProject } from "../src/lib/lab/serialize";
import { codeLayerFromSource } from "../src/lib/lab/store";
import { livePresets } from "../src/lib/presets";

function fail(message: string): never {
  console.error("DIRECTOR SMOKE FAILED:", message);
  process.exit(1);
}

function key(t: number, v: number, mode: "hold" | "curve" = "hold"): DirectorKeyframe {
  return { id: directorId(), t, v, mode, cp: [...DEFAULT_CURVE_CP] };
}

// ── bezier ──
{
  if (cubicBezierY(DEFAULT_CURVE_CP, 0) !== 0) fail("bezier y(0) must be 0");
  if (cubicBezierY(DEFAULT_CURVE_CP, 1) !== 1) fail("bezier y(1) must be 1");
  const linear: [number, number, number, number] = [1 / 3, 1 / 3, 2 / 3, 2 / 3];
  for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    if (Math.abs(cubicBezierY(linear, x) - x) > 1e-4) fail(`linear bezier y(${x}) ≠ x`);
  }
  let previous = 0;
  for (let i = 1; i <= 20; i++) {
    const y = cubicBezierY(DEFAULT_CURVE_CP, i / 20);
    if (y < previous - 1e-6) fail("default ease must be monotonic");
    previous = y;
  }
  console.log("director smoke OK", { part: "bezier" });
}

// ── bake: holds, curves, merge, elision ──
{
  const show = emptyShow();
  show.length = 20;
  show.loop = true;
  show.title = "Smoke Show";
  // Lane 0: curve 0→1000 over 0..10, then hold.
  show.lanes[0] = [key(0, 0, "curve"), key(10, 1000)];
  // Lane 1: hold cues only, with a deliberate duplicate value to elide.
  show.lanes[1] = [key(0, 500), key(5, 500), key(12, 100)];
  // Lane 2: two keyframes one second apart — no room to fill.
  show.lanes[2] = [key(3, 0, "curve"), key(4, 800)];
  show.messages = [
    { id: directorId(), t: 2, text: "hello" },
    { id: directorId(), t: 15, text: "  " }, // blank → dropped
  ];

  const baked = bakeShow(show);
  const cueAt = (t: number) => baked.perf.timeline.find((c) => c.t === t);

  // Curve lane: a cue at every second 0..10 (values strictly rising, so no elision).
  for (let s = 0; s <= 10; s++) {
    const cue = cueAt(s);
    if (!cue?.param || cue.param[0] == null) fail(`curve lane missing cue at ${s}s`);
  }
  const v3 = cueAt(3)!.param![0]!;
  const v5 = cueAt(5)!.param![0]!;
  const v7 = cueAt(7)!.param![0]!;
  if (!(v3 < v5 && v5 < v7)) fail("curve samples must rise through the segment");
  if (cueAt(0)!.param![0] !== 0 || cueAt(10)!.param![0] !== 1000) fail("curve endpoints exact");
  // Ease-in-out: slower at the edges than linear.
  if (!(v3 < 300 && v7 > 700)) fail(`ease shape wrong: v3=${v3} v7=${v7}`);

  // Elision: lane 1's duplicate 500 at t=5 must not emit.
  if (cueAt(5)!.param![1] != null) fail("duplicate hold value should be elided");
  if (cueAt(12)?.param?.[1] !== 100) fail("lane 1 hold at 12s missing");

  // No-room curve: exactly the two endpoint cues.
  if (cueAt(3)!.param![2] !== 0 || cueAt(4)!.param![2] !== 800) fail("1s segment endpoints");

  // Merge: t=0 carries lane 0 AND lane 1 sparse.
  const zero = cueAt(0)!;
  if (zero.param![0] !== 0 || zero.param![1] !== 500 || zero.param![2] != null) {
    fail("sparse merge at t=0 wrong");
  }

  // Message: present at 2, blank dropped.
  if (cueAt(2)?.message !== "hello") fail("message cue missing");
  if (baked.perf.timeline.some((c) => c.message === "")) fail("blank message not dropped");

  // laneValues: staircase readback.
  if (baked.laneValues[0][7] !== v7) fail("laneValues must mirror the staircase");
  if (baked.laneValues[1][11] !== 500) fail("hold persists between cues");
  if (baked.laneValues[3][0] !== null) fail("untouched lane stays null");
  if (baked.duration !== 20) fail(`duration should honour length, got ${baked.duration}`);
  if (baked.overBudget) fail("small show flagged over budget");

  console.log("director smoke OK", {
    part: "bake",
    cues: baked.cueCount,
    poolBytes: baked.poolBytes,
  });

  // -- continuous sampling (smooth playback) agrees with the staircase --
  // At whole seconds inside a curve the continuous value IS the baked cue;
  // between them it moves smoothly; hold segments keep their value and jump
  // exactly at the next keyframe, device-style.
  for (const s2 of [0, 3, 5, 7, 10]) {
    const cont = continuousLaneValue(show.lanes[0], s2);
    if (cont !== baked.laneValues[0][s2]) {
      fail(`continuous(${s2}) ${cont} != staircase ${baked.laneValues[0][s2]}`);
    }
  }
  const mid = continuousLaneValue(show.lanes[0], 4.5)!;
  const lo = baked.laneValues[0][4]!;
  const hi = baked.laneValues[0][5]!;
  if (!(mid > lo && mid < hi)) fail(`continuous(4.5)=${mid} not between ${lo}..${hi}`);
  if (continuousLaneValue(show.lanes[1], 11.9) !== 500) fail("hold must keep its value to the end");
  if (continuousLaneValue(show.lanes[1], 12) !== 100) fail("hold must jump exactly at the next keyframe");
  if (continuousLaneValue(show.lanes[3], 5) !== null) fail("empty lane stays null");
  console.log("director smoke OK", { part: "continuous" });

  // ── full rail round trip ──
  const json = JSON.stringify(serializePerformance(baked.perf));
  const validated = validatePerformance(json);
  if (!validated.ok) fail(`rail validation refused the baked show: ${validated.error}`);
  const bytes = encodePfst(validated.perf);
  const decoded = decodePfst(bytes);
  const reimported = showFromPerformance(decoded);
  const rebaked = bakeShow(reimported);
  const a = JSON.stringify(baked.perf.timeline);
  const b = JSON.stringify(rebaked.perf.timeline);
  if (a !== b) fail("pfs → import → re-bake changed the staircase");
  if (decoded.loop !== true) fail("loop flag lost through the table");
  console.log("director smoke OK", { part: "rail-roundtrip", pfsBytes: bytes.length });

  // ── budget flag ──
  const big = emptyShow();
  big.length = 400;
  big.lanes[0] = [key(0, 0, "curve"), key(300, 1000)];
  if (!bakeShow(big).overBudget) fail("301 cues must flag over budget");

  // ── project persistence ──
  const layer = codeLayerFromSource(livePresets[0].code, "Code 1").layer;
  const project = {
    matrix: { width: 128, height: 64 },
    layers: [layer],
    activeLayerId: layer.id,
    knobs: [0.5, 0.5, 0.5, 0.5],
    ranges: [[0, 1], [0, 1], [0, 1], [0, 1]] as [number, number][],
    knobLabels: ["A", "B", "C", "D"],
    forkOf: null,
    editOf: null,
    gen: { count: 5, thinking: "LOW" as const, refs: 6, colorMode: "vfield" as const },
    director: show,
    name: "Smoke Piece",
  };
  const projectJson = serializeProject(project);
  if (!projectJson) fail("project with a show failed to serialize");
  const restored = deserializeProject(projectJson);
  if (!restored) fail("project with a show failed to restore");
  const restoredBake = bakeShow(restored.director);
  if (JSON.stringify(restoredBake.perf.timeline) !== a) fail("show changed through persistence");
  if (restored.director.title !== "Smoke Show") fail("show title lost");

  // Old project JSON (no director field) restores with an empty show.
  const legacy = JSON.parse(projectJson) as Record<string, unknown>;
  delete legacy.director;
  const legacyRestored = deserializeProject(JSON.stringify(legacy));
  if (!legacyRestored) fail("legacy project refused");
  if (legacyRestored.director.lanes.some((lane) => lane.length > 0)) {
    fail("legacy project should get an empty show");
  }
  console.log("director smoke OK", { part: "persistence" });
}

// ── PFST v2: sparse eased cues track the curve, and the file round-trips ──
{
  const show = emptyShow();
  show.length = 20;
  show.title = "V2 Smoke";
  show.lanes[0] = [key(0, 0, "curve"), key(10, 1000)];
  show.lanes[1] = [key(0, 500), key(5, 500), key(12, 100)]; // holds jump
  show.messages = [{ id: directorId(), t: 2, text: "hello" }];

  const v2 = bakeShowV2(show);
  if (v2.perf.version !== 2) fail("v2 bake must mark version 2");
  if (v2.overBudget) fail("small v2 show flagged over budget");

  // Executable spec of the proposed player: last cue that set the channel;
  // if it eases and the channel has a next cue, lerp toward it.
  const playerValueAt = (ch: number, t: number): number | null => {
    let prev: { t: number; v: number; ease: boolean } | null = null;
    let next: { t: number; v: number } | null = null;
    for (const cue of v2.perf.timeline) {
      const v = cue.param?.[ch];
      if (v == null) continue;
      if (cue.t <= t) prev = { t: cue.t, v, ease: cue.ease === true };
      else if (!next) next = { t: cue.t, v };
    }
    if (!prev) return null;
    if (!prev.ease || !next || next.t <= prev.t) return prev.v;
    return prev.v + ((next.v - prev.v) * (t - prev.t)) / (next.t - prev.t);
  };

  // The lerped v2 playback must track the authoring curve tightly...
  let worst = 0;
  for (let t = 0; t <= 10; t += 0.05) {
    const want = continuousLaneValue(show.lanes[0], t)!;
    const got = playerValueAt(0, t)!;
    worst = Math.max(worst, Math.abs(got - want));
  }
  if (worst > 10) fail(`v2 player deviates ${worst.toFixed(1)} wire units from the curve`);

  // ...and on LONG segments — where the 1 Hz staircase burns the budget —
  // the eased pieces stay a fraction of the dense cues (a 60 s curve is 61
  // v1 cues however gentle it is; flattening only pays for curvature).
  const long = emptyShow();
  long.length = 60;
  long.lanes[0] = [key(0, 0, "curve"), key(60, 1000)];
  const longV1 = bakeShow(long).cueCount;
  const longV2 = bakeShowV2(long).perf.timeline.filter((c) => c.param).length;
  if (longV2 * 2 >= longV1) {
    fail(`long v2 should cost well under half of v1: ${longV2} vs ${longV1}`);
  }
  const v1 = bakeShow(show);
  const v2ParamCues = v2.perf.timeline.filter((c) => c.param).length;

  // Holds keep v1 semantics: flat until the next keyframe, then jump.
  if (playerValueAt(1, 11.9) !== 500) fail("v2 hold must keep its value");
  if (playerValueAt(1, 12) !== 100) fail("v2 hold must jump at its keyframe");

  // Bytes: version 2, decisecond header, full round trip including ease.
  const bytes = encodePfst(v2.perf);
  if (bytes[4] !== 2) fail("encoded version byte must be 2");
  const decoded = decodePfst(bytes);
  if (decoded.version !== 2) fail("decoded version lost");
  if (JSON.stringify(decoded.timeline) !== JSON.stringify(v2.perf.timeline)) {
    fail("v2 timeline changed through encode/decode");
  }
  const validated = validatePerformance(JSON.stringify(serializePerformance(v2.perf)));
  if (!validated.ok) fail(`v2 JSON refused by the rail: ${validated.error}`);
  if (validated.perf.version !== 2) fail("rail normalization dropped version 2");

  console.log("director smoke OK", {
    part: "v2",
    worstError: Number(worst.toFixed(1)),
    v2ParamCues,
    v1Cues: v1.cueCount,
    long: { v1: longV1, v2: longV2 },
    pfsBytes: bytes.length,
  });
}

// ── v2 native authoring: fractional keyframes + import round trip ────────────
// The editor places keyframes on the 0.1 s wire grid (snap is only an aid),
// so cues must survive off the whole-second grid, and a v2 file must import
// as linear curve segments that re-bake into the IDENTICAL timeline (linear
// pieces flatten with zero error, so the round trip is exact).
{
  const show = emptyShow();
  show.length = 12;
  show.title = "Fractional";
  show.lanes[0] = [key(0.3, 100, "curve"), key(4.7, 900)];
  show.lanes[1] = [key(1.3, 250), key(2.5, 750)];
  show.messages = [{ id: directorId(), t: 6.4, text: "frac" }];

  const v2 = bakeShowV2(show);
  for (const cue of v2.perf.timeline) {
    if (Math.abs(cue.t * 10 - Math.round(cue.t * 10)) > 1e-9) {
      fail(`cue off the decisecond grid: ${cue.t}`);
    }
  }
  const first = v2.perf.timeline.find((c) => c.param?.[0] != null);
  if (!first || first.t !== 0.3 || first.param![0] !== 100) fail("fractional start keyframe moved");
  const holdCue = v2.perf.timeline.find((c) => c.param?.[1] === 750);
  if (!holdCue || holdCue.t !== 2.5) fail("fractional hold keyframe moved");
  const msg = v2.perf.timeline.find((c) => c.message === "frac");
  if (!msg || msg.t !== 6.4) fail("fractional message moved");

  const decoded = decodePfst(encodePfst(v2.perf));
  const reimported = showFromPerformance(decoded);
  const easedKey = reimported.lanes[0].find((k) => k.t === 0.3);
  if (!easedKey || easedKey.mode !== "curve") fail("EASE cue must import as a curve keyframe");
  const jumpKey = reimported.lanes[1].find((k) => k.t === 1.3);
  if (!jumpKey || jumpKey.mode !== "hold") fail("plain cue must import as a hold keyframe");
  const rebaked = bakeShowV2(reimported);
  if (JSON.stringify(rebaked.perf.timeline) !== JSON.stringify(v2.perf.timeline)) {
    fail("v2 import → re-bake changed the timeline");
  }
  console.log("director smoke OK", { part: "v2-fractional", cues: v2.perf.timeline.length });

  // ── opening pattern cue ──
  // The lab stamps its pattern name on the show so the device switches to it
  // at t=0. No t=0 cue in the show → a dedicated pattern-only cue opens it...
  const opened = bakeShowV2(show, { openingPattern: "My Glitch" });
  const openCue = opened.perf.timeline[0];
  if (openCue.t !== 0 || openCue.pattern !== "My Glitch") fail("opening pattern cue missing");
  const openedRt = decodePfst(encodePfst(opened.perf));
  if (openedRt.timeline[0].pattern !== "My Glitch") fail("opening pattern lost in the file");
  // ...and an existing plain t=0 cue carries the name instead of duplicating.
  const withZero = emptyShow();
  withZero.length = 5;
  withZero.lanes[0] = [key(0, 10), key(2, 900)];
  const ridden = bakeShowV2(withZero, { openingPattern: "Rider" });
  const zeroCues = ridden.perf.timeline.filter((c) => c.t === 0);
  if (zeroCues.length !== 1) fail("opening pattern must not duplicate the t=0 cue");
  if (zeroCues[0].pattern !== "Rider" || zeroCues[0].param?.[0] !== 10) {
    fail("opening pattern must ride the existing t=0 cue");
  }
  console.log("director smoke OK", { part: "opening-pattern" });

  // -- pattern cues the lab does not author must survive a round trip --
  // A show from another editor can walk a palette of patterns. The lab has
  // no UI for that, but opening such a show here and exporting it again
  // used to delete every switch silently.
  const palette = emptyShow();
  palette.length = 30;
  palette.lanes[0] = [key(0, 200), key(1, 900)];
  const carried = bakeShowV2(palette, { openingPattern: "Lab Piece" });
  carried.perf.timeline.push({ t: 1, pattern: "Second" });
  carried.perf.timeline.push({ t: 2, pattern: "Third" });
  carried.perf.timeline.sort((a, b) => a.t - b.t);
  const reopened = showFromPerformance(decodePfst(encodePfst(carried.perf)));
  const out = bakeShowV2(reopened, { openingPattern: "Lab Piece" });
  const names = out.perf.timeline.filter((c) => c.pattern).map((c) => c.pattern);
  if (!names.includes("Second") || !names.includes("Third")) {
    fail(`pattern switches lost on a lab round trip: ${JSON.stringify(names)}`);
  }
  // The lab's own name must not overwrite an imported show's opener.
  const opener = out.perf.timeline.find((c) => c.t === 0 && c.pattern);
  if (opener?.pattern !== "Lab Piece") {
    fail(`imported opener wrong: ${JSON.stringify(opener)}`);
  }
  console.log("director smoke OK", { part: "pattern-cue-passthrough", names });
}

// ── auto handles: smooth by default, clamped like Blender ────────────────────
// New keys are curve+auto: resolveLane derives the bezier from the neighbors.
// Two keys ease in and out; monotone runs stay inside the band between their
// keyframes; a local extreme gets a flat tangent so the peak IS the keyframe.
// Manual keys (and every pre-handle show, where h is absent) pass through
// with their stored cp untouched.
{
  const autoKey = (t: number, v: number): DirectorKeyframe => ({
    id: directorId(),
    t,
    v,
    mode: "curve",
    h: "auto",
    cp: [...DEFAULT_CURVE_CP],
  });

  // Two auto keys: symmetric ease-in-out.
  const ramp = [autoKey(0, 0), autoKey(10, 1000)];
  const at = (lane: DirectorKeyframe[], t: number) => continuousLaneValue(lane, t)!;
  const mid = at(ramp, 5);
  if (Math.abs(mid - 500) > 1) fail(`auto 2-key ramp must be symmetric: v(5)=${mid}`);
  if (!(at(ramp, 3) < 300 && at(ramp, 7) > 700)) fail("auto 2-key ramp must ease at both ends");

  // Monotone run: passes through the middle key, never leaves [0, 1000],
  // never decreases.
  const run = [autoKey(0, 0), autoKey(4, 800), autoKey(10, 1000)];
  if (at(run, 4) !== 800) fail("auto curve must pass exactly through its keyframes");
  let prev = -1;
  for (let t = 0; t <= 10; t += 0.05) {
    const v = at(run, t);
    if (v < 0 || v > 1000) fail(`auto monotone run overshot at ${t}: ${v}`);
    if (v < prev - 1e-6) fail(`auto monotone run must not decrease: v(${t})=${v} < ${prev}`);
    prev = v;
  }

  // Local extreme: flat tangent — the peak is the keyframe, nothing above it.
  const peak = [autoKey(0, 0), autoKey(5, 1000), autoKey(10, 0)];
  for (let t = 0; t <= 10; t += 0.05) {
    const v = at(peak, t);
    if (v > 1000 || v < 0) fail(`auto extreme overshot at ${t}: ${v}`);
  }
  if (at(peak, 5) !== 1000) fail("peak keyframe value must be exact");
  if (!(at(peak, 4.5) < 1000 && at(peak, 5.5) < 1000)) fail("peak must be a single point");

  // Manual and legacy (absent h) keys keep their stored cp.
  const manual: DirectorKeyframe = {
    id: directorId(),
    t: 0,
    v: 0,
    mode: "curve",
    h: "manual",
    cp: [0.9, 0.1, 0.95, 0.2],
  };
  const legacy = key(2, 500, "curve"); // no h — pre-handle show
  const mixed = resolveLane([manual, legacy, autoKey(4, 1000)]);
  if (mixed[0].cp[0] !== 0.9) fail("manual cp must survive resolveLane");
  if (mixed[1].cp[0] !== DEFAULT_CURVE_CP[0]) fail("legacy (absent h) cp must survive resolveLane");

  // Auto keys ride the whole rail: bake → encode → decode → import → re-bake
  // lands on the identical timeline (imports are linear pieces, which
  // re-flatten with zero error).
  const show = emptyShow();
  show.length = 15;
  show.title = "Auto Smoke";
  show.lanes[0] = [autoKey(0, 0), autoKey(4, 800), autoKey(12, 100)];
  const v2 = bakeShowV2(show);
  const reimported = showFromPerformance(decodePfst(encodePfst(v2.perf)));
  const rebaked = bakeShowV2(reimported);
  if (JSON.stringify(rebaked.perf.timeline) !== JSON.stringify(v2.perf.timeline)) {
    fail("auto-handle show changed through the pfs round trip");
  }
  console.log("director smoke OK", { part: "auto-handles", cues: v2.perf.timeline.length });
}

// ── sampler + MIDI export ────────────────────────────────────────────────────
// The sampler is the canonical "values OUT of a show" form — the capture
// show render and the MIDI export both draw from it. Wire values must match
// continuous playback, NaN marks the span before a lane's first cue, and
// the .mid must be a well-formed SMF whose CC ramps cover the value range.
{
  const show = emptyShow();
  show.length = 4;
  show.title = "Midi Smoke";
  show.lanes[0] = [key(0, 0, "curve"), key(4, 1000)]; // eased ramp
  show.lanes[1] = [key(1, 500)]; // hold; silent before 1 s

  const sampled = sampleShow(show, 100);
  if (sampled.duration !== 4) fail(`sampled duration ${sampled.duration}`);
  if (sampled.frames !== 401) fail(`default sampling must include the end: ${sampled.frames}`);
  if (sampled.wire[0][0] !== 0 || sampled.wire[0][400] !== 1000) fail("ramp endpoints wrong");
  const midSample = sampled.wire[0][200];
  const want = continuousLaneValue(show.lanes[0], 2)!;
  if (Math.abs(midSample - want) > 0.001) fail(`sampler must match playback: ${midSample} vs ${want}`);
  if (!Number.isNaN(sampled.wire[1][0])) fail("before the first cue must sample NaN");
  if (sampled.wire[1][100] !== 500) fail("hold value wrong after its cue");
  if (!Number.isNaN(sampled.wire[3][0])) fail("empty lane must sample NaN");

  const knobs = toKnobFrames(sampled, [[0, 2], [0, 2], [0, 1], [0, 1]], [9, 9, 9, 9]);
  if (knobs[0 * 4 + 1] !== 9) fail("NaN must resolve to the live fallback");
  if (knobs[100 * 4 + 1] !== 1) fail("wire 500 on [0,2] must be 1");
  if (knobs[400 * 4 + 0] !== 2) fail("wire 1000 on [0,2] must be 2");

  const midi = showToMidi(show, { labels: ["A", "B", "C", "D"] });
  const ascii = (at: number, text: string) =>
    [...text].every((ch, i) => midi[at + i] === ch.charCodeAt(0));
  if (!ascii(0, "MThd")) fail("missing MThd");
  if (midi[9] !== 0 || midi[11] !== 1) fail("must be format 0, one track");
  if (midi[12] !== 480 >> 8 || midi[13] !== (480 & 0xff)) fail("division must be 480");
  if (!ascii(14, "MTrk")) fail("missing MTrk");

  // Walk the track (all events carry full status bytes).
  let at = 22;
  let tick = 0;
  const ccs: Array<{ tick: number; cc: number; value: number }> = [];
  let ended = false;
  while (at < midi.length) {
    let delta = 0;
    for (;;) {
      const b = midi[at++];
      delta = (delta << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    tick += delta;
    const status = midi[at++];
    if (status === 0xff) {
      const type = midi[at++];
      let len = 0;
      for (;;) {
        const b = midi[at++];
        len = (len << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      at += len;
      if (type === 0x2f) {
        ended = true;
        break;
      }
    } else if ((status & 0xf0) === 0xb0) {
      ccs.push({ tick, cc: midi[at], value: midi[at + 1] });
      at += 2;
    } else {
      fail(`unexpected status 0x${status.toString(16)} at ${at - 1}`);
    }
  }
  if (!ended) fail("track must end with end-of-track");
  if (tick !== 4 * 960) fail(`end-of-track must land on the duration: ${tick}`);

  const lane0 = ccs.filter((c) => c.cc === MIDI_LANE_CCS[0]);
  if (lane0[0]?.value !== 0 || lane0[lane0.length - 1]?.value !== 127) {
    fail("CC ramp must cover 0..127");
  }
  if (lane0.length < 100) fail(`smooth ramp should emit densely, got ${lane0.length}`);
  for (let i = 1; i < lane0.length; i++) {
    if (lane0[i].value < lane0[i - 1].value) fail("monotone ramp must emit monotone CCs");
    if (lane0[i].tick <= lane0[i - 1].tick) fail("CC ticks must increase");
  }
  const lane1 = ccs.filter((c) => c.cc === MIDI_LANE_CCS[1]);
  if (lane1.length !== 1) fail(`a single hold must emit one CC, got ${lane1.length}`);
  if (lane1[0].value !== 64 || lane1[0].tick !== 960) fail("hold CC must be 64 at 1 s");
  if (ccs.some((c) => c.cc === MIDI_LANE_CCS[3])) fail("empty lane must emit nothing");

  console.log("director smoke OK", {
    part: "sampler+midi",
    bytes: midi.length,
    rampEvents: lane0.length,
  });
}
