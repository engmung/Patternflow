"use client";

// Pixel art editor — draw straight onto the LED matrix: pencil/eraser/shapes/
// fill, an eyedropper, a magic eraser for background removal (누끼), image
// import with fit modes, undo/redo, zoom, and a live backdrop of the other
// layers for alignment. All edits mutate the layer's RGBA buffer in place and
// bump its rev on commit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearSurface,
  colorAt,
  cutRegion,
  drawDot,
  drawEllipse,
  drawLine,
  drawRect,
  floodFill,
  magicErase,
  rasterizeImage,
  scaleNearest,
  stampOver,
  stampRegionOver,
  type ImportFit,
  type PixelSurface,
  type RGBA,
} from "@/lib/lab/pixelTools";
import { labEngine } from "@/lib/lab/engine";
import { useActiveLayer, useLabStore } from "@/lib/lab/store";
import { isPixelLayer } from "@/lib/lab/types";
import styles from "../PatternLab.module.css";
import dock from "../LabPanels.module.css";

type Tool =
  | "pen"
  | "eraser"
  | "line"
  | "rect"
  | "ellipse"
  | "fill"
  | "picker"
  | "magic"
  | "select";

const TOOLS: Array<{ id: Tool; label: string; title: string; key: string }> = [
  { id: "pen", label: "Pen", title: "Pencil (B) — right-click erases", key: "b" },
  { id: "eraser", label: "Erase", title: "Eraser (E)", key: "e" },
  { id: "line", label: "Line", title: "Line (L)", key: "l" },
  { id: "rect", label: "Rect", title: "Rectangle (R)", key: "r" },
  { id: "ellipse", label: "Ellip", title: "Ellipse (O)", key: "o" },
  { id: "fill", label: "Fill", title: "Flood fill (G)", key: "g" },
  { id: "picker", label: "Pick", title: "Eyedropper (I) — or Alt-click with any tool", key: "i" },
  { id: "magic", label: "Magic", title: "Magic eraser (M) — click a color to cut it out", key: "m" },
  {
    id: "select",
    label: "Sel",
    title:
      "Select (S) — drag a box, then drag inside it to lift & move. +/− scales (nearest), Enter commits, Esc cancels, arrows nudge",
    key: "s",
  },
];

type SelRect = { x0: number; y0: number; x1: number; y1: number };
type Floating = {
  /** The lifted pixels at their ORIGINAL size — every rescale samples these. */
  source: Uint8ClampedArray;
  w: number;
  h: number;
  x: number;
  y: number;
  scale: number;
};

function normRect(rect: SelRect) {
  return {
    left: Math.min(rect.x0, rect.x1),
    top: Math.min(rect.y0, rect.y1),
    right: Math.max(rect.x0, rect.x1),
    bottom: Math.max(rect.y0, rect.y1),
  };
}

const MAX_UNDO = 40;

// Undo/redo history lives outside React (buffers, not state).
const histories = new Map<string, { undo: Uint8ClampedArray[]; redo: Uint8ClampedArray[] }>();

