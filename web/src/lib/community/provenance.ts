import { MADE_HOW_BLURBS, MADE_HOW_LABELS, type MadeHow } from "./validate";

// ─────────────────────────────────────────────────────────────────────────────
// Provenance — what is on the record about how a pattern came to exist.
//
// Two sources, and the difference matters.
//
// The author's `made_how` declaration is a *claim*. The signals below are
// *evidence*: they are read out of the pattern's own source, where Pattern Lab
// wrote them while the author worked. A `@ramp` line means somebody chose
// colours. `@knobs` means somebody decided what the four knobs should reach. A
// verified `.h` means somebody ran it on real hardware. None of that can be
// produced by asking a model for a pattern and pressing publish.
//
// This is deliberately not a score. It is a list of things that happened, shown
// as they are, and a pattern with none of them is not accused of anything.
// ─────────────────────────────────────────────────────────────────────────────

export type ProvenanceSignal = {
  id: string;
  label: string;
  /** Why this counts as a human decision, for the tooltip. */
  detail: string;
};

const RAMP_RE = /^\s*\/\/\s*@ramp\b/m;
const KNOBS_RE = /^\s*\/\/\s*@knobs\b/m;
const STACK_RE = /^\s*\/\/\s*@stack\b/m;
const MATRIX_RE = /^\s*\/\/\s*@matrix\b/m;

export function provenanceSignals(code: string, hasHeader: boolean): ProvenanceSignal[] {
  const signals: ProvenanceSignal[] = [];

  if (RAMP_RE.test(code)) {
    signals.push({
      id: "ramp",
      label: "Colour shaped",
      detail: "Carries a colour ramp — the stops and blend mode were chosen by the author.",
    });
  }
  if (KNOBS_RE.test(code)) {
    signals.push({
      id: "knobs",
      label: "Knobs tuned",
      detail: "Declares its own knob names and ranges, rather than leaving the defaults.",
    });
  }
  if (STACK_RE.test(code)) {
    signals.push({
      id: "stack",
      label: "Layered",
      detail: "Composed from a layer stack in Pattern Lab, not a single generated file.",
    });
  }
  if (MATRIX_RE.test(code)) {
    signals.push({
      id: "matrix",
      label: "Framed",
      detail: "Composed for a specific matrix size.",
    });
  }
  if (hasHeader) {
    signals.push({
      id: "hardware",
      label: "Hardware verified",
      detail: "Ships a firmware header the author ported and ran on a real board.",
    });
  }

  return signals;
}

export type Provenance = {
  madeHow: MadeHow | null;
  madeHowLabel: string | null;
  madeHowBlurb: string | null;
  signals: ProvenanceSignal[];
};

export function provenanceFor(
  code: string,
  hasHeader: boolean,
  madeHow: string | null,
): Provenance {
  const declared = madeHow && madeHow in MADE_HOW_LABELS ? (madeHow as MadeHow) : null;
  return {
    madeHow: declared,
    madeHowLabel: declared ? MADE_HOW_LABELS[declared] : null,
    madeHowBlurb: declared ? MADE_HOW_BLURBS[declared] : null,
    signals: provenanceSignals(code, hasHeader),
  };
}
