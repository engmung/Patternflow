// How the globe moves, as plain numbers: no three.js, so it can be tested.
// Globe.tsx calls these from its frame loop.

/**
 * Frame-rate independent easing: the share of the remaining distance to cover
 * in a frame of `delta` seconds, at `rate` a second.
 */
export const easeShare = (rate: number, delta: number) => 1 - Math.exp(-rate * delta);

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The equivalent angle in (-π, π], so easing towards a heading always takes the
 * short way round instead of unwinding the long way.
 */
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

// How fast a picked place comes round to the front and the camera closes in
// on it (1/seconds). It was 8% of what was left each frame, which is a speed
// at one refresh rate only: 90% of the way took 0.46 s at 60 Hz, 0.23 s at
// 120 Hz, the rate of most new phones, and 0.92 s at 30. 5 a second is the
// 60 Hz turn at every rate.
export const TURN_EASE = 5;

export const DRIFT_SPEED = 0.18;   // radians per second, idle; none with less motion
// The most a flick leaves the globe with: a turn in under two seconds.
export const MAX_SPIN = 3.5;
// How fast the drift dies under a hand, and how fast it comes back (1/seconds).
const DRIFT_HOLD_EASE = 9;
const DRIFT_FREE_EASE = 2.5;
// How fast the remembered spin of a drag follows the hand (1/seconds).
const SPIN_TRACK_EASE = 26;

/**
 * The spin of a drag, in radians a second, followed frame by frame: `dYaw` is
 * how far the hand turned the globe in the last `delta` seconds. Smoothed, so
 * one fast event does not set it, and a hand that has stopped before it lets
 * go leaves next to nothing: a tenth of a second still and 7% is left.
 */
export function trackSpin(spin: number, dYaw: number, delta: number): number {
  if (delta <= 0) return spin;
  return spin + (dYaw / delta - spin) * easeShare(SPIN_TRACK_EASE, delta);
}

/** What a drag hands the drift when it lets go. */
export const releaseSpin = (spin: number) => clamp(spin, -MAX_SPIN, MAX_SPIN);

/**
 * The idle drift after one frame. It dies away quickly while the globe is held
 * (a pin under the pointer, a group open, a build selected, a drag) and picks
 * back up gradually, the way it would if it had weight. A flick's spin runs
 * down into it the same way.
 */
export function stepDrift(drift: number, held: boolean, reducedMotion: boolean, delta: number): number {
  if (reducedMotion) return 0;
  const target = held ? 0 : DRIFT_SPEED;
  return drift + (target - drift) * easeShare(held ? DRIFT_HOLD_EASE : DRIFT_FREE_EASE, delta);
}

/**
 * Radians per pixel of drag that keep the surface under the finger: one
 * radius of drag is one radian of turn. `radiusPx` is the globe's radius on
 * screen. It was a fixed 0.006, which is a 167px globe: a phone's is about
 * 120px, so the map fell behind the finger, and a desktop's about 220px, so
 * it ran ahead.
 */
export const dragSpeed = (radiusPx: number) => clamp(1 / Math.max(1, radiusPx), 0.003, 0.012);

// --- The links drawing on ----------------------------------------------------

// The links grow out from their first end when the map is first seen, and
// again when a filter changes which links there are.
export const GROW_DELAY = 0.2;      // seconds the globe is seen bare first
export const GROW_SECONDS = 1.4;

/** 0 to 1 over the grow, fast out of the pin and slowing as it lands. */
export function grownShare(seconds: number): number {
  const t = clamp((seconds - GROW_DELAY) / GROW_SECONDS, 0, 1);
  return 1 - (1 - t) ** 3;
}

/**
 * How many vertices of the links to draw at `grown`. The buffer holds every
 * link's first segment, then every link's second, and so on (two vertices a
 * segment), so a prefix of it is the same share of every link.
 */
export function grownVertices(arcCount: number, segments: number, grown: number): number {
  return arcCount * 2 * Math.round(segments * clamp(grown, 0, 1));
}

// --- The dots on the links ---------------------------------------------------

// World units, against a globe of radius 1.25.
export const DOT_RADIUS = 0.005;
// ...but never under this on screen. On a 390px phone the globe is drawn at
// 96px a unit, where 0.005 is a dot 1px across: it flickered between one
// pixel and none as it ran.
export const DOT_MIN_PX = 1.1;

/** A dot's radius in world units where the globe is drawn at `pxPerUnit`. */
export const dotRadius = (pxPerUnit: number) => Math.max(DOT_RADIUS, DOT_MIN_PX / Math.max(1, pxPerUnit));
