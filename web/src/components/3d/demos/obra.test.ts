import { describe, expect, it } from 'vitest';
import { ObraDemo } from './obra';
import type { KnobValues } from '@/lib/pattern/controls';

// Obra, Patternflood's demo, as the preview runs it: a 128 x 128 picture,
// lit where the solid is, its knobs stepping what they step on the device,
// and four knob lights.

const still: KnobValues = { c1: 0, c2: 2, c3: 0, c4: 0.06 };

function frame(demo: ObraDemo, knobs: KnobValues = still, prev: KnobValues = still) {
  demo.render(1 / 60, knobs, prev);
  return demo.texture.image.data as Uint8Array;
}

const lit = (data: Uint8Array) => {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 300) n++;
  return n;
};

describe('Obra', () => {
  it('draws a 128 x 128 picture with the solid lit in the middle', () => {
    const demo = new ObraDemo();
    const data = frame(demo);
    expect(demo.texture.image.width).toBe(128);
    expect(demo.texture.image.height).toBe(128);
    expect(lit(data)).toBeGreaterThan(500);
    // The middle is the solid, the corners the paper.
    const at = (x: number, y: number) => {
      const o = ((127 - y) * 128 + x) * 4;
      return data[o] + data[o + 1] + data[o + 2];
    };
    expect(at(0, 0)).toBeLessThan(60);
    let middle = 0;
    for (let y = 54; y < 74; y++) for (let x = 54; x < 74; x++) middle = Math.max(middle, at(x, y));
    expect(middle).toBeGreaterThan(300);
  });

  it('changes the inks when k3 is turned a click, and the screen when k2 is', () => {
    const demo = new ObraDemo();
    const before = frame(demo).slice();
    const lights = demo.lights();
    // k3 is the web knob c3; one click of its range.
    const inks = frame(demo, { ...still, c3: 0.3 }, still);
    expect(demo.lights()[3]).not.toEqual(lights[3]);
    expect(inks).not.toEqual(before);
    // k2 (web knob c4) a click: a different screen, so a different picture.
    const a = frame(demo).slice();
    const b = frame(demo, { ...still, c4: 1.5 }, still);
    expect(b).not.toEqual(a);
  });

  it('lights its four knobs, each a colour in 0..1', () => {
    const demo = new ObraDemo();
    frame(demo);
    const lights = demo.lights();
    expect(lights).toHaveLength(4);
    for (const c of lights) {
      expect(c).toHaveLength(3);
      for (const v of c) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
