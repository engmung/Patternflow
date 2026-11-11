// ── @knobs in the lab ────────────────────────────────────────────────────────
// Loading code with a `// @knobs …` line renames the project's knobs and
// applies the ranges ("-" skips a slot). The pattern reads input.knobValues
// directly, so the user can still retune any range afterwards and the
// pattern follows. The line itself — its grammar, parser and printer — is
// lib/pattern/knobs.ts, shared with the community; this file is the lab's
// knob STATE on top of it.

import { LOGICAL_KNOB_DEFAULTS, LOGICAL_KNOB_RANGES } from "@/lib/pattern/controls";
import {
  DEFAULT_KNOB_LABELS,
  KNOBS_ANNOTATION_RE,
  buildKnobsAnnotationLine,
  matchKnobsAnnotation,
  parseKnobsAnnotation,
  stripKnobsAnnotation,
  type KnobAnnotationEntry,
} from "@/lib/pattern/knobs";
import type { KnobRange } from "./types";

export {
  KNOBS_ANNOTATION_RE,
  buildKnobsAnnotationLine,
  matchKnobsAnnotation,
  parseKnobsAnnotation,
};
export type { KnobAnnotationEntry };

export function defaultKnobState(): { knobs: number[]; ranges: KnobRange[]; labels: string[] } {
  return {
    knobs: [...LOGICAL_KNOB_DEFAULTS],
    ranges: LOGICAL_KNOB_RANGES.map(([min, max]): KnobRange => [min, max]),
    labels: [...DEFAULT_KNOB_LABELS],
  };
}

// Ranges live in the lab, not in the code — the same arrangement as `@matrix`
// and `@ramp`, where the annotation is how the state LEAVES the lab rather
// than where it is kept. Retuning a range therefore has to be written back at
// export (withKnobsAnnotation below), or the published pattern carries
// whatever ranges it was imported with and the retune is silently lost.

/** True when nothing about the knobs has been named or retuned. */
export function knobStateIsDefault(labels: string[], ranges: KnobRange[]): boolean {
  const base = defaultKnobState();
  return (
    labels.length === base.labels.length &&
    labels.every((label, index) => label === base.labels[index]) &&
    ranges.length === base.ranges.length &&
    ranges.every(
      (range, index) => range[0] === base.ranges[index][0] && range[1] === base.ranges[index][1],
    )
  );
}

/**
 * Replace (or add) the `@knobs` line so the code says what the lab currently
 * shows.
 *
 * A pattern that never touched knobs is left alone: writing
 * `Knob 1=0..1, Knob 2=0.1..10, …` into something with no knobs in it is noise
 * that would then travel with every fork of it.
 */
export function withKnobsAnnotation(
  code: string,
  labels: string[],
  ranges: KnobRange[],
): string {
  if (knobStateIsDefault(labels, ranges) && !matchKnobsAnnotation(code)) return code;
  return `${buildKnobsAnnotationLine(labels, ranges)}\n${stripKnobsAnnotation(code)}`;
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

// ── // Pattern: in the lab ──────────────────────────────────────────────────
// A pattern written by hand opens with `// Pattern: <name>`, as the presets
// and the template do. The lab had no use for the line, so a pasted pattern
// stayed "Code 1", and To hardware stamped that over the NAME of the .h and
// through it the .pfm. Now the line names a piece that has no name yet.

const PATTERN_NAME_RE = /^[ \t]*\/\/[ \t]*Pattern:[ \t]*(\S[^\r\n]*)$/m;

/** The name on the code's `// Pattern:` line, or null. */
export function patternNameFromCode(code: string): string | null {
  const name = code.match(PATTERN_NAME_RE)?.[1]?.trim();
  return name ? name.slice(0, 60) : null;
}
