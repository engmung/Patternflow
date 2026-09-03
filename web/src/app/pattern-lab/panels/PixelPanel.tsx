"use client";

// Pixel art editor — draw straight onto the LED matrix: pencil/eraser/shapes/
// fill, an eyedropper, a magic eraser for background removal (누끼), image
// import with fit modes, undo/redo, zoom, and a live backdrop of the other
// layers for alignment. All edits mutate the layer's RGBA buffer in place and
// bump its rev on commit.
//
// This file is the composition; each concern is a hook under ./pixel/:
// the toolbar's state, the select tool, the zoomed viewport, painting the
// three canvases, the pointer gestures, the keyboard. Undo stacks are
// lib/lab/pixelHistory. PixelPanel.test.tsx pins the behaviour.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearSurface, stampOver, type PixelSurface } from "@/lib/lab/pixelTools";
import { prunePixelHistories, redoPixels, snapshotPixels, undoPixels } from "@/lib/lab/pixelHistory";
import { buildPixelPatternCode } from "@/lib/lab/pixelToCode";
import { useActiveLayer, useLabStore } from "@/lib/lab/store";
import { isPixelLayer } from "@/lib/lab/types";
import ImportImageModal from "./ImportImageModal";
import { PixelActionBar, PixelToolBar, type CodeCopyState } from "./pixel/PixelToolbars";
import { idleStroke, type Tool } from "./pixel/tools";
import { usePixelCanvases } from "./pixel/usePixelCanvases";
import { usePixelKeyboard } from "./pixel/usePixelKeyboard";
import { usePixelPointer } from "./pixel/usePixelPointer";
import { usePixelSelection } from "./pixel/usePixelSelection";
import { usePixelToolState } from "./pixel/usePixelToolState";
import { usePixelViewport, ZOOM_MIN } from "./pixel/usePixelViewport";
import dock from "../LabPanels.module.css";

export default function PixelPanel() {
  const layer = useActiveLayer();
  const bumpPixelLayer = useLabStore((state) => state.bumpPixelLayer);
  const addPixelLayer = useLabStore((state) => state.addPixelLayer);

  // The undo stacks (lib/lab/pixelHistory) are keyed by layer id and live for
  // the tab, so a deleted layer's frames are dropped as soon as it goes.
  const liveLayerIds = useLabStore((state) => state.layers.map((entry) => entry.id).join("\n"));
  useEffect(() => {
    prunePixelHistories(liveLayerIds.split("\n"));
  }, [liveLayerIds]);

  const pixel = isPixelLayer(layer) ? layer : undefined;
  const surface: PixelSurface | null = useMemo(
    () => (pixel ? { data: pixel.data, width: pixel.width, height: pixel.height } : null),
    [pixel],
  );

  // ── history ──
  const pushUndo = useCallback(() => {
    if (pixel) snapshotPixels(pixel.id, pixel.data);
  }, [pixel]);
  const commit = useCallback(() => {
    if (pixel) bumpPixelLayer(pixel.id);
  }, [pixel, bumpPixelLayer]);
  const undo = useCallback(() => {
    if (pixel && undoPixels(pixel.id, pixel.data)) commit();
  }, [pixel, commit]);
  const redo = useCallback(() => {
    if (pixel && redoPixels(pixel.id, pixel.data)) commit();
  }, [pixel, commit]);

  // ── the pieces ──
  const tools = usePixelToolState();
  const selection = usePixelSelection({ surface, pixelId: pixel?.id ?? null, pushUndo, commit, undo });
  // The elements this panel renders own their refs; the hooks are handed them.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backdropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeRef = useRef(idleStroke());
  const viewport = usePixelViewport({ pixel, viewportRef, overlayCanvasRef });
  const [backdrop, setBackdrop] = useState(true);
  const [grid, setGrid] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [codeCopy, setCodeCopy] = useState<CodeCopyState>("idle");

  const paintOverlay = usePixelCanvases({
    pixel,
    backdrop,
    mainCanvasRef,
    backdropCanvasRef,
    overlayCanvasRef,
    strokeRef,
    tool: tools.tool,
    size: tools.size,
    currentColor: tools.currentColor,
    fillShapes: tools.fillShapes,
    floating: selection.floating,
    selection: selection.selection,
    hoverCell: viewport.hoverCell,
  });

  const switchTool = useCallback(
    (next: Tool) => {
      if (selection.floating && next !== "select") selection.commitFloating();
      tools.setTool(next);
    },
    [selection, tools],
  );

  const pointer = usePixelPointer({ pixel, surface, tools, viewport, viewportRef, selection, strokeRef, pushUndo, commit, paintOverlay });
  const onKeyDown = usePixelKeyboard({ undo, redo, selection, switchTool, setSize: tools.setSize });

  const clearLayer = () => {
    pushUndo();
    if (surface) clearSurface(surface);
    commit();
  };

  const copyAsCode = () => {
    if (!pixel) return;
    const code = buildPixelPatternCode(pixel);
    const flash = (state: CodeCopyState) => {
      setCodeCopy(state);
      window.setTimeout(() => setCodeCopy("idle"), 1400);
    };
    if (!code) {
      flash("empty");
      return;
    }
    navigator.clipboard
      .writeText(code)
      .then(() => flash("copied"))
      .catch(() => flash("failed"));
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

  const { zoom, panning, hoverCell } = viewport;

  return (
    <div className={dock.panel}>
      <PixelToolBar tools={tools} switchTool={switchTool} />
      <PixelActionBar
        tools={tools}
        selection={selection}
        viewport={viewport}
        undo={undo}
        redo={redo}
        onClear={clearLayer}
        onImport={() => setImportOpen(true)}
        onCopyCode={copyAsCode}
        codeCopy={codeCopy}
        backdrop={backdrop}
        setBackdrop={setBackdrop}
        grid={grid}
        setGrid={setGrid}
      />

      <div
        ref={viewportRef}
        className={dock.pixelViewport}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onWheel={viewport.onWheel}
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
              cursor: panning ? "grabbing" : tools.tool === "picker" ? "copy" : "crosshair",
              touchAction: "none",
            }}
            onPointerDown={pointer.onPointerDown}
            onPointerMove={pointer.onPointerMove}
            onPointerUp={pointer.onPointerUp}
            onPointerCancel={pointer.onPointerUp}
            onPointerLeave={() => viewport.setHoverCell(null)}
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
        <span>zoom {Math.max(ZOOM_MIN, zoom)}×</span>
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
