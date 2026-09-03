// ── The zoomed viewport ──────────────────────────────────────────────────────
// Zoom, middle-drag panning, the hover cell, and the one mapping everything
// hangs on: a pointer position → a pixel cell, read off the overlay canvas's
// box. The refs belong to the panel (it renders the elements); this hook is
// handed them.

import { useCallback, useRef, useState, type RefObject } from "react";
import type { PixelLayer } from "@/lib/lab/types";
import type { Cell } from "./tools";

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 32;

export function usePixelViewport({
  pixel,
  viewportRef,
  overlayCanvasRef,
}: {
  pixel: PixelLayer | undefined;
  viewportRef: RefObject<HTMLDivElement | null>;
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  const [zoom, setZoom] = useState(6);
  const [panning, setPanning] = useState(false);
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  // Middle-drag panning of the zoomed viewport.
  const panRef = useRef<{ startX: number; startY: number; left: number; top: number } | null>(null);

  /**
   * The cell under a pointer, or null off the canvas. Clamped: selection and
   * move drags keep tracking past the edge instead of dropping out.
   */
  const cellFromEvent = useCallback(
    (event: React.PointerEvent, clamp = false): Cell | null => {
      if (!pixel) return null;
      const canvas = overlayCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * pixel.width);
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * pixel.height);
      if (clamp) {
        return {
          x: Math.max(0, Math.min(pixel.width - 1, x)),
          y: Math.max(0, Math.min(pixel.height - 1, y)),
        };
      }
      if (x < 0 || x >= pixel.width || y < 0 || y >= pixel.height) return null;
      return { x, y };
    },
    [pixel, overlayCanvasRef],
  );

  const zoomBy = useCallback((delta: number) => {
    setZoom((current) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current + delta)));
  }, []);

  const fitZoom = useCallback(() => {
    if (!pixel) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = Math.max(
      1,
      Math.floor(
        Math.min((viewport.clientWidth - 40) / pixel.width, (viewport.clientHeight - 40) / pixel.height),
      ),
    );
    setZoom(next);
  }, [pixel, viewportRef]);

  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1 : -1);
    },
    [zoomBy],
  );

  /** Middle button: start panning. True when the press was taken. */
  const beginPan = useCallback(
    (event: React.PointerEvent) => {
      const viewport = viewportRef.current;
      if (!viewport) return false;
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      panRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      setPanning(true);
      return true;
    },
    [viewportRef],
  );

  /** True while a pan is in progress (and the move was consumed by it). */
  const movePan = useCallback(
    (event: React.PointerEvent) => {
      const pan = panRef.current;
      if (!pan) return false;
      const viewport = viewportRef.current;
      if (viewport) {
        viewport.scrollLeft = pan.left - (event.clientX - pan.startX);
        viewport.scrollTop = pan.top - (event.clientY - pan.startY);
      }
      return true;
    },
    [viewportRef],
  );

  /** True when a pan just ended. */
  const endPan = useCallback(() => {
    if (!panRef.current) return false;
    panRef.current = null;
    setPanning(false);
    return true;
  }, []);

  return {
    zoom,
    zoomBy,
    fitZoom,
    onWheel,
    panning,
    hoverCell,
    setHoverCell,
    cellFromEvent,
    beginPan,
    movePan,
    endPan,
  };
}

export type PixelViewport = ReturnType<typeof usePixelViewport>;
