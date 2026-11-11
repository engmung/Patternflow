// The wall-time fields of the input frame. Until 12 November 2026 the pattern
// runtime filled them from the host's clock for every caller that left them
// out, so the guide and the virtual panel showed a board with the clock
// feature, and a pattern's fallback for timeValid false was never seen. The
// runtime now gives what a board without the clock gives, and the lab passes
// the browser's clock itself.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdleInput, PatternRuntime } from "@/lib/pattern/harness";
import { LabEngine } from "./engine";
import { DEFAULT_RAMP_STATE, type CodeLayer } from "./types";

// Pixel 0 carries timeValid and the hour, pixel 1 the minute and the second.
const CODE = `export function update(dt, input, params) { params.in = input; }
export function draw(display, params) {
  const i = params.in;
  display.setPixel(0, 0, i.timeValid === true ? 255 : i.timeValid === false ? 100 : 0, i.hour ?? 200, 0);
  display.setPixel(1, 0, i.minute ?? 200, i.second ?? 200, 0);
}`;

function shown(data: Uint8ClampedArray) {
  return [data[0], data[1], data[4], data[5]];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 13, 7, 42));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the pattern runtime", () => {
  function run(extra: object) {
    const runtime = new PatternRuntime(2, 1);
    expect(runtime.loadCode(CODE).ok).toBe(true);
    expect(runtime.renderFrame(1 / 60, 0, { ...createIdleInput(), ...extra }).ok).toBe(true);
    return shown(runtime.data);
  }

  it("gives a board without the clock when the caller leaves the time out", () => {
    expect(run({})).toEqual([100, 0, 0, 0]);
  });

  it("gives 0 for the fields a caller passing timeValid false leaves out", () => {
    expect(run({ timeValid: false })).toEqual([100, 0, 0, 0]);
  });

  it("passes the time a caller gives", () => {
    expect(run({ timeValid: true, hour: 9, minute: 30, second: 5 })).toEqual([255, 9, 30, 5]);
  });
});

describe("the lab", () => {
  it("previews a board that knows the time, from the browser's clock", () => {
    const layer: CodeLayer = {
      id: "clock",
      type: "code",
      name: "clock",
      visible: true,
      opacity: 1,
      blend: "normal",
      role: "paint",
      maskInvert: false,
      code: CODE,
      ramp: DEFAULT_RAMP_STATE,
      recolor: false,
      knobsAnnotationRaw: null,
      matrixAnnotationRaw: null,
    };
    const frame = new LabEngine().render(
      {
        matrix: { width: 2, height: 1 },
        layers: [layer],
        activeLayerId: layer.id,
        knobs: [0, 0, 0, 0],
        ranges: [[0, 1], [0, 1], [0, 1], [0, 1]],
      },
      1 / 60,
      0,
    );
    expect(shown(frame.data)).toEqual([255, 13, 7, 42]);
  });
});
