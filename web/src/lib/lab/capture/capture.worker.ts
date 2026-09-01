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

import { CaptureCore, clampScale, mergeWireProject, resolveGeometry } from "./core";
import type { MatrixSize } from "@/lib/patternMatrix";
import { StagePainter } from "./paint";
import { describeProbe, probeKey, probeScaling, type ProbeResult } from "./probe";
import { ShaderStage } from "./shaderStage";
import { buildShaderRampLUT } from "./shaderRamp";
import { isCodeLayer, type RampState } from "../types";
import {
  DEFAULT_CAPTURE_SETTINGS,
  type AutoVerdict,
  type CaptureGeometry,
  type CaptureProject,
  type CaptureSettings,
  type FromWorker,
  type ShaderStatus,
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
const shader = new ShaderStage((width, height) => new OffscreenCanvas(width, height));
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
  post({ type: "state", time: stageTime(), playing });
}

// ── the two renderers, behind one shape ──
// Everything below this line — the live tick, stills, clips, show automation,
// warm-ups — drives `stepStage` and never asks which renderer answered.

/**
 * A frame from whichever stage is running: enough for the frame message plus
 * the one thing only the renderer knows, how to put itself on a canvas.
 */
type StageStep = {
  geometry: CaptureGeometry;
  time: number;
  renderMs: number;
  errors: Record<string, string>;
  paint(target: OffscreenCanvas, settings: CaptureSettings): void;
};

/**
 * The shader answers only when the panel asked for it AND it compiled: a
 * broken twin falls back to the pattern rather than showing black, and the
 * panel says why through the shader status.
 */
function usingShader(): boolean {
  return core.settings.source === "shader" && shader.hasSource && shader.error === null;
}

/**
 * The layer whose colour ramp the twin reads: the one the panel filed it
 * under, else the active code layer, else the topmost — the same rule the
 * panel uses to pick what a prompt targets.
 */
function shaderLayer() {
  if (!project) return null;
  const named = project.layers.find((layer) => layer.id === shaderLayerId);
  if (isCodeLayer(named)) return named;
  const active = project.layers.find((layer) => layer.id === project!.activeLayerId);
  if (isCodeLayer(active)) return active;
  return project.layers.find(isCodeLayer) ?? null;
}

/**
 * Keep the shader's ramp texture in step with the panel. Ramp state is
 * immutable in the store, so identity is enough to tell an edit from a
 * re-render — no rebuild while a knob is being dragged.
 */
function syncShaderRamp(): boolean {
  const layer = shaderLayer();
  const ramp: RampState | null = layer ? layer.ramp : null;
  if (ramp === shaderRamp) return false;
  shaderRamp = ramp;
  if (ramp) shader.setRamp(buildShaderRampLUT(ramp), ramp.mode !== "step");
  return true;
}

function shaderStatus(): ShaderStatus {
  return {
    loaded: shader.hasSource,
    error: shader.error,
    floatFeedback: shader.floatFeedback,
    feedback: shader.hasFeedback,
  };
}

function postShaderStatus() {
  post({ type: "shader-status", status: shaderStatus() });
}

/**
 * Knobs a render drives itself — a show's automation frame by frame, a clip's
 * pinned values — overriding the live project's for the length of the export.
 * Null outside one, so the stage follows the panel again the moment it ends.
 */
let knobOverride: number[] | null = null;

/** The code layer the twin belongs to, and the ramp last uploaded for it. */
let shaderLayerId: string | null = null;
let shaderRamp: RampState | null = null;

function setStageKnobs(knobs: number[] | null) {
  knobOverride = knobs;
  if (knobs) core.setKnobs(knobs);
}

/** Knobs as the shader wants them: the real values, and the same 0..1. */
function shaderKnobs() {
  if (!project) return;
  const values = knobOverride ?? project.knobs;
  const normalized = values.map((value, index) => {
    const range = project!.ranges[index] ?? [0, 1];
    const span = Math.max(0.0001, range[1] - range[0]);
    return (value - range[0]) / span;
  });
  shader.setKnobs(values, normalized);
}

