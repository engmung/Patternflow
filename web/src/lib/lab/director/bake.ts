// ── Director bake: keyframes + curves → the device's cue staircase ───────────
// ONE function turns the authoring model into the timed cue list, and
// everything downstream — lab playback, the .pfs export, the publish rail —
// consumes its output. That is the honesty contract learned on the Capture
// panel: the preview must BE the picture. Here the preview must BE the show:
// what the lab plays while you scrub is byte-for-byte what encodePfst writes
// and what the panel replays.
//
// Curve segments sample their cubic-bezier at every whole second between the
// two keyframes; consecutive equal values are elided (a repeated absolute
// write is a no-op on the device, and cues are a 256-row budget).

import {
  PFST_MAX_CUES,
  PFST_MAX_POOL,
  clamp1000,
  type Performance,
  type PerformanceCue,
  type SparseParam,
} from "@/lib/community/performance";
import {
  DIRECTOR_MAX_SECONDS,
  type DirectorKeyframe,
  type DirectorShow,
  DEFAULT_CURVE_CP,
  directorId,
} from "./types";

/**
 * y for a given x on cubic-bezier((0,0), (x1,y1), (x2,y2), (1,1)) — CSS
 * easing semantics. Newton first, bisection when the derivative flattens.
 */
export function cubicBezierY(
  cp: readonly [number, number, number, number],
  x: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = cp;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const derivX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = sampleX(t) - x;
    if (Math.abs(err) < 1e-6) return sampleY(t);
    const d = derivX(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  let lo = 0;
  let hi = 1;
  while (hi - lo > 1e-6) {
    t = (lo + hi) / 2;
    if (sampleX(t) < x) lo = t;
    else hi = t;
  }
  return sampleY(t);
}

function sortedLane(lane: DirectorKeyframe[]): DirectorKeyframe[] {
  return [...lane].sort((a, b) => a.t - b.t);
}

/** One lane's cue values by second: keyframes plus curve samples, dupes elided. */
export function bakeLane(lane: DirectorKeyframe[]): Map<number, number> {
  const keys = sortedLane(lane);
  const raw = new Map<number, number>();
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const t0 = Math.max(0, Math.min(DIRECTOR_MAX_SECONDS, Math.round(k.t)));
    raw.set(t0, clamp1000(k.v));
    const next = keys[i + 1];
    if (!next || k.mode !== "curve") continue;
    const t1 = Math.max(0, Math.min(DIRECTOR_MAX_SECONDS, Math.round(next.t)));
    if (t1 - t0 < 2) continue;
    for (let s = t0 + 1; s < t1; s++) {
      const u = (s - t0) / (t1 - t0);
      const y = cubicBezierY(k.cp, u);
      raw.set(s, clamp1000(k.v + (next.v - k.v) * y));
    }
  }
  const out = new Map<number, number>();
  let previous: number | null = null;
  for (const t of [...raw.keys()].sort((a, b) => a - b)) {
    const v = raw.get(t)!;
    if (v === previous) continue;
    out.set(t, v);
    previous = v;
  }
  return out;
}

export type BakedShow = {
  perf: Performance;
  cueCount: number;
  /** Approximate string-pool bytes (messages; the real check is encodePfst). */
  poolBytes: number;
  overBudget: boolean;
  /**
   * value-by-second per lane, index 0..duration — what the device shows at
   * second s. null before a lane's first cue (the knob keeps its live value).
   */
  laneValues: (number | null)[][];
  duration: number;
};

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31);
  return slug || "lab-show";
}

