import { describe, expect, it } from 'vitest';
import {
  DOT_MIN_PX,
  DOT_RADIUS,
  DRIFT_SPEED,
  GROW_DELAY,
  GROW_SECONDS,
  MAX_SPIN,
  TURN_EASE,
  dotRadius,
  dragSpeed,
  easeShare,
  grownShare,
  grownVertices,
  releaseSpin,
  stepDrift,
  trackSpin,
  wrapAngle,
} from './globeMotion';

// The globe's motion as numbers. The frame loop in Globe.tsx stepped a picked
// place round by 8% of what was left each frame, so the turn took half as
// long on a 120 Hz phone as on a 60 Hz screen, and twice as long at 30.

/** How far a turn of 1 has come after `seconds`, stepped at `hz` frames a second. */
function turned(seconds: number, hz: number, share: (delta: number) => number) {
  let left = 1;
  for (let frame = 0; frame < Math.round(seconds * hz); frame += 1) left -= left * share(1 / hz);
  return 1 - left;
}

describe('a picked place coming round', () => {
  it('is as far round after half a second at 30, 60 and 120 Hz', () => {
    const at = [30, 60, 120].map((hz) => turned(0.5, hz, (delta) => easeShare(TURN_EASE, delta)));
    expect(at[0]).toBeCloseTo(at[1], 6);
    expect(at[2]).toBeCloseTo(at[1], 6);
    expect(at[1]).toBeCloseTo(1 - Math.exp(-TURN_EASE * 0.5), 6);
  });

  it('keeps the turn a 60 Hz screen had', () => {
    expect(easeShare(TURN_EASE, 1 / 60)).toBeCloseTo(0.08, 2);
  });

  it('was a different turn at each rate with a fixed share a frame', () => {
    const fixed = () => 0.08;
    expect(turned(0.5, 120, fixed) - turned(0.5, 30, fixed)).toBeGreaterThan(0.25);
  });

  it('takes the short way round', () => {
    expect(wrapAngle(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2, 9);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('a drag', () => {
  it('turns the globe one radian for one radius of drag', () => {
    expect(dragSpeed(120) * 120).toBeCloseTo(1, 9);   // a 390px phone's globe
    expect(dragSpeed(224) * 224).toBeCloseTo(1, 9);   // 1440×900
  });

  it('stays in bounds on a globe that is tiny or not measured yet', () => {
    expect(dragSpeed(0)).toBe(0.012);
    expect(dragSpeed(10)).toBe(0.012);
    expect(dragSpeed(2000)).toBe(0.003);
  });

  it('remembers how fast the hand was turning it', () => {
    let spin = 0;
    // 2 radians a second for a quarter of a second, at 60 Hz.
    for (let frame = 0; frame < 15; frame += 1) spin = trackSpin(spin, 2 / 60, 1 / 60);
    expect(spin).toBeGreaterThan(1.9);
    expect(spin).toBeLessThanOrEqual(2);
  });

  it('forgets it when the hand stops before letting go', () => {
    let spin = 2;
    for (let frame = 0; frame < 12; frame += 1) spin = trackSpin(spin, 0, 1 / 60);   // 0.2 s still
    expect(Math.abs(spin)).toBeLessThan(0.02);
  });

  it('follows the hand the same at 30 and 120 Hz', () => {
    const after = (hz: number) => {
      let spin = 0;
      for (let frame = 0; frame < hz / 10; frame += 1) spin = trackSpin(spin, 2 / hz, 1 / hz);
      return spin;
    };
    expect(after(30)).toBeCloseTo(after(120), 6);
  });

  it('hands a flick to the drift, up to a turn in under two seconds', () => {
    expect(releaseSpin(1.2)).toBe(1.2);
    expect(releaseSpin(40)).toBe(MAX_SPIN);
    expect(releaseSpin(-40)).toBe(-MAX_SPIN);
    expect((2 * Math.PI) / MAX_SPIN).toBeLessThan(2);
  });
});

describe('the drift', () => {
  const run = (from: number, held: boolean, seconds: number, hz = 60) => {
    let drift = from;
    for (let frame = 0; frame < seconds * hz; frame += 1) drift = stepDrift(drift, held, false, 1 / hz);
    return drift;
  };

  it('runs a flick down into the idle drift', () => {
    expect(run(3, false, 0.25)).toBeGreaterThan(1.5);          // still plainly turning
    expect(run(3, false, 3)).toBeCloseTo(DRIFT_SPEED, 2);     // and then idling
  });

  it('comes back round from a flick against it', () => {
    expect(run(-2, false, 0.2)).toBeLessThan(0);
    expect(run(-2, false, 4)).toBeCloseTo(DRIFT_SPEED, 2);
  });

  it('dies away under a hand', () => {
    expect(run(DRIFT_SPEED, true, 0.6)).toBeLessThan(0.002);
  });

  it('is none at all for less motion, whatever a flick left', () => {
    expect(stepDrift(3, false, true, 1 / 60)).toBe(0);
  });
});

describe('the links growing', () => {
  it('waits a fifth of a second and is whole 1.4 seconds after that', () => {
    expect(grownShare(0)).toBe(0);
    expect(grownShare(GROW_DELAY)).toBe(0);
    expect(grownShare(GROW_DELAY + GROW_SECONDS / 2)).toBeCloseTo(0.875, 9);
    expect(grownShare(GROW_DELAY + GROW_SECONDS)).toBe(1);
    expect(grownShare(60)).toBe(1);
  });

  it('never goes back', () => {
    let last = 0;
    for (let ms = 0; ms <= 2000; ms += 16) {
      const share = grownShare(ms / 1000);
      expect(share).toBeGreaterThanOrEqual(last);
      last = share;
    }
  });

  it('draws the same share of every link: two vertices a segment, a link at a time', () => {
    expect(grownVertices(40, 96, 0)).toBe(0);
    expect(grownVertices(40, 96, 0.5)).toBe(40 * 2 * 48);
    expect(grownVertices(40, 96, 1)).toBe(40 * 2 * 96);
    expect(grownVertices(40, 96, 0.5) % (40 * 2)).toBe(0);
    expect(grownVertices(0, 96, 1)).toBe(0);
    expect(grownVertices(40, 96, 7)).toBe(40 * 2 * 96);
  });
});

describe('a dot on a link', () => {
  it('is the size it was where the globe is drawn large', () => {
    expect(dotRadius(400)).toBe(DOT_RADIUS);
  });

  it('is at least 2.2px across on a phone, where it was 1px', () => {
    const phone = 96;   // px per unit at 390×371
    expect(DOT_RADIUS * phone * 2).toBeLessThan(1);
    expect(dotRadius(phone) * phone * 2).toBeCloseTo(DOT_MIN_PX * 2, 9);
  });
});
