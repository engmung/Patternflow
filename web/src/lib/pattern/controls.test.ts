// The knob math every preview shares: how far one detent moves a value, which
// knobs wrap, and how a value change becomes the encoder clicks a pattern
// reads in input.knobDeltas. The first-screen preview goes through
// getKnobValueDelta by front-panel id; the lab, the sandbox and the guide go
// through knobTargetToDelta by logical index. Both used to spell out the wrap
// rule themselves.

import { describe, expect, it } from "vitest";
import { DETENTS_PER_TURN, TURNS_PER_FULL_RANGE } from "@/lib/shared/constants";
import { LabEngine } from "@/lib/lab/engine";
import { DEFAULT_RAMP_STATE, cloneRampState, type CodeLayer } from "@/lib/lab/types";
import { knobTargetToDelta } from "./harness";
import {
  ENCODER_CLICKS_PER_TURN,
  codeKnobRanges,
  holdKnobValue,
  LOGICAL_KNOB_RANGES,
  LOGICAL_KNOB_TO_WEB_KNOB,
  LOGICAL_KNOB_WRAP,
  getKnobValueDelta,
  knobArrowValue,
  knobDetentStep,
  knobMidpoint,
  knobUnitsPerTurn,
  knobWheelValue,
  logicalKnobUnitsPerTurn,
  normalizeKnob,
  tidyKnobValue,
  toEncoderDelta,
  webKnobRange,
  wrapKnobDelta,
  type KnobId,
} from "./controls";

describe("travel", () => {
  it("crosses any range in the same number of turns", () => {
    for (const range of [[0, 1], [0.1, 10], [-20, 20], [3, 12]] as const) {
      const span = range[1] - range[0];
      expect(knobUnitsPerTurn(range) * TURNS_PER_FULL_RANGE).toBeCloseTo(span, 12);
      expect(knobDetentStep(range) * DETENTS_PER_TURN * TURNS_PER_FULL_RANGE).toBeCloseTo(span, 12);
    }
  });

  it("counts the encoder's detents from shared/constants.json", () => {
    expect(ENCODER_CLICKS_PER_TURN).toBe(DETENTS_PER_TURN);
  });

  it("turns one detent's worth of value back into one click", () => {
    for (const range of LOGICAL_KNOB_RANGES) {
      expect(toEncoderDelta(range, knobDetentStep(range))).toBeCloseTo(1, 12);
      expect(toEncoderDelta(range, -knobUnitsPerTurn(range))).toBeCloseTo(-DETENTS_PER_TURN, 12);
    }
  });

  it("takes a pattern's declared ranges per knob and the lab's defaults for the rest", () => {
    const perTurn = logicalKnobUnitsPerTurn([[0, 10]]);
    expect(perTurn).toHaveLength(4);
    expect(perTurn[0]).toBeCloseTo(10 / TURNS_PER_FULL_RANGE, 12);
    LOGICAL_KNOB_RANGES.slice(1).forEach((range, index) => {
      expect(perTurn[index + 1]).toBeCloseTo(knobUnitsPerTurn(range), 12);
    });
  });
});

describe("arrow keys", () => {
  const key = (name: string, mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey", boolean>> = {}) => ({
    key: name,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...mods,
  });

  it("move a knob one detent, up on Right and Up, down on Left and Down", () => {
    const range = [10, 120] as const;
    expect(knobArrowValue(key("ArrowRight"), 10, range)).toBe(10 + knobDetentStep(range));
    expect(knobArrowValue(key("ArrowUp"), 10, range)).toBe(10 + knobDetentStep(range));
    expect(knobArrowValue(key("ArrowLeft"), 65, range)).toBe(65 - knobDetentStep(range));
    expect(knobArrowValue(key("ArrowDown"), 65, range)).toBe(65 - knobDetentStep(range));
  });

  it("cross any range in two turns of detents and stop at each end", () => {
    for (const range of [[0, 1], [0.1, 10], [0, 4.9], [10, 120], [2, 6], [-1, 1], [0, 360]] as const) {
      let value: number = range[0];
      let presses = 0;
      while (value < range[1] && presses < 100) {
        value = knobArrowValue(key("ArrowRight"), value, range)!;
        presses++;
        if (presses === DETENTS_PER_TURN) expect(value).toBeCloseTo((range[0] + range[1]) / 2, 12);
      }
      expect([range, presses, value]).toEqual([range, DETENTS_PER_TURN * TURNS_PER_FULL_RANGE, range[1]]);
      expect(knobArrowValue(key("ArrowRight"), value, range)).toBe(range[1]);
      for (presses = 0; value > range[0] && presses < 100; presses++) value = knobArrowValue(key("ArrowLeft"), value, range)!;
      expect([range, presses, value]).toEqual([range, DETENTS_PER_TURN * TURNS_PER_FULL_RANGE, range[0]]);
      expect(knobArrowValue(key("ArrowLeft"), value, range)).toBe(range[0]);
    }
  });

  it("turn a knob between detents by one detent from where it is", () => {
    const range = [0, 1] as const;
    expect(knobArrowValue(key("ArrowRight"), 0.06, range)).toBeCloseTo(0.06 + knobDetentStep(range), 12);
  });

  it("leave other keys and modified arrows to the input and the browser", () => {
    for (const name of ["Home", "End", "PageUp", "PageDown", "Tab", "a"]) {
      expect(knobArrowValue(key(name), 0.5, [0, 1])).toBeNull();
    }
    for (const mod of ["altKey", "ctrlKey", "metaKey"] as const) {
      expect(knobArrowValue(key("ArrowRight", { [mod]: true }), 0.5, [0, 1])).toBeNull();
    }
  });
});

