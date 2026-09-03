// ── Pointer gestures on the overlay canvas ───────────────────────────────────
// Where a press becomes a dot, a fill, a cut or a pan, and a drag becomes a
// line, a shape preview or a moving selection. Every tool's rule is here and
// nowhere else; the buffer edits go through lib/lab/pixelTools.

import { useCallback, type RefObject } from "react";
import {
  colorAt,
  drawDot,
  drawEllipse,
  drawLine,
  drawRect,
  floodFill,
  magicErase,
  type PixelSurface,
} from "@/lib/lab/pixelTools";
import { rgbToHex } from "@/lib/pattern/color";
import type { PixelLayer } from "@/lib/lab/types";
import { floatingBounds, isShapeTool, normRect, type Cell, type Stroke } from "./tools";
import type { PixelSelection } from "./usePixelSelection";
import type { PixelToolState } from "./usePixelToolState";
import type { PixelViewport } from "./usePixelViewport";

export function usePixelPointer({
  pixel,
  surface,
  tools,
  viewport,
  viewportRef,
  selection,
  strokeRef,
  pushUndo,
  commit,
  paintOverlay,
}: {
  pixel: PixelLayer | undefined;
  surface: PixelSurface | null;
  tools: PixelToolState;
  viewport: PixelViewport;
  viewportRef: RefObject<HTMLDivElement | null>;
  selection: PixelSelection;
  strokeRef: RefObject<Stroke>;
  pushUndo: () => void;
  commit: () => void;
  paintOverlay: (previewShape?: { from: Cell; to: Cell }) => void;
}) {
  const { tool, size, currentColor, colorHex, fillShapes, tolerance, contiguous, rememberSwatch, setColorHex, setAlpha } = tools;
  const { cellFromEvent, setHoverCell, beginPan, movePan, endPan } = viewport;
  const { floating, selection: box, liftSelection, commitFloating, beginBox, beginMove, dragTo, endDrag } = selection;

  const pickAt = useCallback(
    (cell: Cell) => {
      if (!surface) return;
      const [r, g, b, a] = colorAt(surface, cell.x, cell.y);
      if (a === 0) return;
      setColorHex(rgbToHex(r, g, b));
      setAlpha(Math.round((a / 255) * 100) / 100);
    },
    [surface, setColorHex, setAlpha],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (!pixel || !surface) return;
    viewportRef.current?.focus({ preventScroll: true });

    // Middle button pans the view — never draws.
    if (event.button === 1) {
      event.preventDefault();
      beginPan(event);
      return;
    }
    if (event.button !== 0 && event.button !== 2) return;

    const cell = cellFromEvent(event);
    if (!cell) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);

    if (event.altKey || tool === "picker") {
      pickAt(cell);
      return;
    }

    if (tool === "select") {
      if (floating) {
        const bounds = floatingBounds(floating);
        const inside =
          cell.x >= bounds.x &&
          cell.x < bounds.x + bounds.w &&
          cell.y >= bounds.y &&
          cell.y < bounds.y + bounds.h;
        if (inside) {
          beginMove(cell, { x: floating.x, y: floating.y });
          return;
        }
        commitFloating();
        beginBox(cell);
        return;
      }
      if (box) {
        const rect = normRect(box);
        if (cell.x >= rect.left && cell.x <= rect.right && cell.y >= rect.top && cell.y <= rect.bottom) {
          const lifted = liftSelection();
          if (lifted) beginMove(cell, { x: lifted.x, y: lifted.y });
          return;
        }
      }
      beginBox(cell);
      return;
    }

    const erase = tool === "eraser" || event.button === 2;
    const stroke = strokeRef.current;

    if (tool === "fill") {
      pushUndo();
      floodFill(surface, cell.x, cell.y, currentColor, tolerance);
      rememberSwatch(colorHex);
      commit();
      return;
    }
    if (tool === "magic") {
      pushUndo();
      magicErase(surface, cell.x, cell.y, tolerance, contiguous);
      commit();
      return;
    }

    if (tool === "pen" || tool === "eraser" || event.button === 2) {
      pushUndo();
      stroke.drawing = true;
      stroke.erase = erase;
      stroke.last = cell;
      drawDot(surface, cell.x, cell.y, size, erase ? [0, 0, 0, 0] : currentColor);
      return;
    }

    // Shape tools: preview until pointer-up.
    stroke.drawing = true;
    stroke.erase = false;
    stroke.start = cell;
    stroke.last = cell;
    paintOverlay({ from: cell, to: cell });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (movePan(event)) return;
    const cell = cellFromEvent(event);
    setHoverCell(cell);

    const clamped = cellFromEvent(event, true);
    if (clamped && dragTo(clamped)) return;

    const stroke = strokeRef.current;
    if (!stroke.drawing || !cell || !surface) return;

    if (tool === "pen" || tool === "eraser" || stroke.erase) {
      if (stroke.last) {
        drawLine(surface, stroke.last.x, stroke.last.y, cell.x, cell.y, size, stroke.erase ? [0, 0, 0, 0] : currentColor);
      }
      stroke.last = cell;
      return;
    }

    stroke.last = cell;
    if (stroke.start) paintOverlay({ from: stroke.start, to: cell });
  };

  const onPointerUp = () => {
    if (endPan()) return;
    if (endDrag()) return;
    const stroke = strokeRef.current;
    if (!stroke.drawing || !surface) {
      stroke.drawing = false;
      return;
    }
    stroke.drawing = false;

    if (isShapeTool(tool)) {
      if (stroke.start && stroke.last) {
        pushUndo();
        if (tool === "line") {
          drawLine(surface, stroke.start.x, stroke.start.y, stroke.last.x, stroke.last.y, size, currentColor);
        } else if (tool === "rect") {
          drawRect(surface, stroke.start.x, stroke.start.y, stroke.last.x, stroke.last.y, currentColor, fillShapes);
        } else {
          drawEllipse(surface, stroke.start.x, stroke.start.y, stroke.last.x, stroke.last.y, currentColor, fillShapes);
        }
        rememberSwatch(colorHex);
      }
      stroke.start = null;
      paintOverlay();
      commit();
      return;
    }

    if (!stroke.erase) rememberSwatch(colorHex);
    commit();
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}
