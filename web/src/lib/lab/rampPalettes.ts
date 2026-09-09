import { hexToRgb, rgbToHex } from "@/lib/pattern/color";
import { sampleRampRGBA, type ColorRamp } from "@/lib/pattern/harness";
import type { RampState, RampStopState } from "./types";

/** Independent hue, saturation and brightness for EACH stop. Neither endpoint
 * nor the direction of lightness is prescribed by the generator. */
function randomColor(random: () => number): string {
  const hue = random() * 6;
  const saturation = random();
  const brightness = random();
  const channel = (offset: number) => {
    const k = (offset + hue) % 6;
    return 255 * brightness * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return rgbToHex(channel(5), channel(3), channel(1));
}

/** By default, generate a new 2–12-stop ramp with random interior positions.
 * Keep interpolation/wrap in the caller; sample existing opacity at new stops.
 * keepStops is the explicit colors-only option, preserving exact stop geometry
 * and opacity (including duplicate stops and hard transitions).
 */
export function randomRampColors(
  ramp: RampState,
  keepStops = false,
  random: () => number = Math.random,
): RampStopState[] {
  if (keepStops) {
    return ramp.stops.map((stop) => ({ ...stop, color: randomColor(random) }));
  }
  const count = 2 + Math.floor(random() * 11);
  const positions = [0, ...Array.from({ length: count - 2 }, () => random()), 1]
    .sort((a, b) => a - b);
  const source: ColorRamp = {
    ...ramp,
    stops: ramp.stops.map((stop) => ({ ...stop, color: hexToRgb(stop.color) })),
  };
  return positions.map((position) => ({
    position,
    color: randomColor(random),
    alpha: ramp.stops.length ? sampleRampRGBA(source, position)[3] : 1,
  }));
}