/**
 * The shader always renders at the output size — a GPU has no reason to be
 * spared, and its feedback state is bound to the grid it runs on, so a
 * reduced preview would be a different simulation, not a smaller picture.
 * Rotation still turns the frame, exactly as it does for a pattern.
 */
function shaderGeometry(): CaptureGeometry | null {
  if (!project) return null;
  return resolveGeometry({ ...core.settings, style: "native" }, project.matrix);
}

function stageTime(): number {
  return usingShader() ? shader.time : core.time;
}

function stageGeometry(): CaptureGeometry | null {
  return usingShader() ? shaderGeometry() : core.geometry();
}

/** Fresh take on whichever stage is running. */
function resetStage() {
  if (usingShader()) {
    shader.reset();
    return;
  }
  core.reset();
}

function stepStage(dt: number, geometryOverride?: CaptureGeometry): StageStep | null {
  if (usingShader()) {
    const geometry = geometryOverride ?? shaderGeometry();
    if (!geometry) return null;
    shaderKnobs();
    const frame = shader.step(dt, geometry);
    if (!frame) return null;
    return {
      geometry: frame.geometry,
      time: frame.time,
      renderMs: frame.renderMs,
      errors: {},
      paint: (target, settings) => painter.paintCanvas(target, frame.canvas, frame.geometry, settings),
    };
  }
  const frame = core.step(dt, geometryOverride);
  if (!frame) return null;
  return {
    geometry: frame.geometry,
    time: frame.time,
    renderMs: frame.renderMs,
    errors: frame.errors,
    paint: (target, settings) => painter.paint(target, frame, settings),
  };
}

/**
 * Decide what `auto` means for the current code. Runs only when the style is
 * auto and the probe key moved; a few hundred milliseconds in here is a
 * hiccup on the stage, never on the lab.
 */
