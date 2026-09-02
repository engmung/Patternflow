// ── @knobs annotation ────────────────────────────────────────────────────────
// A pattern declares knob names and ranges with one comment line:
//
//   // @knobs Folds=3..12, Speed=0.1..10, Zoom=2..17, Contrast=0.1..1
//
// "-" skips a slot. Like @matrix and @ramp, the line rides inside the code so
// it survives every hop a pattern makes — lab → community → fork → C++ — and
// this module is the ONE parser and printer of it. The lab (lib/lab/annotations)
// layers its knob state on top; the community's cards (lib/community/knobs)
// read it to draw sliders. Until 2026-09 each side had its own copy of the
// regex, which is exactly how a format change would have landed on one and
// not the other.

export const KNOBS_ANNOTATION_RE = /^[ \t]*\/\/[ \t]*@knobs[ \t]+(.+)$/m;

export const DEFAULT_KNOB_LABELS = ["Knob 1", "Knob 2", "Knob 3", "Knob 4"];

/** Labels are clipped to what the device's status screen can show. */
export const KNOB_LABEL_MAX = 14;

export type KnobAnnotationEntry = { name: string; min: number; max: number } | null;

/** The annotation line as written, or null. */
export function matchKnobsAnnotation(code: string): string | null {
  return code.match(KNOBS_ANNOTATION_RE)?.[0] ?? null;
}

/**
 * Four slots, each an entry or null. Null for the whole thing when there is
 * no line or nothing in it parsed.
 */
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
      result[index] = { name: m[1].trim().slice(0, KNOB_LABEL_MAX), min, max };
    });
  return result.some(Boolean) ? result : null;
}

export function stripKnobsAnnotation(code: string): string {
  return code.replace(KNOBS_ANNOTATION_RE, "").replace(/^\n/, "");
}

/** The `@knobs` line for a set of labels and ranges. */
export function buildKnobsAnnotationLine(
  labels: readonly string[],
  ranges: readonly (readonly [number, number])[],
): string {
  const trim = (value: number) => `${Math.round(value * 1000) / 1000}`;
  const entries = labels.map((label, index) => {
    const range = ranges[index] ?? [0, 1];
    // Commas and equals signs are the annotation's own separators.
    const name = label.replace(/[,=]/g, " ").trim() || "-";
    return `${name}=${trim(range[0])}..${trim(range[1])}`;
  });
  return `// @knobs ${entries.join(", ")}`;
}
