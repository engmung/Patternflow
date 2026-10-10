import * as THREE from 'three';
import type { CasePart, PartRole } from './heroCase';

// What the product preview shows of the device at each of the Build panel's
// four steps, and idle: which parts, how far apart, from where, lit or not.
// HeroScene eases the device toward the pose for the step the reader is on.

/**
 * Solder's turn: to the back, at an angle, so the DevKit on its sockets faces
 * the reader and the encoders' shafts stand out past the board's edge, and
 * both sides of what is soldered read in one view.
 */
const BOARD_TURN = Math.PI - 0.8;

/** The scale the device rests at: idle, and lit on Flash. */
export const REST_SCALE = 0.1;

/**
 * At most this much of the view's width, the device at rest: what keeps it
 * clear of the arrows either side (HeroScene).
 */
const FIT_ACROSS = 0.72;

/** What each Build step shows. */
export interface Pose {
  /** The device's turn about the vertical, radians, and its scale. */
  turn: number;
  scale: number;
  /** A small drift up and down, world units (the idle sway). */
  lift: number;
  /** How far the parts stand apart, as a fraction of each one's explode vector. */
  spread: number;
  show: Record<PartRole, boolean>;
  /** The case's loose pieces (CaseModel.loose) are out too: the parts are being made or put together. */
  loose: boolean;
  /** Frame the board instead of the whole device. */
  board: boolean;
  /** The LED panel is lit (the device has power). */
  lit: boolean;
}

const ALL: Record<PartRole, boolean> = { shell: true, knob: true, led: true, pcb: true, devkit: true };
const CASE_ONLY: Record<PartRole, boolean> = { shell: true, knob: true, led: false, pcb: false, devkit: false };
const BOARD_ONLY: Record<PartRole, boolean> = { shell: false, knob: false, led: false, pcb: true, devkit: true };

/** The pose for a Build step (0 is none: idle), the Assemble slider's spread and the clock. */
export function poseFor(step: number, explode: number, t: number): Pose {
  switch (step) {
    // 1. Print / cut the case: its parts and the knobs, drawn a little apart
    // so it reads as parts to make, nothing inside yet.
    case 1:
      return { turn: -0.5, scale: 0.085, lift: 0, spread: 0.4, show: CASE_ONLY, loose: true, board: false, lit: false };
    // 2. Solder: the board and the DevKit alone, close. (Its scale comes from
    // the board's size in the model, HeroScene's BOARD_SPAN, so it is left 0 here.)
    case 2:
      return { turn: BOARD_TURN, scale: 0, lift: 0, spread: 0, show: BOARD_ONLY, loose: false, board: true, lit: false };
    // 3. Assemble: everything, as far apart as the reader has dragged it.
    // The view pulls back as the parts separate, rather than snapping between
    // two framings — the reader is dragging this, so it has to track the drag.
    case 3:
      return {
        turn: -0.5,
        scale: THREE.MathUtils.lerp(0.11, 0.075, explode),
        lift: 0,
        spread: explode,
        show: ALL,
        loose: true,
        board: false,
        lit: false,
      };
    // 4. Flash and power on: together, lit.
    case 4:
      return { turn: -0.5, scale: REST_SCALE, lift: 0, spread: 0, show: ALL, loose: false, board: false, lit: true };
    // Idle: together, lit, swaying slowly.
    default:
      return {
        turn: Math.sin(t * 0.15) * 0.45,
        scale: REST_SCALE,
        lift: Math.sin(t * 0.3) * 0.03,
        spread: 0,
        show: ALL,
        loose: false,
        board: false,
        lit: true,
      };
  }
}

/**
 * How much smaller than its pose's scale a device is drawn, so it fits across
 * the view: 1 for a device that already does. Every case is drawn at the one
 * scale, so the LED panel is the same size in each, wherever that fits: on a
 * phone all four do, and on a desktop's tall view the three that stand
 * upright do, 25 to 27 cm across. mbchars' case lies the long way, 41 cm
 * across, and on a tall view it would run off both sides, under the arrows;
 * there it is drawn smaller, by as little as keeps it clear of them.
 *
 * `width` is the device's, assembled, in model units (PreparedCase.width);
 * `viewWidth` the view's width at rest where the device stands, in world
 * units: at rest, not as zoomed, since zooming in on a device must not
 * shrink it.
 */
export function fitAcross(width: number, viewWidth: number): number {
  return Math.min(1, (FIT_ACROSS * viewWidth) / (width * REST_SCALE));
}

/** Whether a pose has a part out: its kind of part, and if it is a loose piece, loose pieces too. */
export function shows(pose: Pick<Pose, 'show' | 'loose'>, part: Pick<CasePart, 'role' | 'loose'>): boolean {
  return pose.show[part.role] && (pose.loose || !part.loose);
}
