// ── Show sampler: the canonical sampled-automation form ──────────────────────
// One representation for every "get the values OUT of a show" consumer: wire
// values (0..1000) sampled at a fixed rate from the SAME continuous curves
// playback follows (resolveLane + resolvedLaneValue — auto handles, manual
// beziers and hold jumps included). The Capture show render and the MIDI
// export both draw from here, so anything they emit is exactly what the
// panel played. Future emitters — CSV, a live CC/OSC bus — should start
// here too, not from the keyframes.

import { bakeShowV2, resolveLane, resolvedLaneValue } from "./bake";
import type { DirectorShow } from "./types";

export type SampledShow = {
  /** Samples per second. */
  fps: number;
  /** Number of samples per lane; sample i sits at t = i / fps. */
  frames: number;
  /** Show duration in seconds — never shorter than the last cue. */
  duration: number;
  /**
   * Per lane: wire values (0..1000) by frame. NaN before the lane's first
   * cue — there the device leaves the knob at its live value, and an
   * emitter should either substitute a fallback or stay silent.
   */
  wire: [Float32Array, Float32Array, Float32Array, Float32Array];
};

/**
 * Sample a show at `fps`. By default both ends are included — frame 0 at
 * t = 0 and the last frame on the end instant, so a ramp finishes on its
 * target. A video render passes its own frame count (round(seconds·fps),
 * end-exclusive) to match its clock exactly.
 */
export function sampleShow(show: DirectorShow, fps: number, frames?: number): SampledShow {
  const duration = bakeShowV2(show).perf.length;
  const count = Math.max(1, frames ?? Math.round(duration * fps) + 1);
  const wire = show.lanes.map((lane) => {
    const resolved = resolveLane(lane);
    const out = new Float32Array(count);
    for (let f = 0; f < count; f++) {
      const v = resolvedLaneValue(resolved, Math.min(duration, f / fps));
      out[f] = v == null ? NaN : v;
    }
    return out;
  }) as SampledShow["wire"];
  return { fps, frames: count, duration, wire };
}

/**
 * The sampled show as REAL knob values, frames×4 interleaved — what the
 * capture worker feeds the engine per frame. NaN (before a lane's first
 * cue) resolves to `fallback`, the knob's live value at render time, which
 * is exactly what the device would show there.
 */
export function toKnobFrames(
  sampled: SampledShow,
  ranges: Array<[number, number]>,
  fallback: number[],
): Float32Array {
  const out = new Float32Array(sampled.frames * 4);
  for (let lane = 0; lane < 4; lane++) {
    const wire = sampled.wire[lane];
    const range = ranges[lane] ?? [0, 1];
    const live = fallback[lane] ?? range[0];
    for (let f = 0; f < sampled.frames; f++) {
      const v = wire[f];
      out[f * 4 + lane] = Number.isNaN(v) ? live : range[0] + (v / 1000) * (range[1] - range[0]);
    }
  }
  return out;
}
