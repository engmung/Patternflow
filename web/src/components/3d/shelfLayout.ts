// Where everything on the Build tab's shelf goes, as plain numbers: no
// three.js, so it can be tested. CaseShelf.tsx draws what this returns.
//
// The shelf is two boards, one over the other, with the cases standing on
// them at one scale, so a case that is wider or taller in the hand is wider
// or taller on the shelf. The first cases stand on the top board and the rest
// on the bottom one. The whole is sized to the view it is drawn in: a tall
// desktop column fits it by its width, a phone's wide frame by its height.

/** A case's box, in model units (one is 10 mm). */
export interface ShelfItem<Id extends string = string> {
  id: Id;
  width: number;
  height: number;
  depth: number;
}

/** Where a case stands, in world units: the middle of its underside. `tier` is the board it is on. */
export interface ShelfSlot<Id extends string = string> {
  id: Id;
  tier: number;
  x: number;
  y: number;
}

/** A board: the middle of its top face, and its size, in world units. */
export interface ShelfBoard {
  y: number;
  width: number;
  depth: number;
  thickness: number;
}

export interface ShelfPlan<Id extends string = string> {
  /** World units per model unit: every case on the shelf is drawn at this. */
  scale: number;
  slots: ShelfSlot<Id>[];
  /** Top board first. */
  boards: ShelfBoard[];
  width: number;
  height: number;
}

// In model units.
const GAP = 3.5;          // between two cases on a board
const OVERHANG = 2.5;     // a board past the outermost case, each side
const HEADROOM = 4;       // over the tallest case on the bottom board, under the top one
const THICKNESS = 1;      // a board
const DEPTH_MARGIN = 3;   // a board past the deepest case, front and back together

/** The cases never stand larger than this: 6 mm to the world unit, where the device alone is 10. */
export const SHELF_MAX_SCALE = 0.06;
/** How much of the view the shelf may take, across and up. The top of the frame is the hint's. */
const FILL_ACROSS = 0.9;
const FILL_UP = 0.74;

/** How many of `count` cases stand on the top board: the larger half. */
export const onTopBoard = (count: number) => Math.ceil(count / 2);

/**
 * The shelf for `items`, in order, in a view `viewWidth` by `viewHeight`
 * world units, with its middle at `centreY`.
 */
export function planShelf<Id extends string>(
  items: ShelfItem<Id>[],
  viewWidth: number,
  viewHeight: number,
  centreY: number,
): ShelfPlan<Id> {
  const top = items.slice(0, onTopBoard(items.length));
  const bottom = items.slice(top.length);
  const tiers = [top, bottom].filter((tier) => tier.length > 0);

  const across = (tier: ShelfItem[]) => tier.reduce((sum, item) => sum + item.width, 0) + GAP * (tier.length - 1);
  const tallest = (tier: ShelfItem[]) => Math.max(...tier.map((item) => item.height));
  const boardWidth = Math.max(...tiers.map(across)) + OVERHANG * 2;
  const boardDepth = Math.max(...items.map((item) => item.depth)) + DEPTH_MARGIN;
  // From the underside of the bottom board to the top of the tallest case on
  // the top one.
  const rackHeight =
    tiers.reduce((sum, tier) => sum + THICKNESS + tallest(tier), 0) + HEADROOM * (tiers.length - 1);

  const scale = Math.min(
    SHELF_MAX_SCALE,
    (viewWidth * FILL_ACROSS) / boardWidth,
    (viewHeight * FILL_UP) / rackHeight,
  );

  const slots: ShelfSlot<Id>[] = [];
  const boards: ShelfBoard[] = [];
  // Built from the bottom board up, then listed top first.
  let y = centreY - (rackHeight * scale) / 2 + THICKNESS * scale;
  [...tiers].reverse().forEach((tier, fromBottom) => {
    const index = tiers.length - 1 - fromBottom;
    boards.unshift({ y, width: boardWidth * scale, depth: boardDepth * scale, thickness: THICKNESS * scale });
    let x = -across(tier) / 2;
    for (const item of tier) {
      slots.push({ id: item.id, tier: index, x: (x + item.width / 2) * scale, y });
      x += item.width + GAP;
    }
    y += (tallest(tier) + HEADROOM + THICKNESS) * scale;
  });
  // In the order the items came in.
  slots.sort((a, b) => items.findIndex((i) => i.id === a.id) - items.findIndex((i) => i.id === b.id));

  return { scale, slots, boards, width: boardWidth * scale, height: rackHeight * scale };
}

// --- Moving between the shelf and the stage ---------------------------------

/** Seconds a picked case takes from its place on the shelf to the stage, and back. */
export const FLY_SECONDS = 0.6;
/** Seconds the other cases and the boards take to leave, and to come back. */
export const CLEAR_SECONDS = 0.35;
/** Seconds a light model takes to fade away over its full model. */
export const HANDOFF_SECONDS = 0.28;

/**
 * A value walked towards 0 or 1 at a steady rate: `seconds` for the whole
 * way. A `delta` of Infinity is there in one step.
 */
export function walk(value: number, towards: 0 | 1, delta: number, seconds: number): number {
  // Never out of 0 to 1, whatever the clock says: a frame timed backwards
  // (a clock set back under the page) would otherwise walk the value off
  // below zero, from where it does not come back.
  const from = Math.min(1, Math.max(0, value));
  const step = Math.max(0, delta) / seconds;
  return towards === 1 ? Math.min(1, from + step) : Math.max(0, from - step);
}

/** Slow out of one end and slow into the other: 0 to 1, flat at both. */
export const glide = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
