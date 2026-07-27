"use client";

// Color ramp for the focused code layer — chained to the code, so every code
// layer keeps its own ramp. New in the layered lab: per-stop ALPHA, drawn over
// a checkerboard, which is what lets a value field fade out and reveal the
// layers underneath.

import { useCallback, useEffect, useRef } from "react";
import {
  RAMP_MODES,
  buildRampLUTRGBA,
  sampleRampRGBA,
  type RampMode,
} from "@/lib/patternHarness";
import { codeUsesValueField } from "@/lib/patternRamp";
import { rampStateToHarness } from "@/lib/lab/engine";
import { DEFAULT_RAMP_STATE } from "@/lib/lab/types";
import { useFocusCodeLayer, useLabStore } from "@/lib/lab/store";
import styles from "../PatternLab.module.css";
import dock from "../LabPanels.module.css";

function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${((toByte(r) << 16) | (toByte(g) << 8) | toByte(b)).toString(16).padStart(6, "0")}`;
}

export default function RampPanel() {
  const layer = useFocusCodeLayer();
  const setLayerRampMode = useLabStore((state) => state.setLayerRampMode);
  const setLayerRampWrap = useLabStore((state) => state.setLayerRampWrap);
  const setLayerRecolor = useLabStore((state) => state.setLayerRecolor);
  const updateLayerRampStop = useLabStore((state) => state.updateLayerRampStop);
  const addLayerRampStop = useLabStore((state) => state.addLayerRampStop);
  const deleteLayerRampStop = useLabStore((state) => state.deleteLayerRampStop);
  const setLayerRampStops = useLabStore((state) => state.setLayerRampStops);
  const addCodeLayer = useLabStore((state) => state.addCodeLayer);
  const selectedStopIndex = useLabStore((state) => state.rampSelection[layer?.id ?? ""] ?? 0);
  const setRampSelection = useLabStore((state) => state.setRampSelection);

  const rampBarRef = useRef<HTMLCanvasElement | null>(null);
  const rampTrackRef = useRef<HTMLDivElement | null>(null);
  const stopDragRef = useRef<{ index: number } | null>(null);
  const layerIdRef = useRef<string | null>(null);
  const layerId = layer?.id ?? null;
  useEffect(() => {
    layerIdRef.current = layerId;
  }, [layerId]);

  const ramp = layer?.ramp ?? null;

  // Paint the gradient bar: checkerboard first, then the RGBA LUT over it, so
  // transparent stops are visibly transparent.
  useEffect(() => {
    const canvas = rampBarRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !ramp) return;
    const lut = buildRampLUTRGBA(rampStateToHarness(ramp));
    const width = 256;
    const height = 14;
    context.clearRect(0, 0, width, height);
    const cell = 4;
    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        const even = ((x / cell) | 0) % 2 === ((y / cell) | 0) % 2;
        context.fillStyle = even ? "#c9c2b1" : "#b5ad9a";
        context.fillRect(x, y, cell, cell);
      }
    }
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let x = 0; x < width; x++) {
      const li = x * 4;
      const a = lut[li + 3] / 255;
      for (let y = 0; y < height; y++) {
        const index = (y * width + x) * 4;
        data[index] = lut[li] * a + data[index] * (1 - a);
        data[index + 1] = lut[li + 1] * a + data[index + 1] * (1 - a);
        data[index + 2] = lut[li + 2] * a + data[index + 2] * (1 - a);
        data[index + 3] = 255;
      }
    }
    context.putImageData(imageData, 0, 0);
  }, [ramp]);

  const rampPositionFromClientX = useCallback((clientX: number) => {
    const track = rampTrackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const raw = (clientX - rect.left) / rect.width;
    return Math.round(Math.max(0, Math.min(1, raw)) * 1000) / 1000;
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = stopDragRef.current;
      const id = layerIdRef.current;
      if (!drag || !id) return;
      event.preventDefault();
      updateLayerRampStop(id, drag.index, { position: rampPositionFromClientX(event.clientX) });
    };
    const endDrag = () => {
      stopDragRef.current = null;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", endDrag);
    };
  }, [rampPositionFromClientX, updateLayerRampStop]);

  if (!layer || !ramp) {
    return (
      <div className={dock.panel}>
        <div className={dock.panelHint}>
          The color ramp chains to a code layer — none is in the stack yet.
          <button type="button" onClick={addCodeLayer}>
            + Add code layer
          </button>
        </div>
      </div>
    );
  }

  const activeStopIndex = Math.min(selectedStopIndex, ramp.stops.length - 1);
  const activeStop = ramp.stops[activeStopIndex];
  const usesValueField = codeUsesValueField(layer.code);

  const addStopAt = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (ramp.stops.length >= 64) return;
    event.preventDefault();
    const position = rampPositionFromClientX(event.clientX);
    // New stop inherits the ramp's current color (and alpha) at that spot, so
    // adding a stop never visibly changes the gradient.
    const [r, g, b, a] = sampleRampRGBA(rampStateToHarness(ramp), position);
    const newIndex = ramp.stops.length;
    addLayerRampStop(layer.id, { position, color: rgbToHex(r, g, b), alpha: a });
    setRampSelection(layer.id, newIndex);
    stopDragRef.current = { index: newIndex };
  };

  const startStopDrag = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setRampSelection(layer.id, index);
    stopDragRef.current = { index };
  };

  const deleteStop = (index: number) => {
    deleteLayerRampStop(layer.id, index);
    setRampSelection(layer.id, index === activeStopIndex ? 0 : Math.max(0, activeStopIndex - 1));
  };

  return (
    <div className={dock.panel}>
      <div className={dock.panelBar}>
        <label title="Ramp is chained to this code layer">{layer.name}</label>
        <span style={{ flex: 1 }} />
        <select
          value={ramp.mode}
          aria-label="Ramp interpolation mode"
          title="How colors blend between stops"
          onChange={(event) => setLayerRampMode(layer.id, event.target.value as RampMode)}
        >
          {RAMP_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode === "hsvShort" ? "hsv short" : mode === "hsvLong" ? "hsv long" : mode}
            </option>
          ))}
        </select>
        <label
          className={styles.rampToggle}
          title="Cyclic ramp — blends past the last stop back into the first"
        >
          <input
            type="checkbox"
            checked={ramp.wrap}
            onChange={(event) => setLayerRampWrap(layer.id, event.target.checked)}
          />
          wrap
        </label>
        <label
          className={styles.rampToggle}
          title="Recolor this layer: map each drawn pixel's luminance through the ramp (works on RGB patterns too)"
        >
          <input
            type="checkbox"
            checked={layer.recolor}
            onChange={(event) => setLayerRecolor(layer.id, event.target.checked)}
          />
          recolor
        </label>
      </div>

      <div className={`${dock.panelBody} ${dock.rampDock}`}>
        <div
          ref={rampTrackRef}
          className={styles.rampTrack}
          title="Click to add a stop · drag a line to move it"
          onPointerDown={addStopAt}
        >
          <canvas
            ref={rampBarRef}
            className={styles.rampBar}
            width={256}
            height={14}
            aria-label="Ramp gradient preview"
          />
          {ramp.stops.map((stop, index) => (
            <button
              key={index}
              type="button"
              className={`${styles.rampHandle}${index === activeStopIndex ? ` ${styles.rampHandleActive}` : ""}`}
              style={{ left: `${stop.position * 100}%` }}
              aria-label={`Ramp stop at ${stop.position.toFixed(2)}`}
              title={`${stop.color} @ ${stop.position.toFixed(2)}${stop.alpha < 1 ? ` · ${Math.round(stop.alpha * 100)}% alpha` : ""} — drag to move, Delete to remove`}
              onPointerDown={(event) => startStopDrag(event, index)}
              onKeyDown={(event) => {
                if (event.key === "Delete" || event.key === "Backspace") {
                  event.preventDefault();
                  deleteStop(index);
                }
              }}
            >
              <span style={{ background: stop.color, opacity: 0.35 + stop.alpha * 0.65 }} />
            </button>
          ))}
        </div>

        {activeStop && (
          <>
            <div className={styles.rampStopEdit}>
              <input
                type="color"
                value={activeStop.color}
                aria-label="Selected stop color"
                onChange={(event) =>
                  updateLayerRampStop(layer.id, activeStopIndex, { color: event.target.value })
                }
              />
              <span className={styles.rampStopPos}>@ {activeStop.position.toFixed(2)}</span>
              <button
                type="button"
                className={styles.rampStopDelete}
                disabled={ramp.stops.length <= 1}
                title={
                  ramp.stops.length <= 1 ? "The ramp needs at least one stop" : "Remove this stop"
                }
                onClick={() => deleteStop(activeStopIndex)}
              >
                Delete
              </button>
              <button
                type="button"
                className={styles.rampResetBtn}
                title="Reset to the default ramp: 0 = black, 1 = white"
                onClick={() =>
                  setLayerRampStops(
                    layer.id,
                    DEFAULT_RAMP_STATE.stops.map((stop) => ({ ...stop })),
                  )
                }
              >
                Reset
              </button>
              <button
                type="button"
                className={styles.rampResetBtn}
                title="Make the low end of the ramp transparent — the classic setup for layering value fields"
                onClick={() => {
                  const lowest = ramp.stops.reduce(
                    (best, stop, index) =>
                      stop.position < ramp.stops[best].position ? index : best,
                    0,
                  );
                  updateLayerRampStop(layer.id, lowest, { alpha: 0 });
                }}
              >
                Fade low
              </button>
            </div>
            <div className={dock.rampAlphaRow}>
              <span>Alpha</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={activeStop.alpha}
                aria-label="Selected stop alpha"
                title="Opacity of this stop — transparent stops let lower layers show through"
                onChange={(event) =>
                  updateLayerRampStop(layer.id, activeStopIndex, {
                    alpha: Number(event.target.value),
                  })
                }
              />
              <span className={dock.rampAlphaValue}>{Math.round(activeStop.alpha * 100)}%</span>
            </div>
          </>
        )}

        {!usesValueField && !layer.recolor && (
          <p className={styles.rampHint}>
            This layer draws RGB directly — the ramp applies when the code uses display.setValue,
            or when recolor is on.
          </p>
        )}
      </div>
    </div>
  );
}
