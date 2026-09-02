"use client";

// Composite preview — the single place the whole layer stack renders. Owns the
// animation loop: reads the store imperatively each frame, drives the shared
// LabEngine, paints the composite, and mirrors per-layer errors back into the
// store (throttled) for the Layers/Code panels.
//
// Camera view (📷): Blender's numpad-0 for the lab. When the Graphic Export
// viewfinder is on, this panel shows the CAPTURE OUTPUT render — the capture
// worker's frames at the output size, look, backdrop and turn — instead of
// the matrix composite; a chip in the header names the borrowed view and
// clicks back out. The project matrix (and everything keyed to it: prompts,
// hardware export, publishing) never changes — this is a view, not a mode.
// The engine loop keeps running underneath so layer errors keep flowing.
// This hook into lib/lab/capture/session is the one place the lab touches
// the capture add-on; removing capture means removing this and the lab is
// whole again.

import { useEffect, useRef, useState } from "react";
import {
  MATRIX_HEAVY_PIXELS,
  MATRIX_MAX,
  MATRIX_MIN,
  clampMatrixDimension,
  formatMatrix,
} from "@/lib/pattern/matrix";
import { labEngine } from "@/lib/lab/engine";
import { captureSession, type CaptureSessionState } from "@/lib/lab/capture/session";
import { useLabStore } from "@/lib/lab/store";
import styles from "../PatternLab.module.css";
import dock from "../LabPanels.module.css";

const RESOLUTION_PRESETS = [
  { value: "128x64", label: "128 × 64 (Patternflow Standard)" },
  { value: "64x128", label: "64 × 128 (Patternflow Vertical)" },
  { value: "64x64", label: "64 × 64 (Square)" },
];

