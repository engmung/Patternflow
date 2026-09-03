// ── Lab store slice: the one shared knob set: values and ranges ──
// One of the slices store.ts composes. Bodies are unchanged from the single
// 800-line store they came out of; only the file boundary is new.

import type { KnobRange } from "../types";
import type { LabStore } from "../store";
import type { SliceSet } from "./kinds";
import { MIN_RANGE_SPAN } from "./shared";

export type KnobsSlice = Pick<LabStore, "setKnob" | "setRange">;

export function createKnobsSlice(set: SliceSet): KnobsSlice {
  return {
    setKnob: (index, value) =>
      set((state) => ({
        knobs: state.knobs.map((knob, knobIndex) => (knobIndex === index ? value : knob)),
      })),

    setRange: (index, edge, value) => {
      if (!Number.isFinite(value)) return;
      set((state) => {
        const range = state.ranges[index] ?? [0, 1];
        const next: KnobRange = [...range];
        if (edge === "min") {
          next[0] = value;
          if (next[1] <= next[0]) next[1] = next[0] + MIN_RANGE_SPAN;
        } else {
          next[1] = value;
          if (next[0] >= next[1]) next[0] = next[1] - MIN_RANGE_SPAN;
        }
        // Keep the knob at the same normalized position within the new range.
        const previousSpan = Math.max(MIN_RANGE_SPAN, range[1] - range[0]);
        const normalized = ((state.knobs[index] ?? range[0]) - range[0]) / previousSpan;
        const nextValue = next[0] + Math.max(0, Math.min(1, normalized)) * (next[1] - next[0]);
        return {
          ranges: state.ranges.map((entry, entryIndex) => (entryIndex === index ? next : entry)),
          knobs: state.knobs.map((knob, knobIndex) => (knobIndex === index ? nextValue : knob)),
        };
      });
    },
  };
}
