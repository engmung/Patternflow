import { describe, expect, it } from 'vitest';
import { buildVariantCopyPrompt } from '@/lib/ai/variantPrompt';
import { DETENTS_PER_TURN, TURNS_PER_FULL_RANGE } from '@/lib/shared/constants';
import { getVariantPrompt } from './variantPrompt';

// The prompt "Copy creation prompt" hands a model. Its knob lines have to say
// what one detent does to each knob, the same rule the preview's knobs and the
// encoder follow: a knob's whole range in two turns of 24 detents.

const knobLines = (prompt: string) => prompt.split('\n').filter((line) => line.startsWith('- Knob '));

describe('getVariantPrompt', () => {
  it("gives each knob the step one detent moves it, from the knob's range", () => {
    const detentsPerRange = DETENTS_PER_TURN * TURNS_PER_FULL_RANGE;
    const step = (span: number) => Math.round((span / detentsPerRange) * 1000) / 1000;

    // 48 detents a range today: 0.021, 0.206, 0.102 and 0.021. The lines said
    // 0.05, 0.10, 0.05 and 0.05.
    expect(knobLines(getVariantPrompt(''))).toEqual([
      `- Knob 1: 0.0 to 1.0, wraps at edges, step ${step(1)} per detent.`,
      `- Knob 2: 0.1 to 10.0, clamps at edges, step ${step(9.9)} per detent.`,
      `- Knob 3: 0.0 to 4.9, clamps at edges, step ${step(4.9)} per detent.`,
      `- Knob 4: 0.0 to 1.0, wraps at edges, step ${step(1)} per detent.`,
    ]);
  });

  // The prompt asks a model for a @knobs line, and the preview turns its knobs
  // through the ranges on that line. Pasted back as the next seed, such a
  // pattern still got the default ranges here.
  it("follows the seed's @knobs line, and keeps the default for a slot it skips", () => {
    const seed = '// @knobs Folds=3..12, Speed=0.05..5, -, Pitch=-20..20\nexport function draw(display) {}';
    expect(knobLines(getVariantPrompt(seed))).toEqual([
      '- Knob 1: 3.0 to 12.0, wraps at edges, step 0.188 per detent.',
      '- Knob 2: 0.05 to 5.0, clamps at edges, step 0.103 per detent.',
      '- Knob 3: 0.0 to 4.9, clamps at edges, step 0.102 per detent.',
      '- Knob 4: -20.0 to 20.0, wraps at edges, step 0.833 per detent.',
    ]);
  });

  it('says how many detents make a turn and a range', () => {
    expect(getVariantPrompt('')).toContain(
      `The encoder has ${DETENTS_PER_TURN} detents a turn, and ${TURNS_PER_FULL_RANGE} turns cross a knob's whole range:`,
    );
  });

  it('ends with the seed pattern in a javascript block', () => {
    const code = 'export function draw(display) {}';
    expect(getVariantPrompt(code).endsWith(`\`\`\`javascript\n${code}\n\`\`\``)).toBe(true);
  });
});

// Until 22 November 2026 this prompt was a text of its own. It had no @knobs
// line and never said that draw() gets no input, long after the Lab's prompt
// did.
describe("getVariantPrompt and Pattern Lab's Copy prompt", () => {
  const code = 'export function draw(display) {}';
  const landing = getVariantPrompt(code).split('\n');
  const lab = buildVariantCopyPrompt(code, [0, 0, 0, 0], [[0, 1], [0, 1], [0, 1], [0, 1]], 'rgb', {
    width: 128,
    height: 64,
  }).split('\n');

  it("is the Lab's prompt in RGB mode, line for line, down to its own knob block", () => {
    expect(landing.filter((line) => !lab.includes(line))).toEqual([
      `Knob ranges for the Patternflow live editor. The encoder has ${DETENTS_PER_TURN} detents a turn, and ${TURNS_PER_FULL_RANGE} turns cross a knob's whole range:`,
      ...knobLines(landing.join('\n')),
    ]);
    expect(landing).toContain('  // @knobs Folds=3..12, Speed=0.1..10, Zoom=2..17, Contrast=0.1..1');
    const has = (start: string) => landing.some((line) => line.startsWith(start));
    expect(has('- Write each pixel with display.setPixel(x, y, r, g, b)')).toBe(true);
    expect(has('- IMPORTANT: input is passed ONLY to update(dt, input, params).')).toBe(true);
  });

  // LedMatrixTexture.ts passes btnPressed and btnHeld as four falses and no
  // time fields, and draws 128 × 64 whatever the code declares.
  it('leaves out the three rules the landing preview has nothing behind', () => {
    const left = lab.filter((line) => !landing.includes(line) && !line.startsWith('- Knob '));
    const starts = [
      '- Optional: each knob also has a push button.',
      '- Optional, only for a pattern that is about the time:',
      '- Declare the frame you composed for with ONE comment line',
      '  // @matrix 128x64',
      '  Use exactly the dimensions given above.',
      // The heading of the Lab's own knob block.
      'Current Pattern Lab controls:',
    ];
    expect(left).toHaveLength(starts.length);
    left.forEach((line, index) => expect(line.startsWith(starts[index]), line).toBe(true));
  });
});
