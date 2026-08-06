"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag a surface around, with a short glide when you let go.
 *
 * During the drag the surface tracks the pointer exactly — anything else feels
 * like lag rather than weight. The damping is only on release: velocity decays
 * exponentially over about a third of a second, enough that a flick carries and
 * not so much that the map skates away from you.
 *
 * Everything lives in refs and is written to the DOM from the animation frame.
 * Panning through React state would queue a render per pointermove, which is
 * the difference between following your hand and lagging behind it; `offset` is
 * published only so callers can persist or display it, not to drive the frame.
 */

/** Per-frame velocity multiplier at 60fps. Lower is stickier. */
const DECAY = 0.9;
/** Below this (px/frame) the glide is over. */
const STILL = 0.05;
/** Movement past this (px) is a pan, so the click that follows isn't a select. */
const SLOP = 4;
/** How much of a new sample to believe. One pointermove's dx/dt is noisy —
 *  a high-polling-rate mouse reports sub-millisecond gaps — and taking the last
 *  one raw turns an ordinary flick into a launch. */
const SMOOTHING = 0.3;
/** Ignore gaps shorter than this (ms) when dividing. Below it the quotient is
 *  measuring the clock, not the hand. */
const MIN_INTERVAL = 4;
/** A glide decaying at DECAY travels v/(1-DECAY) before stopping. Cap v so that
 *  distance is a fraction of the range rather than a lap of it: a flick should
 *  carry you across part of the map, never pin you to the far edge. */
const FLING_REACH = 0.66;

export type Bounds = { x: number; y: number };

export function useDragPan(bounds: Bounds) {
  const surface = useRef<HTMLElement | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);

  const velocity = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const gesture = useRef<{
    id: number;
    lastX: number;
    lastY: number;
    lastAt: number;
    travelled: number;
  } | null>(null);
  // Set when a gesture turns out to be a pan, read by the click that follows.
  const panned = useRef(false);

  // Synced in an effect rather than assigned during render: a ref written while
  // rendering is a ref that can hold a value from a render that got thrown away.
  const boundsRef = useRef(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  const paint = useCallback(() => {
    const el = surface.current;
    if (!el) return;
    const { x, y } = offsetRef.current;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  /** Move by a delta, clamped. Returns which axes hit the wall. */
  const nudge = useCallback(
    (dx: number, dy: number) => {
      const limit = boundsRef.current;
      const wantX = offsetRef.current.x + dx;
      const wantY = offsetRef.current.y + dy;
      const x = Math.max(-limit.x, Math.min(limit.x, wantX));
      const y = Math.max(-limit.y, Math.min(limit.y, wantY));
      offsetRef.current = { x, y };
      paint();
      return { stoppedX: x !== wantX, stoppedY: y !== wantY };
    },
    [paint],
  );

  const stopGlide = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    velocity.current = { x: 0, y: 0 };
  }, []);

  const glide = useCallback(() => {
    let previous = performance.now();
    const step = (now: number) => {
      // Scale the decay by real elapsed time so a dropped frame doesn't make
      // the glide longer than it looks.
      const frames = Math.min((now - previous) / (1000 / 60), 4);
      previous = now;
      const decay = Math.pow(DECAY, frames);

      const { stoppedX, stoppedY } = nudge(
        velocity.current.x * frames,
        velocity.current.y * frames,
      );
      // Hitting the edge ends the motion on that axis rather than grinding
      // against it for the rest of the decay.
      velocity.current = {
        x: stoppedX ? 0 : velocity.current.x * decay,
        y: stoppedY ? 0 : velocity.current.y * decay,
      };

      if (Math.abs(velocity.current.x) < STILL && Math.abs(velocity.current.y) < STILL) {
        frame.current = null;
        return;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [nudge]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Left button / touch / pen only — a right-click is a context menu.
      if (event.button !== 0) return;
      stopGlide();
      panned.current = false;
      gesture.current = {
        id: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        lastAt: event.timeStamp,
        travelled: 0,
      };
      // Capture on the stage, so a fast drag that leaves the box keeps coming.
      // Guarded: capture throws if the pointer is already gone, and losing the
      // capture is survivable — losing the gesture to an exception is not.
      try {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      } catch {
        // Without capture the drag still works inside the box.
      }
      setPanning(true);
    },
    [stopGlide],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const held = gesture.current;
      if (!held || held.id !== event.pointerId) return;

      const dx = event.clientX - held.lastX;
      const dy = event.clientY - held.lastY;
      const dt = Math.max(event.timeStamp - held.lastAt, MIN_INTERVAL);

      held.travelled += Math.abs(dx) + Math.abs(dy);
      if (held.travelled > SLOP) panned.current = true;

      // The drag itself is always exact — the smoothing below is only about
      // what happens after you let go.
      nudge(dx, dy);

      // px per 60fps frame, which is what the glide integrates in.
      const limit = boundsRef.current;
      const sample = { x: (dx / dt) * (1000 / 60), y: (dy / dt) * (1000 / 60) };
      const blend = (was: number, now: number, reach: number) => {
        const next = was * (1 - SMOOTHING) + now * SMOOTHING;
        const cap = Math.max(reach, 1) * FLING_REACH * (1 - DECAY);
        return Math.max(-cap, Math.min(cap, next));
      };
      velocity.current = {
        x: blend(velocity.current.x, sample.x, limit.x),
        y: blend(velocity.current.y, sample.y, limit.y),
      };

      held.lastX = event.clientX;
      held.lastY = event.clientY;
      held.lastAt = event.timeStamp;
    },
    [nudge],
  );

  const endGesture = useCallback(
    (event: React.PointerEvent) => {
      const held = gesture.current;
      if (!held || held.id !== event.pointerId) return;
      gesture.current = null;
      setPanning(false);
      const target = event.currentTarget as HTMLElement;
      try {
        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Already released — pointercancel gets here after the browser did it.
      }

      // A pointerup long after the last move is a hold, not a flick.
      const stale = event.timeStamp - held.lastAt > 90;
      if (panned.current && !stale) glide();
      else velocity.current = { x: 0, y: 0 };
    },
    [glide],
  );

  useEffect(() => stopGlide, [stopGlide]);

  /**
   * Put this on the element that moves. A callback ref rather than a RefObject:
   * handing a ref back out of a hook makes every read of it in JSX a
   * ref-access-during-render, which is both a lint error and a fair description
   * of what it would be.
   */
  const surfaceRef = useCallback(
    (el: HTMLElement | null) => {
      surface.current = el;
      // A remount lands with the transform gone but the offset kept.
      if (el) paint();
    },
    [paint],
  );

  /** Whether the gesture that just ended moved. Call from a child's onClick to
   *  tell "I dragged the map" from "I picked this one". */
  const didPan = useCallback(() => panned.current, []);

  const reset = useCallback(() => {
    stopGlide();
    offsetRef.current = { x: 0, y: 0 };
    paint();
  }, [paint, stopGlide]);

  /** Spread onto the element you drag ON — the container, not the surface. */
  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
  };

  // `panning` is state, for the cursor.
  return { surfaceRef, handlers, panning, didPan, reset };
}
