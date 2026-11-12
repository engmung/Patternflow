import { BUS_MAX, DETENTS_PER_TURN, TURNS_PER_FULL_RANGE } from "@/lib/shared/constants";
import { parseKnobsAnnotation } from "./knobs";

// Detents in one full turn of the physical encoder. One fact, one constant:
// shared/constants.json owns it (see the note in harness.ts — the reference
// Bourns PEC11R-...-S0024 is 24, not the 20 assumed for a long time) and this
// is the name the knob math has always used for it.
export const ENCODER_CLICKS_PER_TURN = DETENTS_PER_TURN;

// The device's absolute bus speaks integers 0..1000 (PF_BUS_MAX in
// firmware/patternflow/src/core_bus.h, BUS_MAX in shared/constants.json).
// Everything here that writes a wire value — the Director's bake, the .pfs
// codec, the MIDI export — uses this rather than the literal, so the two sides
// can only disagree in one place.
export const BUS_WIRE_MAX = BUS_MAX;

// How many full turns cross a parameter's ENTIRE range.
//
// Travel used to be a fixed per-knob constant ({c1:1, c2:2, ...}) that ignored
// the parameter's range entirely, so a 0..1 knob crossed in one turn while a
// 0..100 knob needed a hundred — and the C++ step the conversion prompt handed
// out inherited exactly the same mistake (hence ~80 patterns all using 0.05f).
// Deriving travel from the range makes every knob feel the same regardless of
// what it controls, and keeps the web preview and the encoder in step because
// both read the value from here.
export { TURNS_PER_FULL_RANGE };

/** Value units covered by one full turn, for a parameter spanning `range`. */
export function knobUnitsPerTurn(range: readonly [number, number]) {
  return (range[1] - range[0]) / TURNS_PER_FULL_RANGE;
}

/** Value change per detent — this is the STEP a C++ pattern multiplies by. */
export function knobDetentStep(range: readonly [number, number]) {
  return knobUnitsPerTurn(range) / ENCODER_CLICKS_PER_TURN;
}

// The narrowest span a knob's 0..1 reading divides by, so a range edited down
// to nothing reads 0 instead of NaN. The Lab, its capture worker, its C++
// export and the text effects floored at 0.0001; the community's sandbox and
// cards floored at 0.001, so a knob declared 0.0001..0.0004 sitting at 0.00025
// reached a pattern as 0.5 in the Lab and 0.15 on its card.
const KNOB_SPAN_FLOOR = 0.0001;

/** Where a value sits in a knob's range, 0 at the bottom and 1 at the top. Not held to 0..1. */
export function normalizeKnob(value: number, range: readonly [number, number]) {
  return (value - range[0]) / Math.max(KNOB_SPAN_FLOOR, range[1] - range[0]);
}

/**
 * A knob value with float noise taken off: twelve significant digits, so 0.1 +
 * 0.2 reads 0.3 and a range as fine as 0.0001..0.0004 keeps its digits. The
 * community's cards rounded to three decimals, which started that knob at 0,
 * below its range, and a 0.001..0.002 knob at its top.
 */
export function tidyKnobValue(value: number) {
  return Number(value.toPrecision(12));
}

/**
 * Three decimals, the grain of the Lab's knob range fields: an edge typed or
 * dragged in the Knobs panel, and the detent step the C++ prompt quotes.
 */
