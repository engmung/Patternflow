"use client";

import {
  LOGICAL_KNOB_RANGES,
} from "@/lib/patternflowControls";

// @knobs annotation support for the community detail page.
// Mirrors Pattern Lab's parser (lib/lab/annotations.ts) — kept standalone on
// purpose so the community surface never reaches into the lab's internals.
// Default values are set to the MIDPOINT of each range ((min + max) / 2).

const KNOBS_ANNOTATION_RE = /^[ \t]*\/\/[ \t]*@knobs[ \t]+(.+)$/m;

export type KnobSetup = {
  labels: string[];
  ranges: Array<[number, number]>;
  values: number[];
};

export const DEFAULT_KNOB_LABELS = ["Knob 1", "Knob 2", "Knob 3", "Knob 4"];

export function knobSetupFromCode(code: string): KnobSetup {
  const labels = [...DEFAULT_KNOB_LABELS];
  const ranges: Array<[number, number]> = LOGICAL_KNOB_RANGES.map(([min, max]) => [min, max]);

  // Set default initial values to the MIDPOINT of each range ((min + max) / 2)
  const values: number[] = ranges.map(([min, max]) => Number(((min + max) / 2).toFixed(3)));

  const match = code.match(KNOBS_ANNOTATION_RE);
  if (match) {
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
        labels[index] = m[1].trim().slice(0, 14);
        ranges[index] = [min, max];
        // Default value is the midpoint of the custom range
        values[index] = Number(((min + max) / 2).toFixed(3));
      });
  }

  return { labels, ranges, values };
}

export function normalizedKnobs(values: number[], ranges: Array<[number, number]>): number[] {
  return values.map((value, index) => {
    const [min, max] = ranges[index] ?? [0, 1];
    const span = Math.max(0.001, max - min);
    return (value - min) / span;
  });
}
