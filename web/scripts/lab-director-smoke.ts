// Smoke test for the Director bake pipeline (lib/lab/director): curves sample
// correctly, lanes merge into sparse cues, budgets flag, the baked show
// survives the full community rail (validate → encodePfst → decodePfst →
// re-import → identical staircase), and the show rides project persistence.
// Run: npx tsx scripts/lab-director-smoke.ts

import { bakeShow, cubicBezierY, showFromPerformance } from "../src/lib/lab/director/bake";
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
} from "../src/lib/community/performance";
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
    gen: { count: 5, thinking: "LOW" as const, refs: 6, colorMode: "vfield" as const },
    director: show,
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