export function roundRangeValue(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** The middle of a knob's range, where a card with no saved knob state starts. */
export function knobMidpoint(range: readonly [number, number]) {
  return tidyKnobValue((range[0] + range[1]) / 2);
}

/**
 * Where one notch of a card's wheel leaves a knob: a 25th of its range up or
 * down, held to the range. The community's cards and the guide's practice
 * wall both turn with it. The practice wall kept a copy of the cards' old
 * step, floored at 0.001 and rounded to three decimals, so a 0.0001..0.0004
 * knob fell to 0, below its range, on the first notch.
 */
export function knobWheelValue(value: number, range: readonly [number, number], direction: 1 | -1) {
  const [min, max] = range;
  const step = Math.max(KNOB_SPAN_FLOOR, max - min) / 25;
  return Math.max(min, Math.min(max, tidyKnobValue(value + direction * step)));
}

/**
 * Where one arrow key leaves a knob: a detent up (ArrowRight, ArrowUp) or
 * down (ArrowLeft, ArrowDown), held to the range the way PFParams::apply holds
 * the Lab's header. A range input's own arrow step is its `step`, 0.001, which
 * took 110,000 presses across a 10..120 knob; this takes 48, as the encoder
 * does. Any other key, or one with Alt, Ctrl or Cmd, gives null, so the input
 * keeps Home, End and Page Up/Down and the browser keeps its shortcuts.
 */
export function knobArrowValue(
  event: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean },
  value: number,
  range: readonly [number, number],
): number | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const direction =
    event.key === "ArrowRight" || event.key === "ArrowUp" ? 1
    : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1
    : 0;
  const [min, max] = range;
  const span = max - min;
  if (!direction || !(span > 0)) return null;
  // Counted in detents from the bottom, so a knob on a detent lands on the
  // next one exactly. Adding 4 / 48 to 2 forty-eight times stops short of 6,
  // and the top took a 49th press.
  const across = TURNS_PER_FULL_RANGE * ENCODER_CLICKS_PER_TURN;
  const from = ((value - min) / span) * across;
  const nearest = Math.round(from);
  const detent = (Math.abs(from - nearest) < 1e-6 ? nearest : from) + direction;
  return Math.min(max, Math.max(min, min + (detent * span) / across));
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

/**
 * The logical knobs' ranges for a pattern's code: what its `@knobs` line
 * declares, and the default range for a slot the line leaves out. The Lab
 * applies the same line (lib/lab/annotations); the 3D device on /pattern held
 * every knob to the defaults, so a pattern declaring Speed=-10..10 could not
 * be turned below 0.1 there.
 */
export function codeKnobRanges(code: string | null | undefined): Array<[number, number]> {
  const entries = code ? parseKnobsAnnotation(code) : null;
  return LOGICAL_KNOB_RANGES.map(([min, max], index): [number, number] => {
    const entry = entries?.[index];
    return entry ? [entry.min, entry.max] : [min, max];
  });
}

/** A knob value held to its range: round the seam on a wrapping knob, clamped on the others. */
export function holdKnobValue(value: number, range: readonly [number, number], wrap: boolean) {
  const [min, max] = range;
  const span = max - min;
  if (!(span > 0)) return min;
  if (wrap) return min + ((((value - min) % span) + span) % span);
  return Math.min(max, Math.max(min, value));
}

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

/**
 * A wrapping knob's change between two readings, taken the short way round a
 * range `span` wide: on 0..1, 0.95 to 0.05 is +0.1 across the seam, not -0.9.
 * The span has to be the knob's own. A pattern that declares Hue=0..360 moves
 * 7.5 a detent, and wrapping that at ±0.5 read the detent as 6.5.
 */
export function wrapKnobDelta(delta: number, span = 1) {
  if (delta > span / 2) return delta - span;
  if (delta < -span / 2) return delta + span;
  return delta;
}

export function getKnobValueDelta(
  knobId: KnobId,
  current: number,
  previous: number,
  range: readonly [number, number] = webKnobRange(knobId),
) {
  const delta = current - previous;
  if (!LOGICAL_KNOB_WRAP[LOGICAL_KNOB_TO_WEB_KNOB.indexOf(knobId)]) return delta;
  return wrapKnobDelta(delta, range[1] - range[0]);
}

export function toEncoderDelta(range: readonly [number, number], valueDelta: number) {
  return valueDelta * (ENCODER_CLICKS_PER_TURN / knobUnitsPerTurn(range));
}
