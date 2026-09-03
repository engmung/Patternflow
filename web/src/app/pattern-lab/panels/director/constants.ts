// ── Timeline geometry constants ──────────────────────────────────────────────
// Pixels per second, the row heights, the gutter, and the lane colours.

export const PPS_DEFAULT = 28; // px per second
export const PPS_MIN = 6;
export const PPS_MAX = 220;
export const RULER_H = 20;
export const COMPACT_H = 36;
export const COMPACT_PAD = 4;
export const FOCUS_MIN_H = 140;
export const GUTTER_W = 92; // must match the grid template in DirectorPanel.module.css
export const FOCUS_PAD = 8;
export const MSG_H = 26;
/** Double-click closer than this (px) to the curve inserts ON the curve. */
export const CURVE_MAGNET_PX = 10;

const LANE_COLORS = ["#0ea5e9", "#a855f7", "#f59e0b", "#10b981"];

export const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];

/** Ruler/grid spacing in seconds for a zoom level — ticks stay ≥ ~56 px apart. */
export function tickStep(pps: number): number {
  for (const step of [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) {
    if (step * pps >= 56) return step;
  }
  return 600;
}
