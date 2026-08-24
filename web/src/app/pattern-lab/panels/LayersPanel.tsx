"use client";

// Layer stack — Photoshop-style: top of the list is the top of the stack.
// Click selects, double-click renames, eye toggles visibility, drag reorders.
// The active layer's opacity + blend live at the bottom of the panel.

import { useState } from "react";
import { BLEND_MODES } from "@/lib/lab/types";
import { revealEditor } from "@/lib/lab/editorReveal";
import { useLabStore } from "@/lib/lab/store";
import dock from "../LabPanels.module.css";

export default function LayersPanel() {
  const layers = useLabStore((state) => state.layers);
  const activeLayerId = useLabStore((state) => state.activeLayerId);
  const layerErrors = useLabStore((state) => state.layerErrors);
  const selectLayer = useLabStore((state) => state.selectLayer);
  const addCodeLayer = useLabStore((state) => state.addCodeLayer);
  const addPixelLayer = useLabStore((state) => state.addPixelLayer);
  const duplicateLayer = useLabStore((state) => state.duplicateLayer);
  const removeLayer = useLabStore((state) => state.removeLayer);
  const reorderLayer = useLabStore((state) => state.reorderLayer);
  const renameLayer = useLabStore((state) => state.renameLayer);
  const setLayerVisible = useLabStore((state) => state.setLayerVisible);
  const setLayerOpacity = useLabStore((state) => state.setLayerOpacity);
  const setLayerBlend = useLabStore((state) => state.setLayerBlend);
  const setLayerRole = useLabStore((state) => state.setLayerRole);
  const setLayerMaskInvert = useLabStore((state) => state.setLayerMaskInvert);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const active = layers.find((layer) => layer.id === activeLayerId);

  const commitRename = () => {
    if (renamingId) renameLayer(renamingId, renameValue);
    setRenamingId(null);
  };

  return (
    <div className={dock.panel}>
      <div className={dock.panelBar}>
        <button
          type="button"
          onClick={() => {
            addCodeLayer();
            revealEditor("code", { open: true });
          }}
          title="Add a code pattern layer"
        >
          + Code
        </button>
        <button
          type="button"
          onClick={() => {
            addPixelLayer();
            revealEditor("pixel", { open: true });
          }}
          title="Add a pixel art layer"
        >
          + Pixel
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => {
            if (!active) return;
            duplicateLayer(active.id);
            revealEditor(active.type, { open: true });
          }}
          disabled={!active}
          title="Duplicate the selected layer"
        >
          Dup
        </button>
        <button
          type="button"
          onClick={() => active && removeLayer(active.id)}
          disabled={!active || layers.length <= 1}
          title={layers.length <= 1 ? "The stack needs at least one layer" : "Delete the selected layer"}
        >
          Del
        </button>
      </div>

      <div className={dock.panelBody}>
        <ol className={dock.layerList}>
          {layers.map((layer, index) => {
            const isActive = layer.id === activeLayerId;
            const error = layerErrors[layer.id];
            return (
              <li key={layer.id}>
                <div
                  className={`${dock.layerRow}${isActive ? ` ${dock.layerRowActive}` : ""}`}
                  data-dragover={dragOverIndex === index && dragIndex !== index ? "true" : undefined}
                  draggable={renamingId !== layer.id}
                  onDragStart={(event) => {
                    setDragIndex(index);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (dragOverIndex !== index) setDragOverIndex(index);
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === index) setDragOverIndex(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragIndex !== null) reorderLayer(dragIndex, index);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onClick={() => {
                    selectLayer(layer.id);
                    // Fronts the matching editor tab even when this layer is
                    // already active — clicking a layer means "let me edit it".
                    revealEditor(layer.type);
                  }}
                  onDoubleClick={() => {
                    setRenamingId(layer.id);
                    setRenameValue(layer.name);
                  }}
                  role="button"
                  aria-pressed={isActive}
                  title="Click to select · double-click to rename · drag to reorder"
                >
                  <button
                    type="button"
                    className={`${dock.layerEye}${layer.visible ? "" : ` ${dock.layerEyeOff}`}`}
                    aria-label={layer.visible ? "Hide layer" : "Show layer"}
                    title={layer.visible ? "Hide layer" : "Show layer"}
                    onClick={(event) => {
                      event.stopPropagation();
                      setLayerVisible(layer.id, !layer.visible);
                    }}
                  >
                    {layer.visible ? "●" : "○"}
                  </button>

                  {renamingId === layer.id ? (
                    <input
                      className={dock.layerRenameInput}
                      value={renameValue}
                      autoFocus
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename();
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ) : (
                    <span className={dock.layerName}>{layer.name}</span>
                  )}

                  {error && (
                    <span className={dock.layerErrDot} title={error} aria-label="Layer error" />
                  )}
                  {layer.role === "mask" ? (
                    <span
                      className={dock.layerType}
                      title={`Masks the layer below${layer.maskInvert ? " (inverted)" : ""}`}
                      style={{ opacity: 1 }}
                    >
                      {layer.maskInvert ? "¬MASK↓" : "MASK↓"}
                    </span>
                  ) : (
                    (layer.opacity < 1 || layer.blend !== "normal") && (
                      <span className={dock.layerMeta}>
                        {layer.blend !== "normal" ? `${layer.blend} ` : ""}
                        {Math.round(layer.opacity * 100)}%
                      </span>
                    )
                  )}
                  <span className={dock.layerType}>{layer.type === "code" ? "JS" : "PX"}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {active && (
        <div className={dock.layerControls}>
          <div className={dock.layerControlRow}>
            <span>Mask</span>
            <label
              className={dock.layerMaskLabel}
              title="Turn this layer into a mask for the layer directly below it. Pixel art: drawn pixels reveal. Code: bright output (past 0.5, ramp-tunable) reveals."
            >
              <input
                type="checkbox"
                checked={active.role === "mask"}
                onChange={(event) =>
                  setLayerRole(active.id, event.target.checked ? "mask" : "paint")
                }
              />
              masks layer below
            </label>
            {active.role === "mask" && (
              <label className={dock.layerMaskLabel} title="Flip the mask: dark/empty reveals instead">
                <input
                  type="checkbox"
                  checked={active.maskInvert}
                  onChange={(event) => setLayerMaskInvert(active.id, event.target.checked)}
                />
                invert
              </label>
            )}
          </div>
          {active.role !== "mask" && (
            <>
              <div className={dock.layerControlRow}>
                <span>Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={active.opacity}
                  aria-label="Layer opacity"
                  onChange={(event) => setLayerOpacity(active.id, Number(event.target.value))}
                />
                <span className={dock.layerControlValue}>{Math.round(active.opacity * 100)}%</span>
              </div>
              <div className={dock.layerControlRow}>
                <span>Blend</span>
                <select
                  value={active.blend}
                  aria-label="Layer blend mode"
                  onChange={(event) =>
                    setLayerBlend(active.id, event.target.value as (typeof BLEND_MODES)[number])
                  }
                >
                  {BLEND_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
