import { describe, expect, it } from 'vitest';
import { REST_SCALE, fitAcross, poseFor, shows } from './buildPose';
import type { PartRole } from './heroCase';

// What the preview shows at each Build step: the case's loose pieces (a
// case's feet, CaseModel.loose) come out with the parts to make and on
// Assemble, and stay off the device standing and lit.

const piece = (role: PartRole, loose = false) => ({ role, loose });
const STEPS = { idle: 0, print: 1, solder: 2, assemble: 3, power: 4 };

describe('poseFor and shows', () => {
  it('has the loose pieces out while the case is made and put together', () => {
    for (const step of [STEPS.print, STEPS.assemble]) {
      expect(shows(poseFor(step, 1, 0), piece('shell', true)), `step ${step}`).toBe(true);
    }
  });

  it('keeps them off the device once it is powered, and off the board', () => {
    for (const step of [STEPS.idle, STEPS.solder, STEPS.power]) {
      expect(shows(poseFor(step, 1, 0), piece('shell', true)), `step ${step}`).toBe(false);
    }
  });

  it('leaves every other part to its step', () => {
    for (const step of Object.values(STEPS)) {
      const pose = poseFor(step, 1, 0);
      for (const role of ['shell', 'knob', 'led', 'pcb', 'devkit'] as const) {
        expect(shows(pose, piece(role)), `step ${step}, ${role}`).toBe(pose.show[role]);
      }
    }
    expect(shows(poseFor(STEPS.solder, 1, 0), piece('shell'))).toBe(false);
    expect(shows(poseFor(STEPS.power, 1, 0), piece('led'))).toBe(true);
  });

  it('lights the panel only once the device has power', () => {
    expect(Object.values(STEPS).filter((step) => poseFor(step, 1, 0).lit)).toEqual([STEPS.idle, STEPS.power]);
  });
});

describe('poseFor at idle', () => {
  const TIMES = [0, 5, 10.5, 21, 30, 600];

  it('sways the device by itself', () => {
    const turns = TIMES.map((t) => poseFor(STEPS.idle, 0, t).turn);
    expect(new Set(turns).size).toBe(TIMES.length);
    expect(Math.max(...turns.map(Math.abs))).toBeLessThanOrEqual(0.45);
  });

  it('holds it still, facing the reader, for someone who has asked for less motion', () => {
    for (const t of TIMES) {
      const pose = poseFor(STEPS.idle, 0, t, true);
      expect(pose.turn, `turn at ${t}s`).toBe(0);
      expect(pose.lift, `lift at ${t}s`).toBe(0);
    }
  });

  it('leaves the Build steps as they were', () => {
    for (const step of [STEPS.print, STEPS.solder, STEPS.assemble, STEPS.power]) {
      expect(poseFor(step, 0.6, 12, true), `step ${step}`).toEqual(poseFor(step, 0.6, 12));
    }
  });
});

describe('fitAcross', () => {
  // The view's height at rest where the device stands (HeroScene: fov 28°,
  // the camera at (0, 6, 10.3) on the target (0, 1.7, 0)), and its width on
  // the two layouts the screenshots were taken on: 1440 × 900, the preview
  // 690 × 900 beside the panel, and a 390 px phone, 390 × 372 over it.
  const VIEW_HEIGHT = 2 * Math.tan((14 * Math.PI) / 180) * Math.hypot(6 - 1.7, 10.3);
  const DESKTOP = VIEW_HEIGHT * (690 / 900);
  const PHONE = VIEW_HEIGHT * (390 / 372);
  // Each case's device across, model units, as tools/case-models builds it.
  const UPRIGHT = { official: 24.679, 'besoiobiy-printed': 26.701, 'simonepda-lasercut': 25.599 };
  const HORIZONTAL = 41.028;

  it('keeps every case at the one scale wherever it fits', () => {
    for (const width of [...Object.values(UPRIGHT), HORIZONTAL]) {
      expect(fitAcross(width, PHONE), `${width} on a phone`).toBe(1);
    }
    for (const [id, width] of Object.entries(UPRIGHT)) {
      expect(fitAcross(width, DESKTOP), `${id} on a desktop`).toBe(1);
    }
  });

  it('draws the long case smaller on a tall view, by as little as keeps it clear of the arrows', () => {
    const fit = fitAcross(HORIZONTAL, DESKTOP);
    expect(fit).toBeLessThan(1);
    expect(fit).toBeGreaterThan(0.7);
    // At rest it takes 72% of the view's width, no more and no less.
    expect((HORIZONTAL * REST_SCALE * fit) / DESKTOP).toBeCloseTo(0.72, 9);
  });
});

describe('a boardless build', () => {
  it('cuts and glues its sheets, drawn apart then closing up, nothing bought among them', () => {
    const cut = poseFor(1, 0.6, 12, false, true);
    const glue = poseFor(2, 0.6, 12, false, true);
    for (const pose of [cut, glue]) {
      expect(pose.show).toEqual({ shell: true, knob: false, led: false, pcb: false, devkit: false, gear: false, cover: true });
      expect(pose.lit).toBe(false);
      expect(pose.board).toBe(false);
      expect(pose.turn).toBeLessThan(0);
    }
    // The slider draws them apart: all the way on Cut, half as far on Glue.
    expect(cut.spread).toBe(0.6);
    expect(glue.spread).toBeCloseTo(0.27, 9);
    expect(poseFor(1, 0, 12, false, true).spread).toBe(0);
    expect(poseFor(1, 1, 12, false, true).scale).toBeLessThan(poseFor(1, 0, 12, false, true).scale);
  });

  it('is wired from the back, its cover off, and faces the front again once it is lit', () => {
    const wire = poseFor(3, 0.6, 12, false, true);
    expect(Math.cos(wire.turn)).toBeLessThan(-0.5);
    expect(wire.show.cover).toBe(false);
    expect(wire.show.gear).toBe(true);
    expect(wire.spread).toBe(0);
    const lit = poseFor(4, 0.6, 12, false, true);
    expect(Math.cos(lit.turn)).toBeGreaterThan(0.5);
    expect(lit.lit).toBe(true);
    expect(lit).toEqual(poseFor(4, 0.6, 12));
    expect(poseFor(0, 0.6, 12, false, true)).toEqual(poseFor(0, 0.6, 12));
  });
});
