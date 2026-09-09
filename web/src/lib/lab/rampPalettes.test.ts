import { describe, expect, it } from "vitest";
import { hexToRgb } from "@/lib/pattern/color";
import { sampleRampRGBA, srgbToOklab } from "@/lib/pattern/harness";
import { rampStateToHarness } from "./engine";
import { randomRampColors } from "./rampPalettes";
import { cloneRampState, DEFAULT_RAMP_STATE, type RampState } from "./types";

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const lightness = (color: string) => srgbToOklab(...hexToRgb(color))[0];

describe("random ramp exploration", () => {
  it("varies count, positions, endpoints and brightness direction across repeated clicks", () => {
    const random = seededRandom(20260909);
    const counts = new Set<number>();
    const endpoints = new Set<string>();
    const interiors = new Set<number>();
    let rising = 0;
    let falling = 0;
    let mixed = 0;
    let darkest = 1;
    let brightest = 0;
    for (let i = 0; i < 200; i++) {
      const stops = randomRampColors(DEFAULT_RAMP_STATE, false, random);
      counts.add(stops.length);
      endpoints.add(stops[0].color);
      endpoints.add(stops.at(-1)!.color);
      stops.slice(1, -1).forEach((stop) => interiors.add(stop.position));
      const luma = stops.map((stop) => lightness(stop.color));
      darkest = Math.min(darkest, ...luma);
      brightest = Math.max(brightest, ...luma);
      if (luma[0] < luma.at(-1)!) rising++;
      else falling++;
      const steps = luma.slice(1).map((value, index) => value - luma[index]);
      if (steps.some((step) => step > 0.05) && steps.some((step) => step < -0.05)) mixed++;
      expect(stops[0].position).toBe(0);
      expect(stops.at(-1)!.position).toBe(1);
      expect(stops.every((stop) => /^#[0-9a-f]{6}$/i.test(stop.color) && stop.alpha === 1)).toBe(true);
      expect(stops.map((stop) => stop.position)).toEqual(stops.map((stop) => stop.position).sort((a, b) => a - b));
    }
    expect(counts.size).toBe(11);
    expect(endpoints.size).toBeGreaterThan(300);
    expect(interiors.size).toBeGreaterThan(500);
    expect(rising).toBeGreaterThan(60);
    expect(falling).toBeGreaterThan(60);
    expect(mixed).toBeGreaterThan(100);
    expect(darkest).toBeLessThan(0.15);
    expect(brightest).toBeGreaterThan(0.85);
  });

  it("does not keep black and white endpoints or force a shared hue", () => {
    // Two independent endpoint colors: a bright red and a dark saturated blue.
    const values = [0, 0, 1, 0.9, 2 / 3, 1, 0.2];
    const stops = randomRampColors(DEFAULT_RAMP_STATE, false, () => values.shift()!);
    expect(stops).toHaveLength(2);
    expect(stops.map((stop) => stop.color)).toEqual(["#e60000", "#000033"]);
    expect(lightness(stops[0].color)).toBeGreaterThan(lightness(stops[1].color));
  });

  it("keeps exact geometry and opacity only when keep stops is selected", () => {
    const ramp: RampState = {
      mode: "step", wrap: true,
      stops: [
        { position: 0.12, color: "#000000", alpha: 0 },
        { position: 0.61, color: "#ffffff", alpha: 0.6 },
        { position: 0.61, color: "#ffffff", alpha: 1 },
      ],
    };
    const before = cloneRampState(ramp);
    const stops = randomRampColors(ramp, true, seededRandom(4));
    expect(stops.map(({ position, alpha }) => ({ position, alpha })))
      .toEqual(ramp.stops.map(({ position, alpha }) => ({ position, alpha })));
    expect(stops[0].color).not.toBe("#000000");
    expect(stops[1].color).not.toBe("#ffffff");
    expect(ramp).toEqual(before);
  });

  it("samples existing opacity at the newly generated positions without mutating input", () => {
    const ramp: RampState = {
      mode: "smooth", wrap: true,
      stops: [
        { position: 0, color: "#112233", alpha: 0.2 },
        { position: 1, color: "#eeeeff", alpha: 0.8 },
      ],
    };
    const before = cloneRampState(ramp);
    const stops = randomRampColors(ramp, false, seededRandom(42));
    for (const stop of stops) {
      expect(stop.alpha).toBe(sampleRampRGBA(rampStateToHarness(ramp), stop.position)[3]);
    }
    expect(ramp).toEqual(before);
  });
});
