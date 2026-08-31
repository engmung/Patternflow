"use client";

// Capture — the camera back: settings and the shutter, no window of its own.
// The picture lives where pictures live: the Preview panel, whose 📷 camera
// view (the viewfinder) shows the output render when you ask for it. This
// panel picks the output (size, look, turn, backdrop), owns the 🔗 Director
// link, and fires the exports; the shared capture session (lib/lab/capture/
// session) runs the worker both panels talk to.
//
// What an export captures, in two sentences: linked (🔗), the show is the
// truth — Record renders the whole timeline, Save PNG replays it to the
// playhead, frame-exact. Unlinked, the knobs are the truth — with the
// viewfinder on you capture the moment you see; with it off you get a fresh
// take, warmed a couple of seconds in so patterns never export cold.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLabStore } from "@/lib/lab/store";
import { isCodeLayer } from "@/lib/lab/types";
import { buildAnySizePrompt } from "@/lib/lab/capture/anySizePrompt";
import { captureSession } from "@/lib/lab/capture/session";
import { resolveGeometry } from "@/lib/lab/capture/core";
import { captureFileName, downloadBlob } from "@/lib/lab/capture/download";
import {
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
  SIZED_STYLES,
  type AutoVerdict,
  type CaptureSettings,
} from "@/lib/lab/capture/types";
import { bakeShowV2 } from "@/lib/lab/director/bake";
import { sampleShow, toKnobFrames } from "@/lib/lab/director/sample";
import { showTransport } from "@/lib/lab/director/transport";
import { showHasContent } from "@/lib/lab/director/types";
import styles from "../PatternLab.module.css";
import dock from "../LabPanels.module.css";
import local from "./CapturePanel.module.css";

// Show renders bypass the clip length cap (a show is as long as it is), but
// an hour of 4K frames is a mistake more often than a plan — soft-confirm
// past two minutes, refuse past ten.
const SHOW_RENDER_CONFIRM_SECONDS = 120;
const SHOW_RENDER_MAX_SECONDS = 600;
/** Fresh takes (viewfinder off, unlinked) run this far in before capturing. */
const FRESH_TAKE_WARM_SECONDS = 2;
/** Linked stills replay the show at this rate — state-exact by playhead. */
const STILL_REPLAY_FPS = 30;

type LayerError = { id: string; name: string; text: string };

function nameErrors(errors: Record<string, string>): LayerError[] {
  const layers = useLabStore.getState().layers;
  return Object.entries(errors).map(([id, text]) => ({
    id,
    name: layers.find((layer) => layer.id === id)?.name ?? "layer",
    text,
  }));
}

type ExportState = { kind: "image" | "video"; done: number; total: number };

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

