// ── Capture worker ───────────────────────────────────────────────────────────
// Hosts the CaptureCore and paints its frames on an OffscreenCanvas, off the
// main thread. A 4K native render costs hundreds of milliseconds per frame;
// here that only shows up as a low stage fps, never as a frozen lab.
//
// Pacing: every live frame is posted as an ImageBitmap and the next one is
// not rendered until the panel reports it shown ("frame-shown"). That caps
// the stage at the display rate, stalls it while the panel is hidden, and
// never queues bitmaps behind a slow main thread.
//
// Exports run inline and exclusively: a still paints the current frame and
// encodes it; a clip steps the clock at a fixed 1/fps from the current
// moment, so what the stage shows when you press Record is the first frame.

import { CaptureCore, clampScale, mergeWireProject, resolveGeometry, type CaptureFrame } from "./core";
import type { MatrixSize } from "@/lib/patternMatrix";
import { StagePainter } from "./paint";
import { describeProbe, probeKey, probeScaling, type ProbeResult } from "./probe";
import {
  DEFAULT_CAPTURE_SETTINGS,
  type AutoVerdict,
  type CaptureGeometry,
  type CaptureProject,
  type CaptureSettings,
  type FromWorker,
  type ShowAutomation,
  type ToWorker,
  type VideoRequest,
} from "./types";

type WorkerScope = {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};
const scope = self as unknown as WorkerScope;

const MAX_DT = 0.05;
const EXPORT_PREVIEW_INTERVAL_MS = 120;
// Stage pixel cap for the matrix-rendered looks (pixel/led/auto fallback),
// where fewer output pixels are the same picture, smaller — the LED look's
// full-size blur was the main lag. The Native look is exempt (see
// previewFor) and exports never reduce.
const PREVIEW_PIXEL_BUDGET = 1_200_000;

const core = new CaptureCore(DEFAULT_CAPTURE_SETTINGS);
const painter = new StagePainter((width, height) => new OffscreenCanvas(width, height));
const stage = new OffscreenCanvas(1, 1);

let project: CaptureProject | null = null;
// The scaling probe's last verdict, keyed on what it depends on (code,
// visibility, matrix, coarse knob positions). Re-checked on a short trailing
// timer so a drag settles before the stage pays for a probe.
let probe: { key: string; result: ProbeResult } | null = null;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
const PROBE_SETTLE_MS = 250;
// Plays from the moment the panel opens; pausing is the deliberate act.
let playing = true;
let visible = true;
let awaitingAck = false;
let dirty = false;
let exporting = false;
let cancelRequested = false;
let tickScheduled = false;
let lastTick = 0;

function post(message: FromWorker, transfer?: Transferable[]) {
  scope.postMessage(message, transfer);
}

function postState() {
  post({ type: "state", time: core.time, playing });
}

/**
 * Decide what `auto` means for the current code. Runs only when the style is
 * auto and the probe key moved; a few hundred milliseconds in here is a
 * hiccup on the stage, never on the lab.
 */
function refreshProbe() {
  if (!project || core.settings.style !== "auto") return;
  const key = probeKey(project);
  if (probe && probe.key === key) return;
  probe = { key, result: probeScaling(project) };
  core.autoLook = probe.result.verdict === "native" ? "native" : "pixel";
}

function scheduleProbe() {
  if (probeTimer !== null) clearTimeout(probeTimer);
  probeTimer = setTimeout(() => {
    probeTimer = null;
    const before = probe?.key;
    refreshProbe();
    postAuto();
    if (probe?.key !== before) markDirty();
  }, PROBE_SETTLE_MS);
}

/**
 * A take's warm-up runs the pattern at matrix size — same state, a fraction
 * of the pixels — so "a fresh 2 s in" costs milliseconds, not a 4K render
 * per step.
 */
function warmGeometry(matrix: MatrixSize): CaptureGeometry {
  return {
    look: "pixel",
    render: matrix,
    box: matrix,
    output: matrix,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
  };
}

const WARM_STEP = 1 / 30;
/** How far the stage runs in when it wakes cold (matches fresh takes). */
const STAGE_WARM_SECONDS = 2;

