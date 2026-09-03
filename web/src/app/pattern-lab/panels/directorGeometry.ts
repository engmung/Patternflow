// ── Director timeline geometry ───────────────────────────────────────────────
// Wire value (0..BUS_WIRE_MAX) ⇄ lane pixel, and the readout formatter. Shared
// by the timeline and its lanes.

import { BUS_WIRE_MAX } from "@/lib/pattern/controls";

export function wireToY(v: number, height: number, pad: number): number {
  return height - pad - (Math.max(0, Math.min(BUS_WIRE_MAX, v)) / BUS_WIRE_MAX) * (height - pad * 2);
}

export function yToWire(y: number, height: number, pad: number): number {
  const t = (height - pad - y) / (height - pad * 2);
  return Math.round(Math.max(0, Math.min(1, t)) * BUS_WIRE_MAX);
}

/** The knob's real value for a wire value, for the readouts. */
export function wireToReal(v: number, range: [number, number]): number {
  return range[0] + (v / BUS_WIRE_MAX) * (range[1] - range[0]);
}

export function fmtReal(v: number): string {
  const a = Math.abs(v);
  return v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2);
}