describe("reading a knob as 0..1", () => {
  it("puts the bottom of a range at 0 and the top at 1, and leaves a value outside it outside", () => {
    expect(normalizeKnob(0, [0, 1])).toBe(0);
    expect(normalizeKnob(10, [0.1, 10])).toBe(1);
    expect(normalizeKnob(5.05, [0.1, 10])).toBeCloseTo(0.5, 12);
    expect(normalizeKnob(-1, [0, 4])).toBe(-0.25);
  });

  it("reads a range as fine as 0.0001..0.0004 across its whole width", () => {
    // A floor of 0.001 read 0.00025 as 0.15 and the top of the range as 0.3.
    expect(normalizeKnob(0.00025, [0.0001, 0.0004])).toBeCloseTo(0.5, 9);
    expect(normalizeKnob(0.0004, [0.0001, 0.0004])).toBeCloseTo(1, 9);
    expect(normalizeKnob(0.0015, [0.001, 0.002])).toBeCloseTo(0.5, 9);
  });

  it("reads a range edited down to nothing as 0, not NaN", () => {
    expect(normalizeKnob(3, [3, 3])).toBe(0);
  });

  it("starts a knob in the middle of its range, however fine the range", () => {
    expect(knobMidpoint([0, 1])).toBe(0.5);
    expect(knobMidpoint([0.1, 10])).toBe(5.05);
    expect(knobMidpoint([0.0001, 0.0004])).toBe(0.00025);
    expect(knobMidpoint([0.001, 0.002])).toBe(0.0015);
    expect(knobMidpoint([0.1, 0.2])).toBe(0.15);
  });

  it("takes the float noise off a value and keeps its digits", () => {
    expect(tidyKnobValue(0.1 + 0.2)).toBe(0.3);
    expect(tidyKnobValue(0.0001 + 0.00015)).toBe(0.00025);
    expect(tidyKnobValue(5.446)).toBe(5.446);
  });
});

describe("a card's wheel", () => {
  it("moves a knob a 25th of its range a notch and stops at each end", () => {
    expect(knobWheelValue(0.5, [0, 1], 1)).toBe(0.54);
    expect(knobWheelValue(5.05, [0.1, 10], -1)).toBe(4.654);
    expect(knobWheelValue(0.98, [0, 1], 1)).toBe(1);
    expect(knobWheelValue(0.11, [0.1, 10], -1)).toBe(0.1);
  });

  it("crosses a range in 25 notches", () => {
    let value = 0.1;
    for (let notch = 0; notch < 25; notch++) value = knobWheelValue(value, [0.1, 10], 1);
    expect(value).toBe(10);
  });

  it("keeps a range as fine as 0.0001..0.0004 inside its range", () => {
    expect(knobWheelValue(0.00025, [0.0001, 0.0004], 1)).toBe(0.000262);
    expect(knobWheelValue(0.0001, [0.0001, 0.0004], -1)).toBe(0.0001);
  });

  it("leaves a knob on a range edited down to nothing where the range is", () => {
    expect(knobWheelValue(3, [3, 3], 1)).toBe(3);
  });
});