/** Run a fresh-take warm-up: `seconds` of pattern time at matrix size. */
function warmTo(seconds: number) {
  if (!project) return;
  const warm = warmGeometry(project.matrix);
  const steps = Math.max(1, Math.round(seconds / WARM_STEP));
  for (let index = 0; index < steps; index++) core.step(WARM_STEP, warm);
}

/** The verdict travels on its own: the controls need it with no frames flowing. */
function postAuto() {
  post({ type: "auto", auto: autoVerdict() });
}

function autoVerdict(): AutoVerdict | null {
  if (core.settings.style !== "auto" || !probe) return null;
  const { metrics, probed } = probe.result;
  return {
    verdict: probe.result.verdict,
    reason: probe.result.reason,
    description: describeProbe(probe.result),
    detail: `probed at ${probed.width}×${probed.height} · layout ${metrics.layout.toFixed(1)} · density ×${metrics.density.toFixed(2)} · luminance ${metrics.luminance.toFixed(0)} · noise ${metrics.noise.toFixed(1)}`,
  };
}

function frameMessage(
  frame: CaptureFrame,
  bitmap: ImageBitmap,
  preview: number | null = null,
): FromWorker {
  return {
    type: "frame",
    bitmap,
    width: frame.geometry.output.width,
    height: frame.geometry.output.height,
    time: frame.time,
    playing,
    renderMs: frame.renderMs,
    errors: frame.errors,
    geometry: frame.geometry,
    auto: autoVerdict(),
    preview,
  };
}

/**
 * The geometry the live stage should render at: the full one while it fits
 * the budget, otherwise the same settings shrunk linearly — sized looks by
 * their output edges, cell looks by their blow-up factor — and re-resolved,
 * so cover fits, offsets and rotation stay exactly the export's, smaller.
 */
function previewFor(full: CaptureGeometry): { geometry: CaptureGeometry; factor: number } | null {
  if (!project) return null;
  // Native re-runs the pattern code on the stage grid: shrink that grid and
  // pixel-unit math draws a different picture, not a smaller one. Never
  // reduce it — a slow exact stage is a preview, a fast different one isn't.
  // Matrix-rendered looks (pixel/led/auto's fallback) only shrink the
  // blow-up, so their reduced frame is the same picture at fewer pixels.
  if (full.look === "native") return null;
  const pixels = full.output.width * full.output.height;
  if (pixels <= PREVIEW_PIXEL_BUDGET) return null;
  const k = Math.sqrt(PREVIEW_PIXEL_BUDGET / pixels);
  const settings = core.settings;
  let scaled: CaptureSettings;
  if (settings.style === "pixel" || settings.style === "led") {
    const scale = Math.max(1, Math.floor(clampScale(settings.scale, project.matrix) * k));
    if (scale >= full.scale) return null;
    scaled = { ...settings, scale };
  } else {
    scaled = {
      ...settings,
      width: Math.max(1, Math.round(full.output.width * k)),
      height: Math.max(1, Math.round(full.output.height * k)),
    };
  }
  const geometry = resolveGeometry(scaled, project.matrix, core.autoLook);
  return { geometry, factor: geometry.output.width / full.output.width };
}

function renderAndPost(dt: number) {
  const full = core.geometry();
  if (!full) return;
  const preview = previewFor(full);
  const frame = core.step(dt, preview?.geometry);
  if (!frame) return;
  painter.paint(stage, frame, core.settings);
  const bitmap = stage.transferToImageBitmap();
  awaitingAck = true;
  post(frameMessage(frame, bitmap, preview?.factor ?? null), [bitmap]);
}

function requestTick() {
  if (tickScheduled) return;
  tickScheduled = true;
  setTimeout(tick, 0);
}

