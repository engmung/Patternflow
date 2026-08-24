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
