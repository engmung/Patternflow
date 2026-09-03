// ── Time zoom and the focused lane's height ──────────────────────────────────
// Alt/Ctrl-wheel scales time around the cursor (a native listener, because
// React delegates wheel passively and preventDefault would not stop the
// browser's page zoom); the toolbar's ± keep the view centre still. The
// focused lane fills whatever height the panel has left after the compact
// rows, measured with a ResizeObserver. The panel owns the refs: the body
// element it renders, and the pps mirror the drag handlers read.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { COMPACT_H, FOCUS_MIN_H, GUTTER_W, MSG_H, PPS_DEFAULT, PPS_MAX, PPS_MIN, RULER_H } from "./constants";

export function useTimelineZoom({
  bodyRef,
  ppsRef,
}: {
  bodyRef: RefObject<HTMLDivElement | null>;
  /** Kept equal to `pps` for handlers that must not close over a render. */
  ppsRef: RefObject<number>;
}) {
  const [pps, setPps] = useState(PPS_DEFAULT);
  const [focusH, setFocusH] = useState(200);
  useEffect(() => {
    ppsRef.current = pps;
  }, [pps, ppsRef]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const free = el.clientHeight - (RULER_H + 3 * COMPACT_H + MSG_H + 8);
      setFocusH(Math.max(FOCUS_MIN_H, free));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [bodyRef]);

  const pendingScroll = useRef<{ t: number; px: number } | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.altKey && !event.ctrlKey) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left - GUTTER_W;
      const t = Math.max(0, (px + el.scrollLeft) / ppsRef.current);
      const next = Math.min(PPS_MAX, Math.max(PPS_MIN, ppsRef.current * Math.exp(-event.deltaY * 0.002)));
      if (next === ppsRef.current) return;
      pendingScroll.current = { t, px };
      setPps(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [bodyRef, ppsRef]);
  useLayoutEffect(() => {
    const target = pendingScroll.current;
    if (!target || !bodyRef.current) return;
    pendingScroll.current = null;
    bodyRef.current.scrollLeft = Math.max(0, target.t * pps - target.px);
  }, [pps, bodyRef]);

  const zoomBy = useCallback(
    (factor: number) => {
      const el = bodyRef.current;
      const next = Math.min(PPS_MAX, Math.max(PPS_MIN, ppsRef.current * factor));
      if (el) {
        // Keep the view center still.
        const px = (el.clientWidth - GUTTER_W) / 2;
        pendingScroll.current = { t: Math.max(0, (px + el.scrollLeft) / ppsRef.current), px };
      }
      setPps(next);
    },
    [bodyRef, ppsRef],
  );

  return { pps, focusH, zoomBy };
}

export type TimelineZoom = ReturnType<typeof useTimelineZoom>;