function historyFor(id: string) {
  let history = histories.get(id);
  if (!history) {
    history = { undo: [], redo: [] };
    histories.set(id, history);
  }
  return history;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${((toByte(r) << 16) | (toByte(g) << 8) | toByte(b)).toString(16).padStart(6, "0")}`;
}

export default function PixelPanel() {
  const layer = useActiveLayer();
  const bumpPixelLayer = useLabStore((state) => state.bumpPixelLayer);
  const addPixelLayer = useLabStore((state) => state.addPixelLayer);

  const [tool, setTool] = useState<Tool>("pen");
  const [size, setSize] = useState(1);
  const [colorHex, setColorHex] = useState("#ff4d00");
  const [alpha, setAlpha] = useState(1);
  const [fillShapes, setFillShapes] = useState(true);
  const [tolerance, setTolerance] = useState(0.12);
  const [contiguous, setContiguous] = useState(true);
  const [zoom, setZoom] = useState(6);
  const [backdrop, setBackdrop] = useState(true);
  const [grid, setGrid] = useState(false);
  const [swatches, setSwatches] = useState<string[]>([
    "#ffffff", "#171512", "#ff4d00", "#ffe89a", "#081840", "#2ec27e",
  ]);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backdropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const strokeRef = useRef<{
    drawing: boolean;
    erase: boolean;
    start: { x: number; y: number } | null;
    last: { x: number; y: number } | null;
  }>({ drawing: false, erase: false, start: null, last: null });
  // Middle-drag panning of the zoomed viewport.
  const panRef = useRef<{ startX: number; startY: number; left: number; top: number } | null>(
    null,
  );
  const [panning, setPanning] = useState(false);
  // Select tool: a rect selection, and the "floating" cut once it's lifted.
  const [selection, setSelection] = useState<SelRect | null>(null);
  const [floating, setFloating] = useState<Floating | null>(null);
  const selActionRef = useRef<{
    mode: "select" | "move";
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);
  const backdropOnRef = useRef(backdrop);
  useEffect(() => {
    backdropOnRef.current = backdrop;
  }, [backdrop]);

  const pixel = isPixelLayer(layer) ? layer : undefined;
  const surface: PixelSurface | null = useMemo(
    () => (pixel ? { data: pixel.data, width: pixel.width, height: pixel.height } : null),
    [pixel],
  );

  const currentColor: RGBA = (() => {
    const [r, g, b] = hexToRgb(colorHex);
    return [r, g, b, Math.round(alpha * 255)];
  })();

  const pushUndo = useCallback(() => {
    if (!pixel) return;
    const history = historyFor(pixel.id);
    history.undo.push(new Uint8ClampedArray(pixel.data));
    if (history.undo.length > MAX_UNDO) history.undo.shift();
    history.redo = [];
  }, [pixel]);

  const commit = useCallback(() => {
    if (pixel) bumpPixelLayer(pixel.id);
  }, [pixel, bumpPixelLayer]);

  const undo = useCallback(() => {
    if (!pixel) return;
    const history = historyFor(pixel.id);
    const previous = history.undo.pop();
    if (!previous) return;
    history.redo.push(new Uint8ClampedArray(pixel.data));
    pixel.data.set(previous);
    commit();
  }, [pixel, commit]);

  const redo = useCallback(() => {
    if (!pixel) return;
    const history = historyFor(pixel.id);
    const next = history.redo.pop();
    if (!next) return;
    history.undo.push(new Uint8ClampedArray(pixel.data));
    pixel.data.set(next);
    commit();
  }, [pixel, commit]);

  // ── Select tool: lift / move / scale / commit ──
  const floatingBounds = useCallback((f: Floating) => {
    const w = Math.max(1, Math.round(f.w * f.scale));
    const h = Math.max(1, Math.round(f.h * f.scale));
    return { x: f.x, y: f.y, w, h };
  }, []);

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

  // Layer switch drops any selection state (the undo stack keeps the pixels).
  // Render-time state adjustment per the React "derived reset" pattern; the
  // in-flight drag ref clears itself on the next pointer-up.
  const pixelId = pixel?.id ?? null;
  const [selectionOwner, setSelectionOwner] = useState(pixelId);
  if (selectionOwner !== pixelId) {
    setSelectionOwner(pixelId);
    setSelection(null);
    setFloating(null);
  }

  const switchTool = useCallback(
    (next: Tool) => {
      if (floating && next !== "select") commitFloating();
      setTool(next);
    },
    [floating, commitFloating],
  );

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
  }, [pixel]);

  // Overlay: shape previews, the floating selection, marching ants, hover.
  const paintOverlay = useCallback(
    (previewShape?: { from: { x: number; y: number }; to: { x: number; y: number } }) => {
      if (!pixel) return;
      const canvas = overlayCanvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);

      const scratch = new Uint8ClampedArray(pixel.width * pixel.height * 4);
      let scratchUsed = false;

      if (previewShape && (tool === "line" || tool === "rect" || tool === "ellipse")) {
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
    [pixel, hoverCell, tool, size, currentColor, fillShapes, floating, selection, floatingBounds],
  );

  useEffect(() => {
    const stroke = strokeRef.current;
    if (stroke.drawing && stroke.start && stroke.last) {
      paintOverlay({ from: stroke.start, to: stroke.last });
    } else {
      paintOverlay();
    }
  }, [paintOverlay]);

  const cellFromEvent = (event: React.PointerEvent): { x: number; y: number } | null => {
    if (!pixel) return null;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * pixel.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * pixel.height);
    if (x < 0 || x >= pixel.width || y < 0 || y >= pixel.height) return null;
    return { x, y };
  };

  // Clamped variant: selection/move drags keep tracking past the canvas edge.
  const cellFromEventClamped = (event: React.PointerEvent): { x: number; y: number } | null => {
    if (!pixel) return null;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * pixel.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * pixel.height);
    return {
      x: Math.max(0, Math.min(pixel.width - 1, x)),
      y: Math.max(0, Math.min(pixel.height - 1, y)),
    };
  };

  const rememberSwatch = useCallback((hex: string) => {
    setSwatches((current) => [hex, ...current.filter((entry) => entry !== hex)].slice(0, 10));
  }, []);

  const pickAt = (cell: { x: number; y: number }) => {
    if (!surface) return;
    const [r, g, b, a] = colorAt(surface, cell.x, cell.y);
    if (a === 0) return;
    setColorHex(rgbToHex(r, g, b));
    setAlpha(Math.round((a / 255) * 100) / 100);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!pixel || !surface) return;
    viewportRef.current?.focus({ preventScroll: true });

    // Middle button pans the view — never draws.
    if (event.button === 1) {
      event.preventDefault();
      const viewport = viewportRef.current;
      if (!viewport) return;
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      panRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      setPanning(true);
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
          selActionRef.current = {
            mode: "move",
            startX: cell.x,
            startY: cell.y,
            baseX: floating.x,
            baseY: floating.y,
          };
          return;
        }
        commitFloating();
        setSelection({ x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y });
        selActionRef.current = { mode: "select", startX: cell.x, startY: cell.y, baseX: 0, baseY: 0 };
        return;
      }
      if (selection) {
        const rect = normRect(selection);
        if (
          cell.x >= rect.left &&
          cell.x <= rect.right &&
          cell.y >= rect.top &&
          cell.y <= rect.bottom
        ) {
          const lifted = liftSelection();
          if (lifted) {
            selActionRef.current = {
              mode: "move",
              startX: cell.x,
              startY: cell.y,
              baseX: lifted.x,
              baseY: lifted.y,
            };
          }
          return;
        }
      }
      setSelection({ x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y });
      selActionRef.current = { mode: "select", startX: cell.x, startY: cell.y, baseX: 0, baseY: 0 };
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
    const pan = panRef.current;
    if (pan) {
      const viewport = viewportRef.current;
      if (viewport) {
        viewport.scrollLeft = pan.left - (event.clientX - pan.startX);
        viewport.scrollTop = pan.top - (event.clientY - pan.startY);
      }
      return;
    }
    const cell = cellFromEvent(event);
    setHoverCell(cell);

    const selAction = selActionRef.current;
    if (selAction) {
      const clamped = cellFromEventClamped(event);
      if (clamped) {
        if (selAction.mode === "select") {
          setSelection({
            x0: selAction.startX,
            y0: selAction.startY,
            x1: clamped.x,
            y1: clamped.y,
          });
        } else if (floating) {
          setFloating({
            ...floating,
            x: selAction.baseX + (clamped.x - selAction.startX),
            y: selAction.baseY + (clamped.y - selAction.startY),
          });
        }
      }
      return;
    }

    const stroke = strokeRef.current;
    if (!stroke.drawing || !cell || !surface) return;

    if (tool === "pen" || tool === "eraser" || stroke.erase) {
      if (stroke.last) {
        drawLine(
          surface,
          stroke.last.x,
          stroke.last.y,
          cell.x,
          cell.y,
          size,
          stroke.erase ? [0, 0, 0, 0] : currentColor,
        );
      }
      stroke.last = cell;
      return;
    }

    stroke.last = cell;
    if (stroke.start) paintOverlay({ from: stroke.start, to: cell });
  };

  const onPointerUp = () => {
    if (panRef.current) {
      panRef.current = null;
      setPanning(false);
      return;
    }
    if (selActionRef.current) {
      selActionRef.current = null;
      return;
    }
    const stroke = strokeRef.current;
    if (!stroke.drawing || !surface) {
      stroke.drawing = false;
      return;
    }
    stroke.drawing = false;

    if (tool === "line" || tool === "rect" || tool === "ellipse") {
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

  const fitZoom = () => {
    if (!pixel) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = Math.max(
      1,
      Math.floor(
        Math.min(
          (viewport.clientWidth - 40) / pixel.width,
          (viewport.clientHeight - 40) / pixel.height,
        ),
      ),
    );
    setZoom(next);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (event.key === "Enter" && floating) {
      event.preventDefault();
      commitFloating();
      return;
    }
    if (event.key === "Escape" && (floating || selection)) {
      event.preventDefault();
      cancelFloating();
      return;
    }
    if (event.key.startsWith("Arrow") && floating) {
      event.preventDefault();
      const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      setFloating({ ...floating, x: floating.x + dx, y: floating.y + dy });
      return;
    }
    const toolFor = TOOLS.find((entry) => entry.key === event.key.toLowerCase());
    if (toolFor && !event.ctrlKey && !event.metaKey && !event.altKey) {
      switchTool(toolFor.id);
      return;
    }
    if (event.key === "[") setSize((current) => Math.max(1, current - 1));
    if (event.key === "]") setSize((current) => Math.min(8, current + 1));
  };

  if (!pixel) {
    return (
      <div className={dock.panel}>
        <div className={dock.panelHint}>
          {layer
            ? "The selected layer is a code pattern — select a pixel layer to draw, or add one."
            : "Select a pixel layer to draw."}
          <button type="button" onClick={addPixelLayer}>
            + Add pixel layer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={dock.panel}>
      <div className={dock.panelBar}>
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-active={tool === entry.id}
            title={entry.title}
            onClick={() => switchTool(entry.id)}
          >
            {entry.label}
          </button>
        ))}
        <span className={dock.toolSep} />
        <label title="Brush size ( [ and ] )">
          size
          <input
            type="number"
            min={1}
            max={8}
            value={size}
            aria-label="Brush size"
            onChange={(event) =>
              setSize(Math.max(1, Math.min(8, Math.round(Number(event.target.value)) || 1)))
            }
          />
        </label>
        <input
          type="color"
          className={dock.colorWell}
          value={colorHex}
          aria-label="Drawing color"
          title="Drawing color"
          onChange={(event) => setColorHex(event.target.value)}
        />
        <label title="Color opacity — pixels store real alpha">
          a
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={alpha}
            style={{ width: 60 }}
            aria-label="Color alpha"
            onChange={(event) => setAlpha(Number(event.target.value))}
          />
        </label>
        <span className={dock.swatchRow}>
          {swatches.slice(0, 8).map((hex) => (
            <button
              key={hex}
              type="button"
              className={dock.swatch}
              style={{ background: hex }}
              title={hex}
              aria-label={`Use ${hex}`}
              onClick={() => setColorHex(hex)}
            />
          ))}
        </span>
      </div>

      <div className={dock.panelBar}>
        {tool === "select" &&
          (floating ? (
            <>
              <label title="Nearest-neighbour scale — pixels stay crisp, just bigger">scale</label>
              <button
                type="button"
                aria-label="Scale down"
                onClick={() =>
                  setFloating((f) => (f ? { ...f, scale: Math.max(0.25, f.scale - 0.25) } : f))
                }
              >
                −
              </button>
              <span>{Math.round(floating.scale * 100)}%</span>
              <button
                type="button"
                aria-label="Scale up"
                onClick={() =>
                  setFloating((f) => (f ? { ...f, scale: Math.min(8, f.scale + 0.25) } : f))
                }
              >
                +
              </button>
              <button type="button" onClick={commitFloating} title="Stamp the selection down (Enter)">
                Apply
              </button>
              <button type="button" onClick={cancelFloating} title="Put the pixels back (Esc)">
                Cancel
              </button>
              <span className={dock.toolSep} />
            </>
          ) : (
            <label>drag a box · drag inside it to lift &amp; move</label>
          ))}
        {(tool === "fill" || tool === "magic") && (
          <>
            <label title="Color match tolerance for fill / magic eraser">
              tol
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={tolerance}
                style={{ width: 70 }}
                aria-label="Tolerance"
                onChange={(event) => setTolerance(Number(event.target.value))}
              />
            </label>
            {tool === "magic" && (
              <label title="Contiguous: only the connected region. Off: every matching pixel in the layer (chroma cut)">
                <input
                  type="checkbox"
                  checked={contiguous}
                  onChange={(event) => setContiguous(event.target.checked)}
                />
                contiguous
              </label>
            )}
          </>
        )}
        {(tool === "rect" || tool === "ellipse") && (
          <label title="Fill shapes or draw outlines">
            <input
              type="checkbox"
              checked={fillShapes}
              onChange={(event) => setFillShapes(event.target.checked)}
            />
            filled
          </label>
        )}
        <button type="button" onClick={undo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" onClick={redo} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <button
          type="button"
          onClick={() => {
            pushUndo();
            if (surface) clearSurface(surface);
            commit();
          }}
          title="Clear the layer to transparent"
        >
          Clear
        </button>
        <span className={dock.toolSep} />
        <button type="button" onClick={() => setImportOpen(true)} title="Import an image into this layer">
          Import image
        </button>
        <span style={{ flex: 1 }} />
        <label title="Show the other layers behind this one">
          <input
            type="checkbox"
            checked={backdrop}
            onChange={(event) => setBackdrop(event.target.checked)}
          />
          onion
        </label>
        <label title="Pixel grid (visible when zoomed in)">
          <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
          grid
        </label>
        <button type="button" onClick={() => setZoom((current) => Math.max(1, current - 1))} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => setZoom((current) => Math.min(32, current + 1))} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={fitZoom} title="Fit the canvas to the panel">
          Fit
        </button>
      </div>

      <div
        ref={viewportRef}
        className={dock.pixelViewport}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onWheel={(event) => {
          event.preventDefault();
          setZoom((current) =>
            Math.max(1, Math.min(32, current + (event.deltaY < 0 ? 1 : -1))),
          );
        }}
      >
        <div
          className={dock.pixelStage}
          style={{
            width: pixel.width * zoom,
            height: pixel.height * zoom,
            backgroundSize: `${Math.max(4, zoom * 2)}px ${Math.max(4, zoom * 2)}px`,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <canvas ref={backdropCanvasRef} width={pixel.width} height={pixel.height} style={{ opacity: 0.4 }} aria-hidden="true" />
          <canvas ref={mainCanvasRef} width={pixel.width} height={pixel.height} aria-label={`${pixel.name} bitmap`} />
          <canvas
            ref={overlayCanvasRef}
            width={pixel.width}
            height={pixel.height}
            aria-hidden="true"
            style={{
              cursor: panning ? "grabbing" : tool === "picker" ? "copy" : "crosshair",
              touchAction: "none",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setHoverCell(null)}
          />
          {grid && zoom >= 4 && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                backgroundImage:
                  "linear-gradient(to right, rgba(23,21,18,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(23,21,18,0.25) 1px, transparent 1px)",
                backgroundSize: `${zoom}px ${zoom}px`,
              }}
            />
          )}
        </div>
      </div>

      <div className={dock.pixelStatus}>
        <span>
          {pixel.width}×{pixel.height}
        </span>
        <span>zoom {zoom}×</span>
        {hoverCell && (
          <span>
            {hoverCell.x},{hoverCell.y}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span>alt-click picks · right-drag erases · middle-drag pans</span>
      </div>

      {importOpen && (
        <ImportImageModal
          width={pixel.width}
          height={pixel.height}
          layerId={pixel.id}
          onApply={(data) => {
            pushUndo();
            stampOver(pixel.data, data);
            commit();
            setImportOpen(false);
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

// ── Image import modal ──
// Sizing + placement happen HERE, in context: the preview shows the live
// composite of the other layers behind the image, the image drags into place,
// and the mouse wheel / slider scales it. Apply stamps the result OVER the
// layer's existing pixels.
function ImportImageModal({
  width,
  height,
  layerId,
  onApply,
  onClose,
}: {
  width: number;
  height: number;
  layerId: string;
  onApply: (data: Uint8ClampedArray) => void;
  onClose: () => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fit, setFit] = useState<ImportFit>("contain");
  const [smooth, setSmooth] = useState(true);
  const [removeBg, setRemoveBg] = useState(false);
  const [bgTolerance, setBgTolerance] = useState(0.12);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showLayers, setShowLayers] = useState(true);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const backdropRef = useRef<HTMLCanvasElement | null>(null);
  const resultRef = useRef<Uint8ClampedArray | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  const loadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setScale(1);
      setOffset({ x: 0, y: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Live backdrop: the rest of the stack keeps animating behind the preview.
  useEffect(() => {
    if (!showLayers) {
      const canvas = backdropRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, width, height);
      return;
    }
    let frameId = 0;
    const tick = () => {
      const canvas = backdropRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        const state = useLabStore.getState();
        const frame = labEngine.compositeBackdrop(state.matrix, state.layers, layerId);
        if (frame.width === width && frame.height === height) {
          const imageData = context.createImageData(frame.width, frame.height);
          imageData.data.set(frame.data);
          context.putImageData(imageData, 0, 0);
        }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [showLayers, layerId, width, height]);

  // Recompute + paint the image whenever an option or the placement changes.
  useEffect(() => {
    const canvas = previewRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, width, height);
    if (!image) {
      resultRef.current = null;
      return;
    }
    const data = rasterizeImage(image, width, height, fit, smooth, {
      scale,
      offsetX: offset.x,
      offsetY: offset.y,
    });

    if (removeBg) {
      // Background = the most common corner color of the SOURCE image (the
      // rasterized buffer's corners may be transparent letterbox padding).
      const probe = document.createElement("canvas");
      probe.width = image.width;
      probe.height = image.height;
      const probeContext = probe.getContext("2d", { willReadFrequently: true });
      let target: RGBA | null = null;
      if (probeContext) {
        probeContext.drawImage(image, 0, 0);
        const corners: Array<[number, number]> = [
          [0, 0],
          [image.width - 1, 0],
          [0, image.height - 1],
          [image.width - 1, image.height - 1],
        ];
        const counts = new Map<string, { color: RGBA; count: number }>();
        for (const [x, y] of corners) {
          const px = probeContext.getImageData(x, y, 1, 1).data;
          const color: RGBA = [px[0], px[1], px[2], px[3]];
          if (color[3] === 0) continue;
          const id = color.join(",");
          const entry = counts.get(id) ?? { color, count: 0 };
          entry.count += 1;
          counts.set(id, entry);
        }
        target = [...counts.values()].sort((a, b) => b.count - a.count)[0]?.color ?? null;
      }
      if (target) {
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) continue;
          const dr = (data[i] - target[0]) / 255;
          const dg = (data[i + 1] - target[1]) / 255;
          const db = (data[i + 2] - target[2]) / 255;
          if (Math.sqrt((dr * dr + dg * dg + db * db) / 3) <= bgTolerance) data[i + 3] = 0;
        }
      }
    }

    resultRef.current = data;
    const imageData = context.createImageData(width, height);
    imageData.data.set(data);
    context.putImageData(imageData, 0, 0);
  }, [image, fit, smooth, removeBg, bgTolerance, scale, offset, width, height]);

  const clampScale = (value: number) => Math.max(0.05, Math.min(8, value));

  const onPreviewPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
  };

  const onPreviewPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const perPixel = width / rect.width;
    setOffset({
      x: Math.round(drag.baseX + (event.clientX - drag.startX) * perPixel),
      y: Math.round(drag.baseY + (event.clientY - drag.startY) * perPixel),
    });
  };

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Import image"
      onClick={onClose}
    >
      <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>Import image → {width}×{height}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <input
            type="file"
            accept="image/*"
            aria-label="Choose image"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) loadFile(file);
            }}
          />
          <div
            style={{
              position: "relative",
              margin: "12px 0",
              background:
                "repeating-conic-gradient(#c9c2b1 0% 25%, #b5ad9a 0% 50%) 0 0 / 12px 12px",
              border: "1px solid rgba(23,21,18,0.3)",
              aspectRatio: `${width} / ${height}`,
              maxWidth: 480,
            }}
          >
            <canvas
              ref={backdropRef}
              width={width}
              height={height}
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                imageRendering: "pixelated",
              }}
            />
            <canvas
              ref={previewRef}
              width={width}
              height={height}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                imageRendering: "pixelated",
                cursor: image ? "move" : "default",
                touchAction: "none",
              }}
              aria-label="Import preview — drag to position, wheel to scale"
              onPointerDown={onPreviewPointerDown}
              onPointerMove={onPreviewPointerMove}
              onPointerUp={() => (dragRef.current = null)}
              onPointerCancel={() => (dragRef.current = null)}
              onWheel={(event) => {
                if (!image) return;
                event.preventDefault();
                setScale((current) => clampScale(current * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
              }}
            />
          </div>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 12 }}
          >
            <label>
              fit{" "}
              <select value={fit} onChange={(event) => setFit(event.target.value as ImportFit)}>
                <option value="contain">contain</option>
                <option value="cover">cover</option>
                <option value="stretch">stretch</option>
                <option value="center">center 1:1</option>
              </select>
            </label>
            <label title="Size on top of the fit — also mouse wheel over the preview">
              scale{" "}
              <input
                type="range"
                min={0.05}
                max={4}
                step={0.01}
                value={Math.min(4, scale)}
                onChange={(event) => setScale(clampScale(Number(event.target.value)))}
              />{" "}
              {Math.round(scale * 100)}%
            </label>
            <button
              type="button"
              style={{ font: "inherit" }}
              title="Back to centered, 100%"
              onClick={() => {
                setScale(1);
                setOffset({ x: 0, y: 0 });
              }}
            >
              reset
            </button>
            <label title="Show the other layers behind the image while placing it">
              <input
                type="checkbox"
                checked={showLayers}
                onChange={(event) => setShowLayers(event.target.checked)}
              />{" "}
              show layers
            </label>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              fontSize: 12,
              marginTop: 8,
            }}
          >
            <label title="Off = hard nearest-neighbour pixels (best for pixel-art sources)">
              <input
                type="checkbox"
                checked={smooth}
                onChange={(event) => setSmooth(event.target.checked)}
              />{" "}
              smooth scaling
            </label>
            <label title="Cut the corner background color to transparent (누끼)">
              <input
                type="checkbox"
                checked={removeBg}
                onChange={(event) => setRemoveBg(event.target.checked)}
              />{" "}
              remove background
            </label>
            {removeBg && (
              <label>
                tol{" "}
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={bgTolerance}
                  onChange={(event) => setBgTolerance(Number(event.target.value))}
                />
              </label>
            )}
          </div>
          <p className={styles.modalNote}>
            Drag the image to place it · mouse wheel to scale. Apply stamps it over the layer&apos;s
            existing pixels — fine-tune afterwards with the magic eraser and pencil.
          </p>
          <div className={styles.variantActions} style={{ marginTop: 12 }}>
            <button
              type="button"
              disabled={!image}
              onClick={() => {
                if (resultRef.current) onApply(resultRef.current);
              }}
            >
              Apply to layer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
