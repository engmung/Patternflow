"use client";

// ── The two toolbars ─────────────────────────────────────────────────────────
// Row one: the tool, the brush, the colour, the swatches. Row two: what the
// current tool needs (selection scale, tolerance, fill), undo/redo/clear,
// import, copy-as-code, and the view (onion, grid, zoom). Presentation only:
// every action is a prop.

import { TOOLS, type Tool } from "./tools";
import type { PixelSelection } from "./usePixelSelection";
import type { PixelToolState } from "./usePixelToolState";
import type { PixelViewport } from "./usePixelViewport";
import dock from "../../LabPanels.module.css";

export function PixelToolBar({ tools, switchTool }: { tools: PixelToolState; switchTool: (tool: Tool) => void }) {
  const { tool, size, setSize, colorHex, setColorHex, alpha, setAlpha, swatches } = tools;
  return (
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
          onChange={(event) => setSize(Math.max(1, Math.min(8, Math.round(Number(event.target.value)) || 1)))}
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
  );
}

export type CodeCopyState = "idle" | "copied" | "empty" | "failed";

export function PixelActionBar({
  tools,
  selection,
  viewport,
  undo,
  redo,
  onClear,
  onImport,
  onCopyCode,
  codeCopy,
  backdrop,
  setBackdrop,
  grid,
  setGrid,
}: {
  tools: PixelToolState;
  selection: PixelSelection;
  viewport: PixelViewport;
  undo: () => void;
  redo: () => void;
  onClear: () => void;
  onImport: () => void;
  onCopyCode: () => void;
  codeCopy: CodeCopyState;
  backdrop: boolean;
  setBackdrop: (on: boolean) => void;
  grid: boolean;
  setGrid: (on: boolean) => void;
}) {
  const { tool, fillShapes, setFillShapes, tolerance, setTolerance, contiguous, setContiguous } = tools;
  const { floating, commitFloating, cancelFloating, scaleFloating } = selection;
  return (
    <div className={dock.panelBar}>
      {tool === "select" &&
        (floating ? (
          <>
            <label title="Nearest-neighbour scale — pixels stay crisp, just bigger">scale</label>
            <button type="button" aria-label="Scale down" onClick={() => scaleFloating(-0.25)}>
              −
            </button>
            <span>{Math.round(floating.scale * 100)}%</span>
            <button type="button" aria-label="Scale up" onClick={() => scaleFloating(0.25)}>
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
              <input type="checkbox" checked={contiguous} onChange={(event) => setContiguous(event.target.checked)} />
              contiguous
            </label>
          )}
        </>
      )}
      {(tool === "rect" || tool === "ellipse") && (
        <label title="Fill shapes or draw outlines">
          <input type="checkbox" checked={fillShapes} onChange={(event) => setFillShapes(event.target.checked)} />
          filled
        </label>
      )}
      <button type="button" onClick={undo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button type="button" onClick={redo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>
      <button type="button" onClick={onClear} title="Clear the layer to transparent">
        Clear
      </button>
      <span className={dock.toolSep} />
      <button type="button" onClick={onImport} title="Import an image into this layer">
        Import image
      </button>
      <button
        type="button"
        onClick={onCopyCode}
        title="Copy this drawing as a standalone pattern (JS) — paste it into an AI chat and ask for motion or distortion. The pixel layer stays exactly as it is."
      >
        {codeCopy === "copied"
          ? "Copied ✓"
          : codeCopy === "empty"
            ? "Layer is empty"
            : codeCopy === "failed"
              ? "Copy failed"
              : "Copy as code"}
      </button>
      <span style={{ flex: 1 }} />
      <label title="Show the other layers behind this one">
        <input type="checkbox" checked={backdrop} onChange={(event) => setBackdrop(event.target.checked)} />
        onion
      </label>
      <label title="Pixel grid (visible when zoomed in)">
        <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
        grid
      </label>
      <button type="button" onClick={() => viewport.zoomBy(-1)} aria-label="Zoom out">
        −
      </button>
      <button type="button" onClick={() => viewport.zoomBy(1)} aria-label="Zoom in">
        +
      </button>
      <button type="button" onClick={viewport.fitZoom} title="Fit the canvas to the panel">
        Fit
      </button>
    </div>
  );
}
