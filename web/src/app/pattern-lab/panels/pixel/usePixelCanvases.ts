// ── Painting the three canvases ──────────────────────────────────────────────
// Main: the layer's bitmap, redrawn every frame from the store (edits mutate
// the buffer in place, so the canvas always shows the buffer as it is).
// Backdrop: the rest of the stack, composited behind it, for alignment.
// Overlay: shape previews, the floating cut, marching ants, the hover cell.

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { labEngine } from "@/lib/lab/engine";
import {
  drawEllipse,
  drawLine,
  drawRect,
  scaleNearest,
  stampRegionOver,
  type PixelSurface,
  type RGBA,
} from "@/lib/lab/pixelTools";
import { useLabStore } from "@/lib/lab/store";
import type { PixelLayer } from "@/lib/lab/types";
import { floatingBounds, isShapeTool, normRect, type Cell, type Floating, type SelRect, type Stroke, type Tool } from "./tools";

export function usePixelCanvases({
  pixel,
  backdrop,
  mainCanvasRef,
  backdropCanvasRef,
  overlayCanvasRef,
  strokeRef,
  tool,
  size,
  currentColor,
  fillShapes,
  floating,
  selection,
  hoverCell,
}: {
  pixel: PixelLayer | undefined;
  backdrop: boolean;
  mainCanvasRef: RefObject<HTMLCanvasElement | null>;
  backdropCanvasRef: RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  strokeRef: RefObject<Stroke>;
  tool: Tool;
  size: number;
  currentColor: RGBA;
  fillShapes: boolean;
  floating: Floating | null;
  selection: SelRect | null;
  hoverCell: Cell | null;
}) {
  const backdropOnRef = useRef(backdrop);
  useEffect(() => {
    backdropOnRef.current = backdrop;
  }, [backdrop]);

  // Paint loop: layer bitmap + (optionally) the rest of the stack behind it.
  useEffect(() => {
    if (!pixel) return;
    let frameId = 0;
    const tick = () => {
      const state = useLabStore.getState();
      const current = state.layers.find((entry) => entry.id === pixel.id);
      if (current && current.type === "pixel") {
        const canvas = mainCanvasRef.current;
        const context = canvas?.getContext("2d");
        if (canvas && context) {
          const imageData = context.createImageData(current.width, current.height);
          imageData.data.set(current.data);
          context.putImageData(imageData, 0, 0);
        }
        const backdropCanvas = backdropCanvasRef.current;
        const backdropContext = backdropCanvas?.getContext("2d");
        if (backdropCanvas && backdropContext) {
          if (backdropOnRef.current) {
            const frame = labEngine.compositeBackdrop(state.matrix, state.layers, pixel.id);
            const imageData = backdropContext.createImageData(frame.width, frame.height);
            imageData.data.set(frame.data);
            backdropContext.putImageData(imageData, 0, 0);
          } else {
            backdropContext.clearRect(0, 0, backdropCanvas.width, backdropCanvas.height);
          }
        }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [pixel, mainCanvasRef, backdropCanvasRef]);

  // Overlay: shape previews, the floating selection, marching ants, hover.
  const paintOverlay = useCallback(
    (previewShape?: { from: Cell; to: Cell }) => {
      if (!pixel) return;
      const canvas = overlayCanvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);

      const scratch = new Uint8ClampedArray(pixel.width * pixel.height * 4);
      let scratchUsed = false;

      if (previewShape && isShapeTool(tool)) {
        const preview: PixelSurface = { data: scratch, width: pixel.width, height: pixel.height };
        const mark: RGBA = [currentColor[0], currentColor[1], currentColor[2], 170];
        if (tool === "line") {
          drawLine(preview, previewShape.from.x, previewShape.from.y, previewShape.to.x, previewShape.to.y, size, mark);
        } else if (tool === "rect") {
          drawRect(preview, previewShape.from.x, previewShape.from.y, previewShape.to.x, previewShape.to.y, mark, fillShapes);
        } else {
          drawEllipse(preview, previewShape.from.x, previewShape.from.y, previewShape.to.x, previewShape.to.y, mark, fillShapes);
        }
        scratchUsed = true;
      }

      if (floating) {
        const preview: PixelSurface = { data: scratch, width: pixel.width, height: pixel.height };
        const scaled = scaleNearest(floating.source, floating.w, floating.h, floating.scale);
        stampRegionOver(preview, scaled.data, scaled.width, scaled.height, floating.x, floating.y);
        scratchUsed = true;
      }

      if (scratchUsed) {
        const imageData = context.createImageData(pixel.width, pixel.height);
        imageData.data.set(scratch);
        context.putImageData(imageData, 0, 0);
      }

      // Marching ants around the selection (or the floating cut).
      const antsRect = floating
        ? (() => {
            const bounds = floatingBounds(floating);
            return { left: bounds.x, top: bounds.y, right: bounds.x + bounds.w - 1, bottom: bounds.y + bounds.h - 1 };
          })()
        : selection
          ? normRect(selection)
          : null;
      if (antsRect) {
        const { left, top, right, bottom } = antsRect;
        for (let x = left; x <= right; x++) {
          context.fillStyle = (x & 1) === 0 ? "rgba(23,21,18,0.9)" : "rgba(255,255,255,0.9)";
          context.fillRect(x, top, 1, 1);
          context.fillStyle = (x & 1) === 0 ? "rgba(255,255,255,0.9)" : "rgba(23,21,18,0.9)";
          context.fillRect(x, bottom, 1, 1);
        }
        for (let y = top; y <= bottom; y++) {
          context.fillStyle = (y & 1) === 0 ? "rgba(23,21,18,0.9)" : "rgba(255,255,255,0.9)";
          context.fillRect(left, y, 1, 1);
          context.fillStyle = (y & 1) === 0 ? "rgba(255,255,255,0.9)" : "rgba(23,21,18,0.9)";
          context.fillRect(right, y, 1, 1);
        }
      }

      if (!previewShape && hoverCell && tool !== "select") {
        context.fillStyle = "rgba(255,77,0,0.55)";
        const offset = Math.floor((size - 1) / 2);
        const box = tool === "pen" || tool === "eraser" ? size : 1;
        context.fillRect(hoverCell.x - (box > 1 ? offset : 0), hoverCell.y - (box > 1 ? offset : 0), box, box);
      }
    },
    [pixel, overlayCanvasRef, hoverCell, tool, size, currentColor, fillShapes, floating, selection],
  );

  useEffect(() => {
    const stroke = strokeRef.current;
    if (stroke.drawing && stroke.start && stroke.last) {
      paintOverlay({ from: stroke.start, to: stroke.last });
    } else {
      paintOverlay();
    }
  }, [paintOverlay, strokeRef]);

  return paintOverlay;
}