export function bakeShow(show: DirectorShow): BakedShow {
  const laneCues = show.lanes.map(bakeLane);

  const byT = new Map<number, { param: SparseParam; message?: string }>();
  const entry = (t: number) => {
    let e = byT.get(t);
    if (!e) {
      e = { param: [null, null, null, null] };
      byT.set(t, e);
    }
    return e;
  };
  laneCues.forEach((cues, lane) => {
    for (const [t, v] of cues) entry(t).param[lane] = v;
  });
  for (const m of show.messages) {
    const text = m.text.trim();
    if (!text) continue;
    entry(Math.max(0, Math.min(DIRECTOR_MAX_SECONDS, Math.round(m.t)))).message = text;
  }

  const timeline: PerformanceCue[] = [...byT.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, e]) => {
      const cue: PerformanceCue = { t };
      if (e.param.some((v) => v != null)) cue.param = e.param;
      if (e.message != null) cue.message = e.message;
      return cue;
    });

  let lastCue = 0;
  for (const cue of timeline) if (cue.t > lastCue) lastCue = cue.t;
  const length = Math.max(1, Math.min(DIRECTOR_MAX_SECONDS, Math.round(show.length)));
  const duration = Math.max(length, lastCue);

  const perf: Performance = {
    version: 1,
    id: slugify(show.title),
    title: show.title.trim() || "Untitled",
    utcStart: "",
    channel: 0,
    length: duration,
    loop: show.loop,
    patternsZip: "",
    patternsZipSha256: "",
    required: [],
    timeline,
  };

  const uniqueMessages = new Set<string>();
  for (const cue of timeline) if (cue.message) uniqueMessages.add(cue.message);
  let poolBytes = 0;
  for (const text of uniqueMessages) poolBytes += new TextEncoder().encode(text).length + 1;

  const laneValues = laneCues.map((cues) => {
    const values: (number | null)[] = new Array(duration + 1).fill(null);
    let current: number | null = null;
    const sorted = [...cues.entries()].sort((a, b) => a[0] - b[0]);
    let next = 0;
    for (let s = 0; s <= duration; s++) {
      while (next < sorted.length && sorted[next][0] <= s) current = sorted[next++][1];
      values[s] = current;
    }
    return values;
  });

  return {
    perf,
    cueCount: timeline.length,
    poolBytes,
    overBudget: timeline.length > PFST_MAX_CUES || poolBytes > PFST_MAX_POOL,
    laneValues,
    duration,
  };
}

/**
 * Import: a decoded performance becomes editable keyframes. Curves cannot be
 * recovered from a staircase — every cue lands as a hold keyframe, which is
 * exactly what the file says.
 */
export function showFromPerformance(perf: Performance): DirectorShow {
  const lanes: DirectorShow["lanes"] = [[], [], [], []];
  const messages: DirectorShow["messages"] = [];
  for (const cue of perf.timeline) {
    if (cue.param) {
      for (let i = 0; i < 4; i++) {
        const v = cue.param[i];
        if (v == null) continue;
        lanes[i].push({
          id: directorId(),
          t: cue.t,
          v: clamp1000(v),
          mode: "hold",
          cp: [...DEFAULT_CURVE_CP],
        });
      }
    }
    if (cue.message) messages.push({ id: directorId(), t: cue.t, text: cue.message });
  }
  let lastCue = 0;
  for (const cue of perf.timeline) if (cue.t > lastCue) lastCue = cue.t;
  return {
    title: perf.title === "Untitled" ? "" : perf.title,
    length: Math.max(1, Math.min(DIRECTOR_MAX_SECONDS, Math.max(perf.length, lastCue))),
    loop: perf.loop,
    lanes,
    messages,
  };
}

/**
 * The lane's value at a CONTINUOUS time — the authoring curve itself, not
 * its 1 Hz quantization. This is what smooth playback samples per frame:
 * hold segments keep their value and jump exactly at the next keyframe
 * (device semantics), curve segments follow their bezier between the same
 * endpoints the bake quantizes. At whole seconds inside a curve it agrees
 * with the staircase by construction; the file stays 1 Hz — smoothness is
 * a player capability, and the lab's player has it.
 */
export function continuousLaneValue(
  lane: DirectorKeyframe[],
  t: number,
): number | null {
  if (lane.length === 0) return null;
  const keys = [...lane].sort((a, b) => a.t - b.t);
  if (t < keys[0].t) return null;
  for (let i = keys.length - 1; i >= 0; i--) {
    const a = keys[i];
    if (t < a.t) continue;
    const b = keys[i + 1];
    if (!b || a.mode !== "curve" || b.t <= a.t) return clamp1000(a.v);
    const u = Math.min(1, (t - a.t) / (b.t - a.t));
    return clamp1000(a.v + (b.v - a.v) * cubicBezierY(a.cp, u));
  }
  return null;
}

// ── PFST v2 bake: sparse eased cues instead of a dense staircase ─────────────
// v2 tables (deciseconds + per-cue EASE) let a curve ship as a handful of
// linear pieces the player lerps between, instead of one cue per second.
// Flattening is adaptive: a piece splits until the chord tracks the bezier
// within EASE_MAX_ERROR wire units, floored at the 0.1 s grid. Holds stay
// plain cues that jump, exactly like v1.

const EASE_MAX_ERROR = 8; // 0.8% of the wire range — under a physical detent
const V2_GRID = 0.1;

type V2Point = { t: number; v: number; ease: boolean };

function snapV2(t: number): number {
  // n/10, not n*0.1 — the decoder computes raw/10 and the two float paths
  // must land on identical bits or round trips fail on JSON equality.
  return Math.round(t * 10) / 10;
}

