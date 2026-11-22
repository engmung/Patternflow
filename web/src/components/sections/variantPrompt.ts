import { buildVariantPrompt } from '@/lib/ai/variantPrompt';
import {
  ENCODER_CLICKS_PER_TURN,
  LOGICAL_KNOB_WRAP,
  TURNS_PER_FULL_RANGE,
  codeKnobRanges,
  knobDetentStep,
  tidyKnobValue,
} from '@/lib/pattern/controls';
import { DEFAULT_MATRIX } from '@/lib/pattern/matrix';

// What "Copy creation prompt" under the Live Editor puts on the clipboard
// (PatternPanel.tsx).
//
// Everything above the knob lines is Pattern Lab's Copy prompt in RGB mode,
// built by the same function (lib/ai/variantPrompt.ts). Until 22 November 2026
// this file held a copy of that text, and the copy had stopped at the API from
// before the @knobs line. Three of the Lab's rules are left out, because the
// preview here has nothing behind them. LedMatrixTexture.ts gives a pattern no
// button presses and no wall time, and its frame is 128 × 64 whatever a
// @matrix line says.
//
// The knob lines are worked out from the ranges the preview's knobs turn
// through. They used to be typed in, and said 0.05 a detent (0.10 for Knob 2)
// long after the encoder was counted at 24 detents a turn with two turns to a
// range, which makes Knob 2's detent 0.206. A seed with a @knobs line turns
// the preview's knobs through its own ranges (codeKnobRanges), so the lines
// give those.

// Three decimals, as the Lab's C++ prompt rounds the same step
// (lib/lab/cppPrompt.ts).
function roundStep(value: number) {
  return Math.round(value * 1000) / 1000;
}

// One decimal, as the default ranges have always read, unless that would
// round the edge away: Speed=0.05..5 starts at 0.05, not 0.1.
function rangeEdge(value: number) {
  const tidy = tidyKnobValue(value);
  return Number(tidy.toFixed(1)) === tidy ? tidy.toFixed(1) : String(tidy);
}

export function knobRangeLines(code?: string | null) {
  return codeKnobRanges(code).map(([min, max], index) => {
    const edges = LOGICAL_KNOB_WRAP[index] ? 'wraps' : 'clamps';
    const step = roundStep(knobDetentStep([min, max]));
    return `- Knob ${index + 1}: ${rangeEdge(min)} to ${rangeEdge(max)}, ${edges} at edges, step ${step} per detent.`;
  }).join('\n');
}

export const getVariantPrompt = (code: string) =>
  buildVariantPrompt({
    code,
    matrix: DEFAULT_MATRIX,
    colorMode: 'rgb',
    without: ['buttons', 'wallTime', 'matrixLine'],
    controls: `Knob ranges for the Patternflow live editor. The encoder has ${ENCODER_CLICKS_PER_TURN} detents a turn, and ${TURNS_PER_FULL_RANGE} turns cross a knob's whole range:
${knobRangeLines(code)}`,
  });
