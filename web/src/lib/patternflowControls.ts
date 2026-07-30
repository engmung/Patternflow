// Detents in one full turn of the physical encoder.
// Keep in sync with PATTERN_DETENTS_PER_TURN in patternHarness.ts (see the note
// there: the reference Bourns PEC11R-...-S0024 is 24, not the 20 assumed here
// for a long time).
export const ENCODER_CLICKS_PER_TURN = 24;

// How many full turns cross a parameter's ENTIRE range.
//
// Travel used to be a fixed per-knob constant ({c1:1, c2:2, ...}) that ignored
// the parameter's range entirely, so a 0..1 knob crossed in one turn while a
// 0..100 knob needed a hundred — and the C++ step the conversion prompt handed
// out inherited exactly the same mistake (hence ~80 patterns all using 0.05f).
// Deriving travel from the range makes every knob feel the same regardless of
// what it controls, and keeps the web preview and the encoder in step because
// both read the value from here.
export const TURNS_PER_FULL_RANGE = 2;

/** Value units covered by one full turn, for a parameter spanning `range`. */
export function knobUnitsPerTurn(range: readonly [number, number]) {
  return (range[1] - range[0]) / TURNS_PER_FULL_RANGE;
}

/** Value change per detent — this is the STEP a C++ pattern multiplies by. */
export function knobDetentStep(range: readonly [number, number]) {
  return knobUnitsPerTurn(range) / ENCODER_CLICKS_PER_TURN;
}

export type KnobId = 'c1' | 'c2' | 'c3' | 'c4';

export type KnobValues = Record<KnobId, number>;

// Pattern code uses logical knobs in firmware order: Hue, Speed, Mode, Freq/Offset.
// The web model stores values by the physical front-panel knob position.
export const LOGICAL_KNOB_TO_WEB_KNOB: KnobId[] = ['c1', 'c2', 'c4', 'c3'];

export const LOGICAL_KNOB_RANGES: Array<[number, number]> = [
  [0, 1],
  [0.1, 10],
  [0, 4.9],
  [0, 1],
];

export const LOGICAL_KNOB_DEFAULTS = [0, 2, 0, 0.06];

export const LOGICAL_KNOB_WRAP = [true, false, false, true];

/** Units-per-turn for each logical knob, given that pattern's declared ranges. */
export function logicalKnobUnitsPerTurn(
  ranges: ReadonlyArray<readonly [number, number]> = LOGICAL_KNOB_RANGES,
) {
  return LOGICAL_KNOB_RANGES.map((fallback, index) =>
    knobUnitsPerTurn(ranges[index] ?? fallback),
  );
}

/** The declared range of a knob addressed by its front-panel id. */
export function webKnobRange(knobId: KnobId): readonly [number, number] {
  const logicalIndex = LOGICAL_KNOB_TO_WEB_KNOB.indexOf(knobId);
  return LOGICAL_KNOB_RANGES[logicalIndex] ?? [0, 1];
}

export function getKnobValueDelta(knobId: KnobId, current: number, previous: number) {
  let delta = current - previous;

  if (knobId === 'c1' || knobId === 'c3') {
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
  }

  return delta;
}

export function toEncoderDelta(range: readonly [number, number], valueDelta: number) {
  return valueDelta * (ENCODER_CLICKS_PER_TURN / knobUnitsPerTurn(range));
}