function refreshProbe() {
  if (!project || core.settings.style !== "auto" || usingShader()) return;
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

/**
 * Run a fresh-take warm-up: `seconds` of pattern time at matrix size — or,
 * for a shader, at the output size, because its feedback state IS the frame
 * and warming a smaller one would warm a different simulation.
 */
function warmTo(seconds: number) {
  if (!project) return;
  const steps = Math.max(1, Math.round(seconds / WARM_STEP));
  const warm = usingShader() ? shaderGeometry() ?? undefined : warmGeometry(project.matrix);
  for (let index = 0; index < steps; index++) stepStage(WARM_STEP, warm);
}

/** The verdict travels on its own: the controls need it with no frames flowing. */
function postAuto() {
  post({ type: "auto", auto: autoVerdict() });
}

function autoVerdict(): AutoVerdict | null {
  if (core.settings.style !== "auto" || !probe || usingShader()) return null;
  const { metrics, probed } = probe.result;
  return {
    verdict: probe.result.verdict,
    reason: probe.result.reason,
    description: describeProbe(probe.result),
    detail: `probed at ${probed.width}×${probed.height} · layout ${metrics.layout.toFixed(1)} · density ×${metrics.density.toFixed(2)} · detail ${(metrics.detail * 100).toFixed(0)}% · luminance ${metrics.luminance.toFixed(0)} · noise ${metrics.noise.toFixed(1)}`,
  };
}

function frameMessage(
  frame: StageStep,
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
  if (!project || usingShader()) return null;
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
  const full = stageGeometry();
  if (!full) return;
  const preview = previewFor(full);
  const frame = stepStage(dt, preview?.geometry);
  if (!frame) return;
  frame.paint(stage, core.settings);
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
  // A shader take is exact, so the pattern's frame-shown pacing is all the
  // budget it needs; nothing else about the loop changes.
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
    let frame: StageStep | null = null;
    if (automation) {
      // The show's frame at the playhead: replay the automation from t = 0 —
      // state and all — at matrix size, and render only the last frame big.
      // Frame-exact with what a show render shows at that moment. A shader
      // replays at the output size throughout: its state lives on that grid.
      resetStage();
      const dt = 1 / automation.fps;
      const warm = usingShader() ? shaderGeometry() ?? undefined : warmGeometry(project.matrix);
      for (let index = 0; index < automation.frames; index++) {
        const base = index * 4;
        setStageKnobs([
          automation.knobs[base],
          automation.knobs[base + 1],
          automation.knobs[base + 2],
          automation.knobs[base + 3],
        ]);
        frame = stepStage(dt, index < automation.frames - 1 ? warm : undefined);
      }
      if (!frame) frame = stepStage(0);
    } else if (warmSeconds && warmSeconds > 0) {
      // Viewfinder off: a fresh take, warmed a moment in — deterministic,
      // and never a cold t = 0 frame of a pattern that starts dark.
      resetStage();
      warmTo(warmSeconds);
      frame = stepStage(0);
    } else {
      // The stage's current moment — exactly what the viewfinder shows.
      frame = stepStage(0);
    }
    if (!frame) throw new Error("Nothing to capture yet.");
    frame.paint(stage, core.settings);
    const blob = await stage.convertToBlob({ type: "image/png" });
    post({ type: "image", requestId, blob });
  } catch (error) {
    post({ type: "failed", requestId, message: describe(error) });
  } finally {
    setStageKnobs(null);
    if (project) core.setProject(project);
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
    const geometry = stageGeometry();
    if (!geometry) throw new Error("Nothing to capture yet.");
    // A show is a take from t = 0: fresh pattern state. A clip with the
    // viewfinder off is a fresh take too, warmed a moment in; with it on,
    // the clip records from the stage's current moment — what you see.
    if (automation) {
      resetStage();
    } else if (warmSeconds && warmSeconds > 0 && project) {
      resetStage();
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
          setStageKnobs([
            automation.knobs[base],
            automation.knobs[base + 1],
            automation.knobs[base + 2],
            automation.knobs[base + 3],
          ]);
        } else if (pinnedKnobs) {
          setStageKnobs(pinnedKnobs);
        }
        const frame = stepStage(dt);
        if (!frame) throw new Error("Project vanished mid-render.");
        frame.paint(stage, settings);
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
    setStageKnobs(null);
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
      // A ramp edit arrives as a project update like any other: repaint.
      if (syncShaderRamp() && usingShader()) markDirty();
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
      const before = core.settings.source;
      core.setSettings(message.settings);
      // Switching renderer is a cut, not a dissolve: the incoming stage starts
      // its own take rather than inheriting a clock it never ran.
      if (message.settings.source !== before) {
        resetStage();
        warmTo(STAGE_WARM_SECONDS);
        postState();
      }
      refreshProbe();
      postAuto();
      markDirty();
      return;
    }
    case "shader": {
      shaderLayerId = message.layerId;
      shader.setSource(message.source);
      syncShaderRamp();
      shader.prepare();
      postShaderStatus();
      if (core.settings.source === "shader") {
        postAuto();
        markDirty();
      }
      return;
    }
    case "button": {
      if (message.down) {
        core.pressButton(message.index);
        shader.pressButton(message.index);
      } else {
        core.releaseButton(message.index);
        shader.releaseButton(message.index);
      }
      // A press has to reach a frame to be seen: a paused stage renders one.
      markDirty();
      return;
    }
    case "visible": {
      visible = message.visible;
      if (visible) {
        // The stage idles until the viewfinder opens; a first frame at the
        // pattern's cold t = 0 is black more often than not. Wake it the way
        // a fresh take starts: warmed a moment in, at matrix size.
        if (core.ready && stageTime() === 0) warmTo(STAGE_WARM_SECONDS);
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
      resetStage();
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
        for (let index = 0; index < message.frames; index++) stepStage(dt);
      } else if (usingShader()) {
        shader.time = Math.max(0, shader.time + message.frames * dt);
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
