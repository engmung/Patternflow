// ── The colour ramp, as something a shader can read ──────────────────────────
// A pattern that draws with display.setValue() has no colours of its own: the
// ramp is the user's colour decision, applied by the runtime. Baking it into
// the shader text would freeze that decision — the Color Ramp panel would move
// and the twin would not — so the ramp travels as a lookup texture instead and
// the shader reads it through `ramp(v)`. Editing a stop then repaints the
// output on the next frame, with no recompile and no AI round trip.
//
// Sampled 1024× rather than the runtime's 256: the panel's LUT is an 8-bit LED
// simulation, and a poster is not. Between entries the texture interpolates, so
// a smooth ramp comes out smooth instead of stepped at 1/256 — closer to the
// ramp the user drew, not further from it. Hard "step" ramps land within one
// 1024th of their edge.

import { rampStateToHarness } from "../engine";
import type { RampState } from "../types";
import { sampleRampRGBA } from "@/lib/patternHarness";

/** Entries in the ramp texture; the GLSL helper is built around this number. */
export const SHADER_RAMP_SIZE = 1024;

/** RGBA8 rows for a 1-pixel-tall texture: `SHADER_RAMP_SIZE` × 1. */
export function buildShaderRampLUT(ramp: RampState): Uint8Array {
  const lut = new Uint8Array(SHADER_RAMP_SIZE * 4);
  if (ramp.stops.length === 0) {
    lut.fill(255);
    return lut;
  }
  const harness = rampStateToHarness(ramp);
  for (let index = 0; index < SHADER_RAMP_SIZE; index++) {
    const [r, g, b, a] = sampleRampRGBA(harness, index / (SHADER_RAMP_SIZE - 1));
    lut[index * 4] = Math.max(0, Math.min(255, Math.round(r)));
    lut[index * 4 + 1] = Math.max(0, Math.min(255, Math.round(g)));
    lut[index * 4 + 2] = Math.max(0, Math.min(255, Math.round(b)));
    lut[index * 4 + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
  }
  return lut;
}
