export const ENCODER_CLICKS_PER_TURN = 20;

// One full web knob rotation should equal one physical encoder turn.
// Keep these as the source of truth for both preview sensitivity and C++ steps.
export const WEB_KNOB_UNITS_PER_TURN = {
  c1: 1,
  c2: 2,
  c3: 1,
  c4: 1,
} as const;

export type KnobId = keyof typeof WEB_KNOB_UNITS_PER_TURN;

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

export const LOGICAL_KNOB_UNITS_PER_TURN = LOGICAL_KNOB_TO_WEB_KNOB.map(
  (knobId) => WEB_KNOB_UNITS_PER_TURN[knobId],
);

export function getKnobValueDelta(knobId: KnobId, current: number, previous: number) {
  let delta = current - previous;

  if (knobId === 'c1' || knobId === 'c3') {
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
  }

  return delta;
}

export function toEncoderDelta(knobId: KnobId, valueDelta: number) {
  return valueDelta * (ENCODER_CLICKS_PER_TURN / WEB_KNOB_UNITS_PER_TURN[knobId]);
}
