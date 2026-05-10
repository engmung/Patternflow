export const ENCODER_CLICKS_PER_TURN = 20;

export const WEB_KNOB_UNITS_PER_TURN = {
  c1: 1,
  c2: 10,
  c3: 1,
  c4: 5,
} as const;

export type KnobId = keyof typeof WEB_KNOB_UNITS_PER_TURN;

export type KnobValues = Record<KnobId, number>;

// Pattern code uses logical knobs in firmware order: Hue, Speed, Mode, Freq/Offset.
// The web model stores values by the physical front-panel knob position.
export const LOGICAL_KNOB_TO_WEB_KNOB: KnobId[] = ['c1', 'c2', 'c4', 'c3'];

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