describe("front-panel ids", () => {
  it("finds each knob's range through the logical order (Hue, Speed, Mode, Freq)", () => {
    expect(webKnobRange("c1")).toEqual(LOGICAL_KNOB_RANGES[0]);
    expect(webKnobRange("c2")).toEqual(LOGICAL_KNOB_RANGES[1]);
    expect(webKnobRange("c4")).toEqual(LOGICAL_KNOB_RANGES[2]);
    expect(webKnobRange("c3")).toEqual(LOGICAL_KNOB_RANGES[3]);
  });
});

describe("wrapping", () => {
  it("takes the short way across the seam", () => {
    expect(wrapKnobDelta(0.05 - 0.95)).toBeCloseTo(0.1, 12);
    expect(wrapKnobDelta(0.95 - 0.05)).toBeCloseTo(-0.1, 12);
  });

  it("leaves a move of half a range or less alone", () => {
    expect(wrapKnobDelta(0.3)).toBe(0.3);
    expect(wrapKnobDelta(-0.3)).toBe(-0.3);
    expect(wrapKnobDelta(0.5)).toBe(0.5);
    expect(wrapKnobDelta(-0.5)).toBe(-0.5);
  });

  it("wraps the front-panel knobs that LOGICAL_KNOB_WRAP marks, and only those", () => {
    const wraps = (id: KnobId) => getKnobValueDelta(id, 0.05, 0.95) > 0;
    expect((["c1", "c2", "c3", "c4"] as const).filter(wraps)).toEqual(["c1", "c3"]);
    LOGICAL_KNOB_TO_WEB_KNOB.forEach((id, logicalIndex) => {
      expect(wraps(id)).toBe(LOGICAL_KNOB_WRAP[logicalIndex]);
    });
  });

  it("wraps at half of the span it is given", () => {
    expect(wrapKnobDelta(5 - 355, 360)).toBeCloseTo(10, 12);
    expect(wrapKnobDelta(355 - 5, 360)).toBeCloseTo(-10, 12);
    expect(wrapKnobDelta(7.5, 360)).toBe(7.5);
    expect(wrapKnobDelta(180, 360)).toBe(180);
  });

  it("gives the same clicks by front-panel id as the lab's path gives by logical index", () => {
    const moves: Array<[number, number]> = [
      [0.95, 0.05],
      [0.05, 0.95],
      [0.2, 0.45],
      [0.6, 0.1],
    ];
    LOGICAL_KNOB_TO_WEB_KNOB.forEach((id, logicalIndex) => {
      const range = LOGICAL_KNOB_RANGES[logicalIndex];
      for (const [previous, next] of moves) {
        const byId = toEncoderDelta(range, getKnobValueDelta(id, next, previous));
        const byIndex = knobTargetToDelta(
          previous,
          next,
          LOGICAL_KNOB_WRAP[logicalIndex],
          knobUnitsPerTurn(range),
        );
        expect(byId).toBeCloseTo(byIndex, 9);
      }
    });
  });
});