function tick() {
  tickScheduled = false;
  if (exporting || awaitingAck || !visible || !core.ready) return;
  const now = performance.now();
  if (playing) {
    const dt = Math.min(MAX_DT, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    dirty = false;
    renderAndPost(dt);
    return;
  }
  if (dirty) {
    dirty = false;
    renderAndPost(0);
  }
}

function markDirty() {
  dirty = true;
  requestTick();
}

// ── exports ──

async function exportImage(
  requestId: number,
  automation?: ShowAutomation,
  warmSeconds?: number,
) {
  exporting = true;
  try {
    if (!project) throw new Error("Nothing to capture yet.");
    let frame: CaptureFrame | null = null;
    if (automation) {
      // The show's frame at the playhead: replay the automation from t = 0 —
      // state and all — at matrix size, and render only the last frame big.
      // Frame-exact with what a show render shows at that moment.
      core.reset();
      const dt = 1 / automation.fps;
      const warm = warmGeometry(project.matrix);
      for (let index = 0; index < automation.frames; index++) {
        const base = index * 4;
        core.setKnobs([
          automation.knobs[base],
          automation.knobs[base + 1],
          automation.knobs[base + 2],
          automation.knobs[base + 3],
        ]);
        frame = core.step(dt, index < automation.frames - 1 ? warm : undefined);
      }
      if (!frame) frame = core.step(0);
    } else if (warmSeconds && warmSeconds > 0) {
      // Viewfinder off: a fresh take, warmed a moment in — deterministic,
      // and never a cold t = 0 frame of a pattern that starts dark.
      core.reset();
      warmTo(warmSeconds);
      frame = core.step(0);
    } else {
      // The stage's current moment — exactly what the viewfinder shows.
      frame = core.step(0);
    }
    if (!frame) throw new Error("Nothing to capture yet.");
    painter.paint(stage, frame, core.settings);
    const blob = await stage.convertToBlob({ type: "image/png" });
    post({ type: "image", requestId, blob });
  } catch (error) {
    post({ type: "failed", requestId, message: describe(error) });
  } finally {
    exporting = false;
    // The stage canvas still holds the still; repaint it for the live view.
    markDirty();
  }
}

async function exportVideo(
  requestId: number,
  video: VideoRequest,
  automation?: ShowAutomation,
  warmSeconds?: number,
) {
  exporting = true;
  cancelRequested = false;
  const liveSettings = core.settings;
  // Clip knobs are PINNED for the whole take: whatever the knobs were at
  // Record is the clip, even if live edits stream in mid-export (the loop
  // awaits the encoder, so project messages can interleave). A show render
  // overrides them per frame from the automation instead.
  const pinnedKnobs = project ? [...project.knobs] : null;
  try {
    const geometry = core.geometry();
    if (!geometry) throw new Error("Nothing to capture yet.");
    // A show is a take from t = 0: fresh pattern state. A clip with the
    // viewfinder off is a fresh take too, warmed a moment in; with it on,
    // the clip records from the stage's current moment — what you see.
    if (automation) {
      core.reset();
    } else if (warmSeconds && warmSeconds > 0 && project) {
      core.reset();
      warmTo(warmSeconds);
    }

    // Video has no alpha channel: a transparent backdrop flattens onto black.
    const settings: CaptureSettings =
      liveSettings.backdrop === "transparent" ? { ...liveSettings, backdrop: "black" } : liveSettings;
    core.setSettings(settings);

    const mediabunny = await import("mediabunny");
    const format =
      video.format === "webm"
        ? new mediabunny.WebMOutputFormat()
        : new mediabunny.Mp4OutputFormat({ fastStart: "in-memory" });

    // H.264 wants even dimensions; pad by a pixel of backdrop rather than
    // resample the whole picture.
    const { width, height } = geometry.output;
    const encodeWidth = width + (width % 2);
    const encodeHeight = height + (height % 2);
    const encodeCanvas =
      encodeWidth === width && encodeHeight === height
        ? stage
        : new OffscreenCanvas(encodeWidth, encodeHeight);

    const codec = await mediabunny.getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
      width: encodeWidth,
      height: encodeHeight,
    });
    if (!codec) {
      throw new Error(
        `This browser cannot encode ${video.format.toUpperCase()} at ${encodeWidth}×${encodeHeight}. Try the other format or a smaller size.`,
      );
    }

    const target = new mediabunny.BufferTarget();
    const output = new mediabunny.Output({ format, target });
    const source = new mediabunny.CanvasSource(encodeCanvas, {
      codec,
      quality: mediabunny.QUALITY_HIGH,
      keyFrameInterval: 1,
    });
    output.addVideoTrack(source, { frameRate: video.fps });
    await output.start();

    const total = automation
      ? automation.frames
      : Math.max(1, Math.round(video.seconds * video.fps));
    const dt = 1 / video.fps;
    let lastPreview = 0;

    try {
      for (let index = 0; index < total; index++) {
        if (cancelRequested) throw new Error("cancelled");
        if (automation) {
          const base = index * 4;
          core.setKnobs([
            automation.knobs[base],
            automation.knobs[base + 1],
            automation.knobs[base + 2],
            automation.knobs[base + 3],
          ]);
        } else if (pinnedKnobs) {
          core.setKnobs(pinnedKnobs);
        }
        const frame = core.step(dt);
        if (!frame) throw new Error("Project vanished mid-render.");
        painter.paint(stage, frame, settings);
        if (encodeCanvas !== stage) {
          const context = encodeCanvas.getContext("2d")!;
          context.fillStyle = settings.backdrop === "color" ? settings.backdropColor : "#000000";
          context.fillRect(0, 0, encodeWidth, encodeHeight);
          context.drawImage(stage, 0, 0);
        }
        await source.add(index * dt, dt);

        post({ type: "progress", requestId, done: index + 1, total });
        const now = performance.now();
        if (now - lastPreview > EXPORT_PREVIEW_INTERVAL_MS || index === total - 1) {
          lastPreview = now;
          const bitmap = await createImageBitmap(stage);
          post(frameMessage(frame, bitmap), [bitmap]);
        }
      }
    } catch (error) {
      await output.cancel().catch(() => undefined);
      throw error;
    }

    await output.finalize();
    if (!target.buffer) throw new Error("Encoder produced no data.");
    const mime = await output.getMimeType();
    post({
      type: "video",
      requestId,
      blob: new Blob([target.buffer], { type: mime }),
      extension: video.format,
    });
  } catch (error) {
    post({ type: "failed", requestId, message: describe(error) });
  } finally {
    core.setSettings(liveSettings);
    // Back to the live project wholesale — knobs and any edits that streamed
    // in while the export ran.
    if (project) core.setProject(project);
    exporting = false;
    // Bitmaps posted during the export were not acked — the panel only acks
    // live frames — so the gate must not be left closed.
    awaitingAck = false;
    lastTick = performance.now();
    markDirty();
    postState();
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// ── messages ──

scope.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case "project": {
      project = mergeWireProject(project, message.project);
      core.setProject(project);
      // First project: probe right away so the very first frame is already
      // the right look; afterwards let edits and drags settle.
      if (!probe) {
        refreshProbe();
        postAuto();
      } else {
        scheduleProbe();
      }
      markDirty();
      return;
    }
    case "settings": {
      core.setSettings(message.settings);
      refreshProbe();
      postAuto();
      markDirty();
      return;
    }
    case "visible": {
      visible = message.visible;
      if (visible) {
        // The stage idles until the viewfinder opens; a first frame at the
        // pattern's cold t = 0 is black more often than not. Wake it the way
        // a fresh take starts: warmed a moment in, at matrix size.
        if (core.ready && core.time === 0) warmTo(STAGE_WARM_SECONDS);
        lastTick = performance.now();
        markDirty();
      }
      return;
    }
    case "play": {
      if (playing) return;
      playing = true;
      lastTick = performance.now();
      postState();
      requestTick();
      return;
    }
    case "pause": {
      playing = false;
      postState();
      return;
    }
    case "restart": {
      core.reset();
      lastTick = performance.now();
      postState();
      markDirty();
      return;
    }
    case "step": {
      if (exporting) return;
      playing = false;
      const dt = 1 / core.settings.video.fps;
      // Backwards only moves the clock: pattern state cannot be un-updated,
      // so a negative step re-draws the earlier moment without an update.
      if (message.frames >= 0) {
        for (let index = 0; index < message.frames; index++) core.step(dt);
      } else {
        core.time = Math.max(0, core.time + message.frames * dt);
      }
      postState();
      markDirty();
      return;
    }
    case "frame-shown": {
      awaitingAck = false;
      if (playing || dirty) requestTick();
      return;
    }
    case "export-image": {
      if (exporting) {
        post({ type: "failed", requestId: message.requestId, message: "An export is already running." });
        return;
      }
      void exportImage(message.requestId, message.automation, message.warmSeconds);
      return;
    }
    case "export-video": {
      if (exporting) {
        post({ type: "failed", requestId: message.requestId, message: "An export is already running." });
        return;
      }
      void exportVideo(message.requestId, message.video, message.automation, message.warmSeconds);
      return;
    }
    case "cancel-export": {
      cancelRequested = true;
      return;
    }
  }
};

post({ type: "ready" });
