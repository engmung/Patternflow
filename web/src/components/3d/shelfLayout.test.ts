import { describe, expect, it } from 'vitest';
import {
  CLEAR_SECONDS,
  FLY_SECONDS,
  SHELF_MAX_SCALE,
  glide,
  onTopBoard,
  planShelf,
  walk,
  type ShelfItem,
} from './shelfLayout';

// The Build tab's shelf as numbers: five cases on two boards, at one scale,
// sized to the view. The boxes are the five models' own (model units, 10 mm):
// the three that stand upright, mbchars' lying the long way, and jof's box.

const CASES: ShelfItem[] = [
  { id: 'official', width: 24.7, height: 32.6, depth: 5.6 },
  { id: 'besoiobiy', width: 26.7, height: 32.9, depth: 5.7 },
  { id: 'simonepda', width: 25.6, height: 34, depth: 5.4 },
  { id: 'mbchars', width: 41, height: 19.4, depth: 11.4 },
  { id: 'jof', width: 30, height: 37.9, depth: 7.9 },
];

// The view where the device stands, in world units: 5.565 tall, and as wide
// as the frame's shape makes it. A desktop's column is taller than wide; a
// phone's frame is a little wider than tall.
const DESKTOP = { width: 5.565 * (691 / 900), height: 5.565 };
const PHONE = { width: 5.565 * (390 / 371), height: 5.565 };
const CENTRE = 1.45;

const plan = (view: { width: number; height: number }, items = CASES) =>
  planShelf(items, view.width, view.height, CENTRE);

describe('the shelf', () => {
  it('stands the first three cases on the top board and the other two on the bottom one', () => {
    expect(onTopBoard(5)).toBe(3);
    const { slots, boards } = plan(DESKTOP);
    expect(boards).toHaveLength(2);
    expect(slots.map((s) => s.tier)).toEqual([0, 0, 0, 1, 1]);
    expect(slots.map((s) => s.id)).toEqual(CASES.map((c) => c.id));
    // Each on its own board's top face.
    for (const slot of slots) expect(slot.y).toBe(boards[slot.tier].y);
    expect(boards[0].y).toBeGreaterThan(boards[1].y);
  });

  it('keeps every case at one scale, left to right, with room between', () => {
    const { slots, scale } = plan(DESKTOP);
    for (const tier of [0, 1]) {
      const row = slots.filter((s) => s.tier === tier);
      for (let i = 1; i < row.length; i += 1) {
        const left = CASES.find((c) => c.id === row[i - 1].id)!;
        const right = CASES.find((c) => c.id === row[i].id)!;
        const gap = row[i].x - (right.width / 2) * scale - (row[i - 1].x + (left.width / 2) * scale);
        expect(gap).toBeGreaterThan(0.1);
      }
      // A row is centred on the board.
      const first = CASES.find((c) => c.id === row[0].id)!;
      const last = CASES.find((c) => c.id === row[row.length - 1].id)!;
      const leftEdge = row[0].x - (first.width / 2) * scale;
      const rightEdge = row[row.length - 1].x + (last.width / 2) * scale;
      expect(leftEdge + rightEdge).toBeCloseTo(0, 9);
    }
  });

  it('clears the top board with the tallest case under it', () => {
    const { slots, boards, scale } = plan(DESKTOP);
    const under = slots.filter((s) => s.tier === 1);
    const tallest = Math.max(...under.map((s) => CASES.find((c) => c.id === s.id)!.height));
    const underside = boards[0].y - boards[0].thickness;
    expect(boards[1].y + tallest * scale).toBeLessThan(underside);
  });

  it('fits a desktop column by its width and a phone frame by its height', () => {
    const desktop = plan(DESKTOP);
    const phone = plan(PHONE);
    expect(desktop.width).toBeCloseTo(DESKTOP.width * 0.9, 6);
    expect(desktop.height).toBeLessThan(DESKTOP.height * 0.74);
    expect(phone.height).toBeCloseTo(PHONE.height * 0.74, 6);
    expect(phone.width).toBeLessThan(PHONE.width * 0.9);
    // The phone's frame is the roomier of the two.
    expect(phone.scale).toBeGreaterThan(desktop.scale);
  });

  it('stands in the middle of the view, about the height it was given', () => {
    const { boards, slots, scale, height } = plan(PHONE);
    const bottom = boards[1].y - boards[1].thickness;
    const top = Math.max(...slots.filter((s) => s.tier === 0).map((s) => s.y + CASES.find((c) => c.id === s.id)!.height * scale));
    expect(top - bottom).toBeCloseTo(height, 6);
    expect((top + bottom) / 2).toBeCloseTo(CENTRE, 6);
  });

  it('never draws a case larger than six tenths of the device alone', () => {
    const wide = planShelf(CASES, 40, 40, CENTRE);
    expect(wide.scale).toBe(SHELF_MAX_SCALE);
    expect(SHELF_MAX_SCALE).toBeLessThan(0.1);
  });

  it('is one board for one case, and still a shelf for two', () => {
    const one = plan(DESKTOP, CASES.slice(0, 1));
    expect(one.boards).toHaveLength(1);
    expect(one.slots).toEqual([{ id: 'official', tier: 0, x: 0, y: one.boards[0].y }]);
    const two = plan(DESKTOP, CASES.slice(0, 2));
    expect(two.slots.map((s) => s.tier)).toEqual([0, 1]);
  });
});

describe('moving between the shelf and the stage', () => {
  it('takes the same time at 30 and 120 frames a second', () => {
    const frames = (hz: number) => {
      let value = 0;
      let count = 0;
      while (value < 1) {
        value = walk(value, 1, 1 / hz, FLY_SECONDS);
        count += 1;
      }
      return count / hz;
    };
    expect(frames(30)).toBeCloseTo(FLY_SECONDS, 1);
    expect(frames(120)).toBeCloseTo(FLY_SECONDS, 1);
  });

  it('stops at either end, and is there at once with no time to take', () => {
    expect(walk(0.9, 1, 1, CLEAR_SECONDS)).toBe(1);
    expect(walk(0.1, 0, 1, CLEAR_SECONDS)).toBe(0);
    expect(walk(0, 1, Infinity, FLY_SECONDS)).toBe(1);
    expect(walk(1, 0, Infinity, FLY_SECONDS)).toBe(0);
  });

  it('stays between its ends when a frame is timed backwards', () => {
    expect(walk(0.4, 1, -5, FLY_SECONDS)).toBe(0.4);
    expect(walk(0.4, 0, -5, FLY_SECONDS)).toBe(0.4);
    expect(walk(-3, 1, 0.06, FLY_SECONDS)).toBeCloseTo(0.1, 9);
    expect(walk(7, 0, 0.06, FLY_SECONDS)).toBeCloseTo(0.9, 9);
  });

  it('leaves and lands without a jolt', () => {
    expect(glide(0)).toBe(0);
    expect(glide(1)).toBe(1);
    expect(glide(0.5)).toBeCloseTo(0.5, 9);
    // Flat at both ends: the first and last hundredth cover next to nothing.
    expect(glide(0.01)).toBeLessThan(0.0001);
    expect(1 - glide(0.99)).toBeLessThan(0.0001);
    expect(glide(-1)).toBe(0);
    expect(glide(2)).toBe(1);
  });
});