function flattenCurve(
  a: DirectorKeyframe,
  b: DirectorKeyframe,
  out: V2Point[],
): void {
  const span = b.t - a.t;
  const dv = b.v - a.v;
  const at = (t: number) =>
    clamp1000(a.v + dv * cubicBezierY(a.cp, Math.min(1, Math.max(0, (t - a.t) / span))));
  const subdivide = (t0: number, v0: number, t1: number, v1: number) => {
    if (t1 - t0 > V2_GRID * 2) {
      let worst = 0;
      for (const q of [0.25, 0.5, 0.75]) {
        const t = t0 + (t1 - t0) * q;
        worst = Math.max(worst, Math.abs(at(t) - (v0 + (v1 - v0) * q)));
      }
      if (worst > EASE_MAX_ERROR) {
        const mid = snapV2((t0 + t1) / 2);
        if (mid > t0 && mid < t1) {
          const vm = at(mid);
          subdivide(t0, v0, mid, vm);
          subdivide(mid, vm, t1, v1);
          return;
        }
      }
    }
    out.push({ t: t0, v: v0, ease: true });
  };
  subdivide(a.t, clamp1000(a.v), b.t, clamp1000(b.v));
}

/** One lane as v2 points: keyframes plus eased flattening of curve segments. */
export function bakeLaneV2(lane: DirectorKeyframe[]): V2Point[] {
  const keys = [...lane].sort((a, b) => a.t - b.t);
  const out: V2Point[] = [];
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i];
    const next = keys[i + 1];
    const curved = next && a.mode === "curve" && next.t > a.t && next.v !== a.v;
    if (curved) {
      flattenCurve(a, next!, out);
    } else {
      out.push({ t: snapV2(Math.max(0, a.t)), v: clamp1000(a.v), ease: false });
    }
  }
  // Drop exact duplicates (same tick, same value) that flattening can leave
  // where a keyframe coincides with a piece boundary.
  const seen = new Map<number, V2Point>();
  for (const p of out) {
    const key = Math.round(p.t * 10);
    const existing = seen.get(key);
    if (!existing || existing.v !== p.v || existing.ease !== p.ease) seen.set(key, p);
  }
  return [...seen.values()].sort((a, b) => a.t - b.t);
}

export type BakedShowV2 = {
  perf: Performance;
  cueCount: number;
  overBudget: boolean;
};

export function bakeShowV2(show: DirectorShow): BakedShowV2 {
  // Ease is per cue, so points that ease and points that hold at the same
  // tick must stay separate cues (the player fires both).
  const byKey = new Map<string, { t: number; param: SparseParam; ease: boolean }>();
  const entry = (t: number, ease: boolean) => {
    const key = `${Math.round(t * 10)}:${ease ? 1 : 0}`;
    let e = byKey.get(key);
    if (!e) {
      e = { t: snapV2(t), param: [null, null, null, null], ease };
      byKey.set(key, e);
    }
    return e;
  };
  show.lanes.forEach((lane, index) => {
    for (const point of bakeLaneV2(lane)) entry(point.t, point.ease).param[index] = point.v;
  });

  const messages = new Map<number, string>();
  for (const m of show.messages) {
    const text = m.text.trim();
    if (!text) continue;
    messages.set(Math.round(snapV2(Math.max(0, m.t)) * 10), text);
  }

  const timeline: PerformanceCue[] = [...byKey.values()]
    .sort((a, b) => a.t - b.t)
    .map((e) => {
      const cue: PerformanceCue = { t: e.t, param: e.param };
      if (e.ease) cue.ease = true;
      const message = messages.get(Math.round(e.t * 10));
      if (message != null && !e.ease) {
        cue.message = message;
        messages.delete(Math.round(e.t * 10));
      }
      return cue;
    });
  for (const [key, text] of messages) {
    timeline.push({ t: key / 10, message: text });
  }
  timeline.sort((a, b) => a.t - b.t);

  let lastCue = 0;
  for (const cue of timeline) if (cue.t > lastCue) lastCue = cue.t;
  const length = Math.max(0.1, Math.min(DIRECTOR_MAX_SECONDS, Math.round(show.length * 10) / 10));

  const perf: Performance = {
    version: 2,
    id: show.title
      ? show.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 31) ||
        "lab-show"
      : "lab-show",
    title: show.title.trim() || "Untitled",
    utcStart: "",
    channel: 0,
    length: Math.max(length, lastCue),
    loop: show.loop,
    patternsZip: "",
    patternsZipSha256: "",
    required: [],
    timeline,
  };

  return {
    perf,
    cueCount: timeline.length,
    overBudget: timeline.length > PFST_MAX_CUES,
  };
}
