// ── @knobs annotation (shared by the lab store and panels) ───────────────────
// Patterns declare knob names + ranges with one comment line:
//   // @knobs Folds=3..12, Speed=0.1..10, Zoom=2..17, Contrast=0.1..1
// Loading code with this line renames the layer's knobs and applies the ranges
// ("-" skips a slot). The pattern reads input.knobValues directly, so the user
// can still retune any range afterwards and the pattern follows.

import { LOGICAL_KNOB_DEFAULTS, LOGICAL_KNOB_RANGES } from "@/lib/patternflowControls";
import type { KnobRange } from "./types";

export const KNOBS_ANNOTATION_RE = /^[ \t]*\/\/[ \t]*@knobs[ \t]+(.+)$/m;

export const DEFAULT_KNOB_LABELS = ["Knob 1", "Knob 2", "Knob 3", "Knob 4"];

export type KnobAnnotationEntry = { name: string; min: number; max: number } | null;

export function matchKnobsAnnotation(code: string): string | null {
  return code.match(KNOBS_ANNOTATION_RE)?.[0] ?? null;
}

export function parseKnobsAnnotation(code: string): KnobAnnotationEntry[] | null {
  const match = code.match(KNOBS_ANNOTATION_RE);
  if (!match) return null;
  const result: KnobAnnotationEntry[] = [null, null, null, null];
  match[1]
    .split(",")
    .slice(0, 4)
    .forEach((part, index) => {
      const entry = part.trim();
      if (!entry || entry === "-") return;
      const m = entry.match(/^(.+?)\s*=\s*(-?\d*\.?\d+)\s*\.\.\s*(-?\d*\.?\d+)$/);
      if (!m) return;
      const min = Number(m[2]);
      const max = Number(m[3]);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
      result[index] = { name: m[1].trim().slice(0, 14), min, max };
    });
  return result.some(Boolean) ? result : null;
}

export function defaultKnobState(): { knobs: number[]; ranges: KnobRange[]; labels: string[] } {
  return {
    knobs: [...LOGICAL_KNOB_DEFAULTS],
    ranges: LOGICAL_KNOB_RANGES.map(([min, max]): KnobRange => [min, max]),
    labels: [...DEFAULT_KNOB_LABELS],
  };
}

/** Apply a parsed annotation over existing knob state (clamping values in). */
export function applyKnobEntries(
  entries: KnobAnnotationEntry[],
  current: { knobs: number[]; ranges: KnobRange[]; labels: string[] },
): { knobs: number[]; ranges: KnobRange[]; labels: string[] } {
  return {
    labels: current.labels.map((label, index) => entries[index]?.name ?? label),
    ranges: current.ranges.map((range, index): KnobRange => {
      const entry = entries[index];
      return entry ? [entry.min, entry.max] : range;
    }),
    knobs: current.knobs.map((value, index) => {
      const entry = entries[index];
      if (!entry) return value;
      return Math.max(entry.min, Math.min(entry.max, value));
    }),
  };
}
