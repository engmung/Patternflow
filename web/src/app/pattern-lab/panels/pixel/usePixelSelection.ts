// ── The select tool ──────────────────────────────────────────────────────────
// A rectangle, then a lifted cut that floats over the layer until it is
// stamped down (Enter, or switching tools) or put back (Esc). The lift takes
// an undo snapshot first, so cancelling is an undo.

import { useCallback, useRef, useState } from "react";
import { cutRegion, scaleNearest, stampRegionOver, type PixelSurface } from "@/lib/lab/pixelTools";
import { normRect, type Cell, type Floating, type SelRect } from "./tools";

/** The drag in progress: drawing the box, or moving the lifted cut. */
export type SelectAction = {
  mode: "select" | "move";
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
};

export function usePixelSelection({
  surface,
  pixelId,
  pushUndo,
  commit,
  undo,
}: {
  surface: PixelSurface | null;
  pixelId: string | null;
  pushUndo: () => void;
  commit: () => void;
  undo: () => void;
}) {
  const [selection, setSelection] = useState<SelRect | null>(null);
  const [floating, setFloating] = useState<Floating | null>(null);
  const selActionRef = useRef<SelectAction | null>(null);

  // Layer switch drops any selection state (the undo stack keeps the pixels).
  // Render-time state adjustment per the React "derived reset" pattern; the
  // in-flight drag ref clears itself on the next pointer-up.
  const [selectionOwner, setSelectionOwner] = useState(pixelId);
  if (selectionOwner !== pixelId) {
    setSelectionOwner(pixelId);
    setSelection(null);
    setFloating(null);
  }

  const liftSelection = useCallback(() => {
    if (!surface || !selection) return null;
    const { left, top, right, bottom } = normRect(selection);
    const w = right - left + 1;
    const h = bottom - top + 1;
    pushUndo();
    const source = cutRegion(surface, left, top, w, h);
    const lifted: Floating = { source, w, h, x: left, y: top, scale: 1 };
    setFloating(lifted);
    return lifted;
  }, [surface, selection, pushUndo]);

  const commitFloating = useCallback(() => {
    if (floating && surface) {
      const scaled = scaleNearest(floating.source, floating.w, floating.h, floating.scale);
      stampRegionOver(surface, scaled.data, scaled.width, scaled.height, floating.x, floating.y);
      commit();
    }
    setFloating(null);
    setSelection(null);
  }, [floating, surface, commit]);

  const cancelFloating = useCallback(() => {
    if (floating) {
      // The lift pushed an undo snapshot right before cutting — restore it.
      undo();
      setFloating(null);
    }
    setSelection(null);
  }, [floating, undo]);

  const nudgeFloating = useCallback((dx: number, dy: number) => {
    setFloating((f) => (f ? { ...f, x: f.x + dx, y: f.y + dy } : f));
  }, []);

  const scaleFloating = useCallback((delta: number) => {
    setFloating((f) => (f ? { ...f, scale: Math.max(0.25, Math.min(8, f.scale + delta)) } : f));
  }, []);

  /** Start drawing a new box at a cell. */
  const beginBox = useCallback((cell: Cell) => {
    setSelection({ x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y });
    selActionRef.current = { mode: "select", startX: cell.x, startY: cell.y, baseX: 0, baseY: 0 };
  }, []);

  /** Start moving the floating cut from a cell. */
  const beginMove = useCallback((cell: Cell, base: { x: number; y: number }) => {
    selActionRef.current = { mode: "move", startX: cell.x, startY: cell.y, baseX: base.x, baseY: base.y };
  }, []);

  /** Continue the drag in progress; false when there is none. */
  const dragTo = useCallback(
    (clamped: Cell) => {
      const action = selActionRef.current;
      if (!action) return false;
      if (action.mode === "select") {
        setSelection({ x0: action.startX, y0: action.startY, x1: clamped.x, y1: clamped.y });
      } else if (floating) {
        setFloating({
          ...floating,
          x: action.baseX + (clamped.x - action.startX),
          y: action.baseY + (clamped.y - action.startY),
        });
      }
      return true;
    },
    [floating],
  );

  /** End the drag in progress; false when there was none. */
  const endDrag = useCallback(() => {
    if (!selActionRef.current) return false;
    selActionRef.current = null;
    return true;
  }, []);

  return {
    selection,
    floating,
    liftSelection,
    commitFloating,
    cancelFloating,
    nudgeFloating,
    scaleFloating,
    beginBox,
    beginMove,
    dragTo,
    endDrag,
  };
}

export type PixelSelection = ReturnType<typeof usePixelSelection>;