export default function CapturePanel() {
  const supported = captureSession.supported;
  const [settings, setSettings] = useState<CaptureSettings>(() => captureSession.settings());
  const [verdict, setVerdict] = useState<AutoVerdict | null>(null);
  const [errors, setErrors] = useState<LayerError[]>([]);
  const [exporting, setExporting] = useState<ExportState | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  // 🔗 Director link — linked, the show is the truth for every export; the
  // link lives on the shared show transport so the Director's Render…
  // shortcut can flip it on from over there.
  const [follow, setFollowUi] = useState(() => showTransport.get().follow);
  useEffect(() => showTransport.subscribe((state) => setFollowUi(state.follow)), []);
  const director = useLabStore((state) => state.director);
  const hasShow = showHasContent(director);
  const showSeconds = hasShow ? bakeShowV2(director).perf.length : 0;
  const linked = follow && hasShow;

  // 📷 viewfinder — the Preview panel's camera view, switched from either side.
  const [view, setViewUi] = useState(() => captureSession.getState().view);
  useEffect(() => captureSession.subscribe((state) => setViewUi(state.view)), []);

  const matrix = useLabStore((state) => state.matrix);
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

  // Worker events: verdict for the auto row, errors while frames flow,
  // progress for the export bar.
  useEffect(() => {
    if (!supported) return;
    return captureSession.on({
      auto: setVerdict,
      errors: (raw) => setErrors(nameErrors(raw)),
      progress: (done, total) => {
        setExporting((current) => (current ? { ...current, done, total } : current));
      },
      fatal: setFatal,
    });
  }, [supported]);

  // Settings reach the worker and disk together.
  useEffect(() => {
    captureSession.applySettings(settings);
    saveCaptureSettings(settings);
  }, [settings]);

  // ── exports ──
  const saveImage = async () => {
    if (exportingRef.current) return;
    captureSession.sendProjectNow();
    exportingRef.current = true;
    setExporting({ kind: "image", done: 0, total: 1 });
    setMessage(null);
    const title = captureTitle();
    try {
      let blob: Blob;
      if (linked) {
        // The show's frame at the playhead: replay the automation from 0,
        // frame-exact with a show render paused there.
        const state = useLabStore.getState();
        const t = showTransport.get().time;
        const frames = Math.max(1, Math.round(t * STILL_REPLAY_FPS) + 1);
        const sampled = sampleShow(state.director, STILL_REPLAY_FPS, frames);
        blob = await captureSession.exportImage({
          automation: {
            fps: STILL_REPLAY_FPS,
            frames,
            knobs: toKnobFrames(sampled, state.ranges, state.knobs),
          },
        });
      } else if (view) {
        // The moment on the viewfinder, at full size.
        blob = await captureSession.exportImage();
      } else {
        // No window anywhere: a fresh take, warmed in so it isn't frame 0.
        blob = await captureSession.exportImage({ warmSeconds: FRESH_TAKE_WARM_SECONDS });
      }
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
    if (exportingRef.current) return;
    captureSession.sendProjectNow();

    // Linked: pre-sample the Director timeline into per-frame knob values
    // (the same sampler the panel plays from) and hand it to the worker,
    // which resets the pattern clock and replays the show.
    let automation;
    let warmSeconds: number | undefined;
    let request = settings.video;
    if (linked) {
      const state = useLabStore.getState();
      const duration = bakeShowV2(state.director).perf.length;
      if (duration > SHOW_RENDER_MAX_SECONDS) {
        setMessage({
          text: `This show is ${Math.round(duration)} s — show renders cap at ${SHOW_RENDER_MAX_SECONDS} s. Shorten the show (or record a clip of it playing).`,
          error: true,
        });
        return;
      }
      if (
        duration > SHOW_RENDER_CONFIRM_SECONDS &&
        !window.confirm(
          `Render the whole ${Math.round(duration)} s show at ${settings.video.fps} fps? This can take a while.`,
        )
      ) {
        return;
      }
      const frames = Math.max(1, Math.round(duration * settings.video.fps));
      const sampled = sampleShow(state.director, settings.video.fps, frames);
      automation = {
        fps: settings.video.fps,
        frames,
        knobs: toKnobFrames(sampled, state.ranges, state.knobs),
      };
      request = { ...settings.video, seconds: duration };
    } else if (!view) {
      // Viewfinder off: a fresh warmed take (with it on, the clip records
      // from the moment on screen).
      warmSeconds = FRESH_TAKE_WARM_SECONDS;
    }

    exportingRef.current = true;
    const total = automation
      ? automation.frames
      : Math.round(settings.video.seconds * settings.video.fps);
    setExporting({ kind: "video", done: 0, total });
    setMessage(null);
    const title = captureTitle();
    try {
      const { blob, extension } = await captureSession.exportVideo(request, automation, warmSeconds);
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
      {/* output */}
      <div className={`${dock.panelBar} ${local.bar}`}>
        <button
          type="button"
          data-active={view ? "true" : undefined}
          title="Camera view: show this output render in the Preview panel — like looking through the camera. The project frame, prompts and hardware export stay on the pattern's own grid."
          onClick={() => captureSession.setView(!view)}
        >
          📷 Viewfinder
        </button>
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

        {settings.style === "auto" && verdict && (
          <span className={local.verdict} data-verdict={verdict.verdict} title={verdict.detail}>
            auto → {verdict.description}
            {verdict.verdict === "upscale" &&
              verdict.reason !== "too-dark" &&
              verdict.reason !== "non-deterministic" && (
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
          title={
            linked
              ? `Save the show's frame at the Director playhead as a ${geometry.output.width}×${geometry.output.height} PNG — the automation is replayed from 0, frame-exact.`
              : view
                ? `Save the viewfinder's moment as a ${geometry.output.width}×${geometry.output.height} PNG${settings.backdrop === "transparent" ? " with transparency" : ""}`
                : `Save a fresh take (warmed ${FRESH_TAKE_WARM_SECONDS} s in, knobs as they are) as a ${geometry.output.width}×${geometry.output.height} PNG${settings.backdrop === "transparent" ? " with transparency" : ""}`
          }
          disabled={busy}
          onClick={() => void saveImage()}
        >
          Save PNG
        </button>
        <span className={styles.dotSep}>|</span>
        <label
          title={
            hasShow
              ? "Follow the Director: Record renders the whole show with its automation driving the knobs, Save PNG replays it to the playhead. Off, the knobs as they are are the truth."
              : "Add keyframes in the Director to link the capture to a show"
          }
        >
          <input
            type="checkbox"
            checked={linked}
            disabled={!hasShow || busy}
            onChange={(event) => showTransport.setFollow(event.target.checked)}
          />
          🔗 Director
        </label>
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
        {!linked ? (
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
        ) : (
          <span className={local.readout} title="The show's length — a render never ends before the last cue">
            {showSeconds.toFixed(1)} s
          </span>
        )}
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
            <button type="button" onClick={() => captureSession.cancelExport()}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className={local.record}
            title={
              linked
                ? `Render the Director show from t = 0 — ${showSeconds.toFixed(1)} s at a fixed ${settings.video.fps} fps, the automation driving the knobs frame by frame. Frame-exact, however slow the render.`
                : view
                  ? `Render ${settings.video.seconds} s from the viewfinder's moment at a fixed ${settings.video.fps} fps — frame-exact, however slow the render. A transparent backdrop flattens onto black.`
                  : `Render a fresh ${settings.video.seconds} s take (warmed ${FRESH_TAKE_WARM_SECONDS} s in, knobs as they are) at a fixed ${settings.video.fps} fps. A transparent backdrop flattens onto black.`
            }
            disabled={busy}
            onClick={() => void recordVideo()}
          >
            {linked ? "● Render show" : "● Record"}
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
        <div className={local.hint}>
          {linked
            ? "🔗 Linked — the show is the truth: Record renders the whole timeline, Save PNG the playhead's frame. Scrub in the Director, watch in the Preview."
            : view
              ? "📷 Camera view is on — the Preview panel shows this output render; exports capture the moment you see."
              : "Exports run blind but never cold: a fresh take, warmed a couple of seconds in, with the knobs as they are. Turn on the Viewfinder to see the output in the Preview panel first."}
        </div>
        {errors.length > 0 && (
          <div className={local.errorList}>
            {errors.map((entry) => (
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