export default function PreviewPanel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stats, setStats] = useState({ fps: 0, ms: 0 });
  const [camera, setCamera] = useState<CaptureSessionState>(() => captureSession.getState());
  const cameraOnRef = useRef(camera.view);
  useEffect(
    () =>
      captureSession.subscribe((state) => {
        cameraOnRef.current = state.view;
        setCamera(state);
      }),
    [],
  );
  // While camera view is on, the capture worker paints into this canvas.
  useEffect(() => {
    if (!camera.view) return;
    const canvas = cameraCanvasRef.current;
    if (!canvas) return;
    return captureSession.attachViewfinder(canvas);
  }, [camera.view]);
  const matrix = useLabStore((state) => state.matrix);
  const setMatrix = useLabStore((state) => state.setMatrix);
  const activeError = useLabStore(
    (state) => state.layerErrors[state.activeLayerId] ?? null,
  );

  const resPreset = `${matrix.width}x${matrix.height}`;
  const isPresetMatrix = RESOLUTION_PRESETS.some((preset) => preset.value === resPreset);
  const [customOpen, setCustomOpen] = useState(false);
  const showCustomMatrix = customOpen || !isPresetMatrix;
  const customWidthRef = useRef<HTMLInputElement | null>(null);
  const customHeightRef = useRef<HTMLInputElement | null>(null);

  const commitCustomMatrix = () => {
    const width = clampMatrixDimension(Number(customWidthRef.current?.value));
    const height = clampMatrixDimension(Number(customHeightRef.current?.value));
    if (width === null || height === null) {
      if (customWidthRef.current) customWidthRef.current.value = String(matrix.width);
      if (customHeightRef.current) customHeightRef.current.value = String(matrix.height);
      return;
    }
    setMatrix({ width, height });
    if (customWidthRef.current) customWidthRef.current.value = String(width);
    if (customHeightRef.current) customHeightRef.current.value = String(height);
  };

  useEffect(() => {
    let frameId = 0;
    let lastNow = performance.now();
    let simTime = 0;
    let statsStartedAt = lastNow;
    let statsFrames = 0;
    let lastRenderMs = 0;
    let lastErrorSync = 0;

    const tick = (now: number) => {
      const dt = Math.min(Math.max(0, (now - lastNow) / 1000), 0.05);
      lastNow = now;
      simTime += dt;

      const state = useLabStore.getState();
      const frame = labEngine.render(
        {
          matrix: state.matrix,
          layers: state.layers,
          activeLayerId: state.activeLayerId,
          knobs: state.knobs,
          ranges: state.ranges,
        },
        dt,
        simTime,
      );
      lastRenderMs = frame.renderMs;

      const canvas = cameraOnRef.current ? null : canvasRef.current;
      if (canvas) {
        if (canvas.width !== frame.width) canvas.width = frame.width;
        if (canvas.height !== frame.height) canvas.height = frame.height;
        const context = canvas.getContext("2d");
        if (context) {
          const imageData = context.createImageData(frame.width, frame.height);
          imageData.data.set(frame.data);
          context.putImageData(imageData, 0, 0);
        }
      }

      // Mirror engine errors into the store at a human cadence.
      if (now - lastErrorSync > 300) {
        lastErrorSync = now;
        const errors: Record<string, string | null> = {};
        labEngine.errors.forEach((value, key) => {
          errors[key] = value;
        });
        state.setLayerErrors(errors);
      }

      statsFrames += 1;
      if (now - statsStartedAt > 500) {
        setStats({ fps: (statsFrames * 1000) / (now - statsStartedAt), ms: lastRenderMs });
        statsStartedAt = now;
        statsFrames = 0;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className={dock.panel}>
      <div className={dock.panelBar}>
        <span className={styles.stats}>
          <span>{stats.fps.toFixed(0)} fps</span>
          <span className={styles.dotSep}>·</span>
          <span>{stats.ms.toFixed(2)} ms</span>
        </span>
        <span style={{ flex: 1 }} />
        <select
          className={styles.headerSelect}
          value={showCustomMatrix ? "custom" : resPreset}
          aria-label="Pattern frame"
          title="The pixel grid this composition is drawn at. Attached to exports as an @matrix line."
          onChange={(event) => {
            if (event.target.value === "custom") {
              setCustomOpen(true);
              return;
            }
            setCustomOpen(false);
            const [width, height] = event.target.value.split("x").map(Number);
            if (Number.isFinite(width) && Number.isFinite(height)) {
              setMatrix({ width, height });
            }
          }}
        >
          {RESOLUTION_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        {showCustomMatrix && (
          <span className={styles.customMatrix}>
            {(["width", "height"] as const).map((edge, index) => (
              <span key={edge} className={styles.customMatrixField}>
                {index === 1 && <span aria-hidden="true">×</span>}
                <input
                  key={`${edge}-${matrix[edge]}`}
                  ref={edge === "width" ? customWidthRef : customHeightRef}
                  type="number"
                  inputMode="numeric"
                  min={MATRIX_MIN}
                  max={MATRIX_MAX}
                  defaultValue={matrix[edge]}
                  aria-label={`Frame ${edge}`}
                  title={`${MATRIX_MIN}–${MATRIX_MAX} pixels`}
                  onBlur={commitCustomMatrix}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      event.currentTarget.value = String(matrix[edge]);
                      event.currentTarget.blur();
                    }
                  }}
                />
              </span>
            ))}
          </span>
        )}
        {camera.view && (
          <button
            type="button"
            className={styles.cameraChip}
            title="Camera view — showing the Graphic Export render. The project frame stays as picked here; click to go back to it."
            onClick={() => captureSession.setView(false)}
          >
            📷 {camera.output ? `${camera.output.width} × ${camera.output.height}` : "output"} · exit
          </button>
        )}
        {matrix.width * matrix.height > MATRIX_HEAVY_PIXELS && (
          <span
            className={styles.frameWarning}
            title="Large frames cost proportionally more per preview frame, and the ESP32 has to fill every one of those pixels too."
          >
            heavy
          </span>
        )}
      </div>

      <div className={dock.previewBody}>
        <div className={dock.previewCanvasBox}>
          <div
            className={dock.previewFrame}
            style={
              camera.view
                ? {
                    aspectRatio: camera.output
                      ? `${camera.output.width} / ${camera.output.height}`
                      : `${matrix.width} / ${matrix.height}`,
                    width: "100%",
                  }
                : { aspectRatio: `${matrix.width} / ${matrix.height}`, width: "100%" }
            }
          >
            {camera.view ? (
              <canvas
                key="camera"
                ref={cameraCanvasRef}
                className={dock.cameraCanvas}
                style={
                  camera.output
                    ? { aspectRatio: `${camera.output.width} / ${camera.output.height}` }
                    : undefined
                }
                aria-label="Camera view — the capture output render"
              />
            ) : (
              <canvas
                key="matrix"
                ref={canvasRef}
                width={matrix.width}
                height={matrix.height}
                style={{ aspectRatio: `${matrix.width} / ${matrix.height}` }}
                aria-label={`Composite preview, ${formatMatrix(matrix)}`}
              />
            )}
          </div>
        </div>
        {activeError && <div className={styles.errorBox}>{activeError}</div>}
      </div>
    </div>
  );
}
