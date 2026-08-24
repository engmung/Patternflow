"use client";

// Capture — the lab's output stage. A second, independent render of the
// layer stack for pictures and clips rather than for the LED panel: pick a
// print/screen size, a look (auto, re-rendered, pixel blocks, or LED dots),
// a turn, pause on the moment you want, and save a PNG or record an
// MP4/WebM.
//
// Everything runs in lib/lab/capture (a worker with its own engine). This
// component only holds the controls and shows the bitmaps the worker sends;
// it reads the store like the preview does and never writes to it.

import { useCallback, useEffect, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { useLabStore } from "@/lib/lab/store";
import { isCodeLayer } from "@/lib/lab/types";
import { buildAnySizePrompt } from "@/lib/lab/capture/anySizePrompt";
import { CaptureClient, captureSupported, type ProjectSlice } from "@/lib/lab/capture/client";
import { resolveGeometry } from "@/lib/lab/capture/core";
import { captureFileName, downloadBlob } from "@/lib/lab/capture/download";
import {
  loadCaptureSettings,
  normalizeCaptureSettings,
  presetFor,
  saveCaptureSettings,
  sizePresets,
} from "@/lib/lab/capture/settings";
import {
  CAPTURE_FPS,
  CAPTURE_SCALES,
  CAPTURE_SECONDS_MAX,
  CAPTURE_SIDE_MAX,
  CAPTURE_SIDE_MIN,
  CAPTURE_SPEEDS,
  SIZED_STYLES,
  type AutoVerdict,
  type CaptureSettings,
  type FrameMessage,
} from "@/lib/lab/capture/types";
import styles from "../PatternLab.module.css";
import dock from "../LabPanels.module.css";
import local from "./CapturePanel.module.css";

const PROJECT_SEND_DEBOUNCE_MS = 40;
const HUD_INTERVAL_MS = 200;

type LayerError = { id: string; name: string; text: string };

type Hud = {
  time: number;
  playing: boolean;
  renderMs: number;
  fps: number;
  width: number;
  height: number;
  errors: LayerError[];
  auto: AutoVerdict | null;
  /** Linear scale of the live stage vs the export size; null = exact. */
  preview: number | null;
};

function nameErrors(errors: Record<string, string>): LayerError[] {
  const layers = useLabStore.getState().layers;
  return Object.entries(errors).map(([id, text]) => ({
    id,
    name: layers.find((layer) => layer.id === id)?.name ?? "layer",
    text,
  }));
}

type ExportState = { kind: "image" | "video"; done: number; total: number };

function projectSlice(): ProjectSlice {
  const state = useLabStore.getState();
  return {
    matrix: state.matrix,
    layers: state.layers,
    activeLayerId: state.activeLayerId,
    knobs: state.knobs,
    ranges: state.ranges,
  };
}

function captureTitle(): string {
  const state = useLabStore.getState();
  return state.forkOf?.title ?? state.layers[0]?.name ?? "capture";
}

/** The code layer a rewrite prompt targets: the active one if it is code, else the topmost code layer. */
function focusCodeLayer() {
  const state = useLabStore.getState();
  const active = state.layers.find((layer) => layer.id === state.activeLayerId);
  return isCodeLayer(active) ? active : state.layers.find(isCodeLayer);
}

export default function CapturePanel(props: IDockviewPanelProps) {
  const [supported] = useState(() => captureSupported());
  const [settings, setSettings] = useState<CaptureSettings>(() => loadCaptureSettings());
  const [hud, setHud] = useState<Hud>({
    time: 0,
    playing: false,
    renderMs: 0,
    fps: 0,
    width: 0,
    height: 0,
    errors: [],
    auto: null,
    preview: null,
  });
  const [exporting, setExporting] = useState<ExportState | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const matrix = useLabStore((state) => state.matrix);

  const clientRef = useRef<CaptureClient | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapContextRef = useRef<ImageBitmapRenderingContext | null>(null);
  const hudRef = useRef({ lastAt: 0, frames: 0, windowStart: 0, fps: 0 });
  const exportingRef = useRef(false);

  const geometry = resolveGeometry(settings, matrix);

  const update = useCallback((patch: Partial<CaptureSettings>) => {
    setSettings((current) => normalizeCaptureSettings({ ...current, ...patch }));
  }, []);
  const updateVideo = useCallback((patch: Partial<CaptureSettings["video"]>) => {
    setSettings((current) =>
      normalizeCaptureSettings({ ...current, video: { ...current.video, ...patch } }),
    );
  }, []);

  // ── worker lifetime ──
  useEffect(() => {
    if (!supported) return;
    const panelApi = props.api;
    let sendTimer: ReturnType<typeof setTimeout> | null = null;

    const onFrame = (frame: FrameMessage) => {
      const canvas = canvasRef.current;
      if (canvas) {
        if (canvas.width !== frame.width) canvas.width = frame.width;
        if (canvas.height !== frame.height) canvas.height = frame.height;
        const context =
          bitmapContextRef.current ??
          (bitmapContextRef.current = canvas.getContext("bitmaprenderer"));
        if (context) context.transferFromImageBitmap(frame.bitmap);
        else frame.bitmap.close();
      } else {
        frame.bitmap.close();
      }
      // Ack once the browser has had a chance to paint: this is what paces
      // the worker to the display instead of to its own render speed.
      requestAnimationFrame(() => clientRef.current?.frameShown());

      const now = performance.now();
      const stats = hudRef.current;
      stats.frames += 1;
      if (now - stats.windowStart > 1000) {
        stats.fps = (stats.frames * 1000) / Math.max(1, now - stats.windowStart);
        stats.frames = 0;
        stats.windowStart = now;
      }
      if (now - stats.lastAt > HUD_INTERVAL_MS) {
        stats.lastAt = now;
        setHud({
          time: frame.time,
          playing: frame.playing,
          renderMs: frame.renderMs,
          fps: stats.fps,
          width: frame.width,
          height: frame.height,
          errors: nameErrors(frame.errors),
          auto: frame.auto,
          preview: frame.preview,
        });
      }
    };

    const client = new CaptureClient({
      onFrame,
      onState: (state) => {
        setHud((current) => ({ ...current, time: state.time, playing: state.playing }));
      },
      onProgress: (done, total) => {
        setExporting((current) => (current ? { ...current, done, total } : current));
      },
      onFatal: (text) => setFatal(text),
    });
    clientRef.current = client;
    client.sendSettings(loadCaptureSettings());
    client.sendProject(projectSlice());

    const sendProject = () => {
      if (sendTimer !== null) clearTimeout(sendTimer);
      sendTimer = setTimeout(() => {
        sendTimer = null;
        client.sendProject(projectSlice());
      }, PROJECT_SEND_DEBOUNCE_MS);
    };
    const unsubscribe = useLabStore.subscribe((state, previous) => {
      if (
        state.layers !== previous.layers ||
        state.matrix !== previous.matrix ||
        state.knobs !== previous.knobs ||
        state.ranges !== previous.ranges ||
        state.activeLayerId !== previous.activeLayerId
      ) {
        sendProject();
      }
    });

    // Hidden tab or hidden panel: the worker idles instead of rendering into
    // the void.
    const syncVisible = () => {
      client.setVisible(panelApi.isVisible && document.visibilityState === "visible");
    };
    const visibility = panelApi.onDidVisibilityChange(syncVisible);
    document.addEventListener("visibilitychange", syncVisible);
    syncVisible();

    return () => {
      if (sendTimer !== null) clearTimeout(sendTimer);
      unsubscribe();
      visibility.dispose();
      document.removeEventListener("visibilitychange", syncVisible);
      client.dispose();
      clientRef.current = null;
      bitmapContextRef.current = null;
    };
  }, [supported, props.api]);

  // Settings reach the worker and disk together.
  useEffect(() => {
    clientRef.current?.sendSettings(settings);
    saveCaptureSettings(settings);
  }, [settings]);

  // ── exports ──
  const saveImage = async () => {
    const client = clientRef.current;
    if (!client || exportingRef.current) return;
    exportingRef.current = true;
    setExporting({ kind: "image", done: 0, total: 1 });
    setMessage(null);
    const title = captureTitle();
    try {
      const blob = await client.exportImage();
      const name = captureFileName(title, geometry.output, "png");
      downloadBlob(blob, name);
      setMessage({ text: `Saved ${name}`, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      exportingRef.current = false;
      setExporting(null);
    }
  };

  const recordVideo = async () => {
    const client = clientRef.current;
    if (!client || exportingRef.current) return;
    exportingRef.current = true;
    const total = Math.round(settings.video.seconds * settings.video.fps);
    setExporting({ kind: "video", done: 0, total });
    setMessage(null);
    const title = captureTitle();
    try {
      const { blob, extension } = await client.exportVideo(settings.video);
      const name = captureFileName(title, geometry.output, extension);
      downloadBlob(blob, name);
      setMessage({
        text: `Saved ${name} (${(blob.size / 1_048_576).toFixed(1)} MB)`,
        error: false,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage({ text: text === "cancelled" ? "Recording cancelled." : text, error: text !== "cancelled" });
    } finally {
      exportingRef.current = false;
      setExporting(null);
    }
  };

  const copyAnySizePrompt = async () => {
    const layer = focusCodeLayer();
    if (!layer) {
      setMessage({ text: "No code layer to rewrite.", error: true });
      return;
    }
    try {
      await navigator.clipboard.writeText(buildAnySizePrompt(layer.code, matrix));
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1200);
      setMessage({
        text: `Prompt for "${layer.name}" copied — paste it into any AI, then paste the code it returns into the Code panel. Auto re-checks the new code by itself.`,
        error: false,
      });
    } catch {
      setMessage({ text: "Clipboard access was refused.", error: true });
    }
  };

  // ── native size entry ──
  const widthRef = useRef<HTMLInputElement | null>(null);
  const heightRef = useRef<HTMLInputElement | null>(null);
  const commitSize = () => {
    const width = Number(widthRef.current?.value);
    const height = Number(heightRef.current?.value);
    update({
      width: Number.isFinite(width) ? width : settings.width,
      height: Number.isFinite(height) ? height : settings.height,
    });
  };

  if (!supported) {
    return (
      <div className={dock.panel}>
        <div className={local.hint}>
          Capture needs Web Workers and OffscreenCanvas — a current Chrome, Edge, Firefox or Safari.
        </div>
      </div>
    );
  }

  const presets = sizePresets(matrix);
  const preset = presetFor(settings, matrix);
  const busy = exporting !== null;
  const progress = exporting && exporting.total > 0 ? exporting.done / exporting.total : 0;

  return (
    <div className={dock.panel}>
      {/* transport */}
      <div className={`${dock.panelBar} ${local.bar}`}>
        <button
          type="button"
          data-active={hud.playing ? "true" : undefined}
          title={hud.playing ? "Pause the stage on this frame" : "Play"}
          disabled={busy}
          onClick={() => (hud.playing ? clientRef.current?.pause() : clientRef.current?.play())}
        >
          {hud.playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          title="Start over: fresh pattern state, time zero"
          disabled={busy}
          onClick={() => clientRef.current?.restart()}
        >
          ⟲
        </button>
        <span className={local.group}>
          <button
            type="button"
            title={`Back one frame (1/${settings.video.fps} s) — moves the clock only`}
            disabled={busy}
            onClick={() => clientRef.current?.step(-1)}
          >
            ◀
          </button>
          <button
            type="button"
            title={`Forward one frame (1/${settings.video.fps} s)`}
            disabled={busy}
            onClick={() => clientRef.current?.step(1)}
          >
            ▶
          </button>
        </span>
        <label>
          speed
          <select
            value={settings.speed}
            aria-label="Stage speed"
            onChange={(event) => update({ speed: Number(event.target.value) })}
          >
            {CAPTURE_SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
        <span style={{ flex: 1 }} />
        <span className={styles.stats}>
          <span className={local.readoutStrong}>t {hud.time.toFixed(2)} s</span>
          <span className={styles.dotSep}>·</span>
          <span>{hud.renderMs.toFixed(1)} ms</span>
          <span className={styles.dotSep}>·</span>
          <span>{hud.playing ? `${hud.fps.toFixed(0)} fps` : "paused"}</span>
          <span className={styles.dotSep}>·</span>
          <button
            type="button"
            data-active={settings.previewMode === "fast" ? "true" : undefined}
            title={
              settings.previewMode === "fast"
                ? "Fast preview: the stage renders far fewer pixels for instant feedback — the composition is identical, and PNG/video exports still render the full size. Click to go back to normal preview quality."
                : "The live stage renders big outputs at reduced size to stay fluid; the number is the current scale. Click for an even faster, lower-resolution preview — same composition, exports stay full size."
            }
            onClick={() =>
              update({ previewMode: settings.previewMode === "fast" ? "auto" : "fast" })
            }
          >
            preview {hud.preview !== null ? Math.round(hud.preview * 100) : 100}%
          </button>
        </span>
      </div>

      {/* output */}
      <div className={`${dock.panelBar} ${local.bar}`}>
        <label>
          look
          <select
            value={settings.style}
            aria-label="Output look"
            title="Auto re-runs the pattern at the output size when a test render shows its code scales, and upscales the panel frame otherwise. Native always re-runs it. Pixel scales the panel frame up as crisp blocks. LED draws each pixel as a round light."
            onChange={(event) => update({ style: event.target.value as CaptureSettings["style"] })}
          >
            <option value="auto">Auto</option>
            <option value="native">Native (re-rendered)</option>
            <option value="pixel">Pixel blocks</option>
            <option value="led">LED dots</option>
          </select>
        </label>

        {SIZED_STYLES.includes(settings.style) ? (
          <span className={local.group}>
            <select
              value={preset?.id ?? "custom"}
              aria-label="Output size preset"
              onChange={(event) => {
                const next = presets.find((entry) => entry.id === event.target.value);
                if (next) update({ width: next.width, height: next.height });
              }}
            >
              {presets.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            <input
              key={`w-${settings.width}`}
              ref={widthRef}
              className={local.sizeInput}
              type="number"
              inputMode="numeric"
              min={CAPTURE_SIDE_MIN}
              max={CAPTURE_SIDE_MAX}
              defaultValue={settings.width}
              aria-label="Output width"
              title={`${CAPTURE_SIDE_MIN}–${CAPTURE_SIDE_MAX} px`}
              onBlur={commitSize}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <span className={local.readout}>×</span>
            <input
              key={`h-${settings.height}`}
              ref={heightRef}
              className={local.sizeInput}
              type="number"
              inputMode="numeric"
              min={CAPTURE_SIDE_MIN}
              max={CAPTURE_SIDE_MAX}
              defaultValue={settings.height}
              aria-label="Output height"
              title={`${CAPTURE_SIDE_MIN}–${CAPTURE_SIDE_MAX} px`}
              onBlur={commitSize}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </span>
        ) : (
          <label>
            scale
            <select
              value={geometry.scale}
              aria-label="Blow-up factor"
              onChange={(event) => update({ scale: Number(event.target.value) })}
            >
              {CAPTURE_SCALES.filter(
                (scale) => Math.max(matrix.width, matrix.height) * scale <= CAPTURE_SIDE_MAX,
              ).map((scale) => (
                <option key={scale} value={scale}>
                  ×{scale}
                </option>
              ))}
            </select>
            <span className={local.readout}>
              → {geometry.output.width} × {geometry.output.height}
            </span>
          </label>
        )}

        <span
          className={local.group}
          role="group"
          aria-label="Turn"
          title="Turn the finished picture, like mounting the panel on its side — the pattern itself keeps its own orientation."
        >
          <span className={local.readout}>turn</span>
          <button
            type="button"
            aria-label="Turn 90° counter-clockwise"
            title="Turn the picture 90° counter-clockwise"
            onClick={() =>
              update({ rotation: ((settings.rotation + 270) % 360) as CaptureSettings["rotation"] })
            }
          >
            ⟲
          </button>
          <button
            type="button"
            aria-label="Turn 90° clockwise"
            title="Turn the picture 90° clockwise"
            onClick={() =>
              update({ rotation: ((settings.rotation + 90) % 360) as CaptureSettings["rotation"] })
            }
          >
            ⟳
          </button>
          <span className={local.readout}>{settings.rotation}°</span>
        </span>

        <label>
          backdrop
          <select
            value={
              settings.backdrop === "black" ? "black" : `${settings.backdrop}-${settings.cutout}`
            }
            aria-label="Backdrop"
            title="What sits behind the picture. 'Unpainted' keeps black paint and clears only untouched pixels; 'dark → clear' fades black away like light on paper."
            onChange={(event) => {
              const value = event.target.value;
              if (value === "black") {
                update({ backdrop: "black" });
                return;
              }
              const [backdrop, cutout] = value.split("-") as [
                CaptureSettings["backdrop"],
                CaptureSettings["cutout"],
              ];
              update({ backdrop, cutout });
            }}
          >
            <option value="black">Panel black</option>
            {settings.style === "led" ? (
              <>
                <option value="transparent-dark">Transparent</option>
                <option value="color-dark">Solid color</option>
              </>
            ) : (
              <>
                <option value="transparent-unpainted">Transparent · unpainted</option>
                <option value="transparent-dark">Transparent · dark → clear</option>
                <option value="color-unpainted">Color · unpainted</option>
                <option value="color-dark">Color · dark → clear</option>
              </>
            )}
          </select>
        </label>
        {settings.backdrop === "color" && (
          <input
            className={local.colorWell}
            type="color"
            value={settings.backdropColor}
            aria-label="Backdrop color"
            onChange={(event) => update({ backdropColor: event.target.value })}
          />
        )}

        {settings.style === "led" && (
          <>
            <span className={local.slider} title="Dot diameter as a share of the cell">
              dot
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.02}
                value={settings.ledDot}
                aria-label="LED dot size"
                onChange={(event) => update({ ledDot: Number(event.target.value) })}
              />
            </span>
            <span className={local.slider} title="Soft bloom around lit LEDs">
              glow
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.ledGlow}
                aria-label="LED glow"
                onChange={(event) => update({ ledGlow: Number(event.target.value) })}
              />
            </span>
          </>
        )}

        {settings.style === "auto" && hud.auto && (
          <span className={local.verdict} data-verdict={hud.auto.verdict} title={hud.auto.detail}>
            auto → {hud.auto.description}
            {hud.auto.verdict === "upscale" &&
              hud.auto.reason !== "too-dark" &&
              hud.auto.reason !== "non-deterministic" && (
                <button
                  type="button"
                  title="Copy a prompt that asks an AI to rewrite this code in frame-relative units, so it re-renders at any size. Paste the answer into the Code panel; Auto re-checks it."
                  onClick={() => void copyAnySizePrompt()}
                >
                  {promptCopied ? "Copied" : "Copy any-size prompt"}
                </button>
              )}
          </span>
        )}
      </div>

      {/* export */}
      <div className={`${dock.panelBar} ${local.bar}`}>
        <button
          type="button"
          title={`Save the current frame as a ${geometry.output.width}×${geometry.output.height} PNG${
            settings.backdrop === "transparent" ? " with transparency" : ""
          }`}
          disabled={busy}
          onClick={() => void saveImage()}
        >
          Save PNG
        </button>
        <span className={styles.dotSep}>|</span>
        <label>
          <select
            value={settings.video.fps}
            aria-label="Clip frame rate"
            disabled={busy}
            onChange={(event) => updateVideo({ fps: Number(event.target.value) })}
          >
            {CAPTURE_FPS.map((fps) => (
              <option key={fps} value={fps}>
                {fps} fps
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            className={local.secondsInput}
            type="number"
            inputMode="decimal"
            min={1}
            max={CAPTURE_SECONDS_MAX}
            step={0.5}
            value={settings.video.seconds}
            aria-label="Clip length in seconds"
            disabled={busy}
            onChange={(event) => updateVideo({ seconds: Number(event.target.value) })}
          />
          s
        </label>
        <label>
          <select
            value={settings.video.format}
            aria-label="Clip format"
            disabled={busy}
            onChange={(event) =>
              updateVideo({ format: event.target.value as CaptureSettings["video"]["format"] })
            }
          >
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
          </select>
        </label>
        {exporting?.kind === "video" ? (
          <>
            <span className={local.progress} role="progressbar" aria-valuenow={Math.round(progress * 100)}>
              <span className={local.progressFill} style={{ width: `${progress * 100}%` }} />
            </span>
            <span className={local.readoutStrong}>
              {exporting.done}/{exporting.total}
            </span>
            <button type="button" onClick={() => clientRef.current?.cancelExport()}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className={local.record}
            title={`Render ${settings.video.seconds} s from the current moment at a fixed ${settings.video.fps} fps — frame-exact, however slow the render. A transparent backdrop flattens onto black.`}
            disabled={busy}
            onClick={() => void recordVideo()}
          >
            ● Record
          </button>
        )}
        {exporting?.kind === "image" && <span className={local.readout}>rendering…</span>}
        {message && (
          <span className={`${local.message} ${message.error ? local.messageError : ""}`}>
            {message.text}
          </span>
        )}
        {fatal && <span className={`${local.message} ${local.messageError}`}>{fatal}</span>}
      </div>

      <div className={local.body}>
        <div className={local.stageBox}>
          <canvas
            ref={canvasRef}
            className={`${local.stageCanvas} ${
              settings.backdrop === "transparent" ? local.stageCanvasTransparent : ""
            }`}
            width={geometry.output.width}
            height={geometry.output.height}
            aria-label={`Capture stage, ${geometry.output.width} × ${geometry.output.height}`}
          />
        </div>
        {hud.errors.length > 0 && (
          <div className={local.errorList}>
            {hud.errors.map((entry) => (
              <div key={entry.id} className={styles.errorBox} style={{ marginTop: 0 }}>
                {entry.name} at {geometry.render.width}×{geometry.render.height}: {entry.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