// Until 22 October 2026 the wrap took every range as 0..1 and turned at ±0.5,
// so a pattern declaring `@knobs Hue=0..360` read one detent (7.5) as 6.5 and
// handed the pattern 0.867 of a click.
describe("a wrapping knob on a range other than 0..1", () => {
  const HUE: [number, number] = [0, 360];
  const perTurn = knobUnitsPerTurn(HUE);
  const clicks = (previous: number, next: number) => knobTargetToDelta(previous, next, true, perTurn);

  it("reads one detent as one click", () => {
    expect(clicks(100, 100 + knobDetentStep(HUE))).toBeCloseTo(1, 12);
    expect(clicks(100, 100 - knobDetentStep(HUE))).toBeCloseTo(-1, 12);
  });

  it("keeps the direction of a move smaller than a detent", () => {
    expect(clicks(100, 100.7)).toBeCloseTo(0.7 / knobDetentStep(HUE), 12);
  });

  it("crosses the seam the short way", () => {
    expect(clicks(355, 5)).toBeCloseTo(10 / knobDetentStep(HUE), 12);
    expect(clicks(5, 355)).toBeCloseTo(-10 / knobDetentStep(HUE), 12);
  });

  it("counts the clicks of a sweep across the whole range, as the Director plays one", () => {
    const frames = 120;
    let total = 0;
    for (let frame = 0; frame < frames; frame++) {
      total += clicks((frame / frames) * 360, ((frame + 1) / frames) * 360);
    }
    expect(total).toBeCloseTo(TURNS_PER_FULL_RANGE * DETENTS_PER_TURN, 9);
    // Looping back to the start lands where it began: no clicks at all.
    expect(clicks(360, 0)).toBeCloseTo(0, 12);
  });

  it("does the same on a range that does not start at 0", () => {
    const range: [number, number] = [-20, 20];
    const step = knobDetentStep(range);
    expect(knobTargetToDelta(3, 3 + step, true, knobUnitsPerTurn(range))).toBeCloseTo(1, 12);
    expect(knobTargetToDelta(19, -19, true, knobUnitsPerTurn(range))).toBeCloseTo(2 / step, 9);
  });

  it("hands the Lab's pattern one click for each detent on knobs 1 and 4", () => {
    // The pattern counts the clicks it is handed on knobs 1 and 4 and writes
    // five times each count into pixel (0, 0), so 24 clicks read 120.
    const code = `
      function update(dt, input, params) {
        params.a = (params.a || 0) + input.knobDeltas[0];
        params.b = (params.b || 0) + input.knobDeltas[3];
      }
      function draw(display, params) {
        display.setPixel(0, 0, (params.a || 0) * 5, (params.b || 0) * 5, 0);
      }
    `;
    const layer: CodeLayer = {
      id: "count",
      type: "code",
      name: "count",
      visible: true,
      opacity: 1,
      blend: "normal",
      role: "paint",
      maskInvert: false,
      code,
      ramp: cloneRampState(DEFAULT_RAMP_STATE),
      recolor: false,
      knobsAnnotationRaw: null,
      matrixAnnotationRaw: null,
    };
    const ranges: Array<[number, number]> = [HUE, [0.1, 10], [0, 4.9], [0, 100]];
    const engine = new LabEngine();
    const at = (knob1: number, knob4: number) =>
      engine.render(
        { matrix: { width: 1, height: 1 }, layers: [layer], activeLayerId: layer.id, knobs: [knob1, 2, 0, knob4], ranges },
        1 / 60,
        0,
      ).data;
    at(0, 0);
    let frame = at(0, 0);
    for (let detent = 1; detent <= DETENTS_PER_TURN; detent++) {
      frame = at(detent * knobDetentStep(HUE), detent * knobDetentStep(ranges[3]));
    }
    expect(Array.from(frame.subarray(0, 2))).toEqual([DETENTS_PER_TURN * 5, DETENTS_PER_TURN * 5]);
  });
});

describe("the 3D device's knobs on a pattern's own ranges", () => {
  const code = "// @knobs Rings=0..1, Speed=-10..10, -, Palette=0..360\nexport function draw() {}";

  it("takes each range the @knobs line declares and the default for the rest", () => {
    expect(codeKnobRanges(code)).toEqual([[0, 1], [-10, 10], LOGICAL_KNOB_RANGES[2], [0, 360]]);
  });

  it("falls back to the defaults without a line", () => {
    expect(codeKnobRanges("export function draw() {}")).toEqual(LOGICAL_KNOB_RANGES);
    expect(codeKnobRanges(null)).toEqual(LOGICAL_KNOB_RANGES);
  });

  it("turns Speed below zero when the pattern declares it", () => {
    const speed = codeKnobRanges(code)[1];
    expect(holdKnobValue(-9.5, speed, LOGICAL_KNOB_WRAP[1])).toBe(-9.5);
    expect(holdKnobValue(-12, speed, LOGICAL_KNOB_WRAP[1])).toBe(-10);
    expect(holdKnobValue(-3, LOGICAL_KNOB_RANGES[1], LOGICAL_KNOB_WRAP[1])).toBe(0.1);
  });

  it("wraps knobs 1 and 4 round their own range", () => {
    expect(holdKnobValue(1.25, [0, 1], true)).toBeCloseTo(0.25);
    expect(holdKnobValue(-0.25, [0, 1], true)).toBeCloseTo(0.75);
    expect(holdKnobValue(370, [0, 360], true)).toBeCloseTo(10);
    expect(holdKnobValue(-5, [10, 20], true)).toBeCloseTo(15);
  });

  it("turns the defaults exactly as the old fixed rules did", () => {
    for (const v of [-0.3, 0.2, 1.7]) expect(holdKnobValue(v, [0, 1], true)).toBeCloseTo(((v % 1) + 1) % 1);
    expect(holdKnobValue(11, LOGICAL_KNOB_RANGES[1], false)).toBe(10);
    expect(holdKnobValue(5.2, LOGICAL_KNOB_RANGES[2], false)).toBe(4.9);
  });

  it("reads a wrapping knob's step across the seam of its own range", () => {
    expect(getKnobValueDelta("c1", 5, 355, [0, 360])).toBeCloseTo(10);
  });
});
