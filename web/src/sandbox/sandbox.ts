// ─────────────────────────────────────────────────────────────────────────────
// The sandboxed pattern page — what runs inside <iframe sandbox="allow-scripts">.
//
// Built into public/pattern-sandbox.html by scripts/build-sandbox.ts. The
// pattern runtime itself is the lab's own — PatternRuntime, the colour ramp
// math, the @ramp and @matrix parsers in src/lib/pattern/ — bundled in, so a
// change to the pattern contract reaches the community's previews and
// thumbnails by rebuilding this page, not by porting it by hand. (It was a
// hand-kept plain-JS copy for a year; by the end it turned a knob 20 detents
// a revolution where the lab and the encoder turn 24.) This file is only what
// the page adds on top: the canvas, the live loop, the postMessage protocol.
//
// The page is embedded WITHOUT allow-same-origin, so user-submitted pattern
// code runs under an opaque origin: no cookies, no localStorage, no parent
// DOM. All communication is postMessage. This is the community's XSS boundary
// — never embed this page with allow-same-origin, and never eval community
// code outside it.
// ─────────────────────────────────────────────────────────────────────────────
import {
  PATTERN_KNOB_COUNT,
  PatternRuntime,
  knobTargetToDelta,
  type ColorRamp,
  type PatternInput,
} from "../lib/pattern/harness";
import { hexToRgb } from "../lib/pattern/color";
import { matrixFromCode, type MatrixSize } from "../lib/pattern/matrix";
import { parseRampAnnotation } from "../lib/pattern/ramp";

type KnobRange = [number, number];

// The ramp a setValue() pattern gets when it carries no @ramp line — the
// sandbox has always painted those in this ramp rather than the lab's
// grayscale fallback, and every existing thumbnail was rendered with it.
const DEFAULT_RAMP: ColorRamp = {
  stops: [
    { position: 0.0, color: [8, 24, 64] },
    { position: 0.55, color: [255, 77, 0] },
    { position: 1.0, color: [255, 232, 154] },
  ],
  mode: "linear",
  wrap: false,
};

// Pixels a pattern never writes stay transparent, recolor or not — the
// harness skips them and this page always did too (its old recolor pass
// rewrote their colour but never their alpha), so the card shows through.
type Loaded = { runtime: PatternRuntime };

function load(code: string, frame: MatrixSize): { loaded: Loaded; ok: boolean; error?: string } {
  const runtime = new PatternRuntime(frame.width, frame.height);
  const annotation = parseRampAnnotation(code);
  const ramp: ColorRamp = annotation
    ? {
        stops: annotation.stops.map((stop) => ({ position: stop.position, color: hexToRgb(stop.color) })),
        mode: annotation.mode,
        wrap: annotation.wrap,
      }
    : DEFAULT_RAMP;
  runtime.setRamp(ramp);
  runtime.recolor = Boolean(annotation?.recolor);
  const result = runtime.loadCode(code);
  return { loaded: { runtime }, ok: result.ok, error: result.error };
}

function render(loaded: Loaded, dt: number, time: number, input: PatternInput) {
  return loaded.runtime.renderFrame(dt, time, input);
}

function makeInput(
  deltas: number[] | null,
  values: number[],
  normalized: number[],
  ranges: KnobRange[],
): PatternInput {
  const flags = [false, false, false, false];
  return {
    knobDeltas: deltas ?? [0, 0, 0, 0],
    knobValues: values,
    knobNormalized: normalized,
    knobRanges: ranges,
    btnPressed: flags,
    btnHeld: flags.slice(),
  };
}

function normalize(values: number[], ranges: KnobRange[]): number[] {
  return values.map((v, i) => {
    const range = ranges[i] ?? [0, 1];
    const span = Math.max(0.001, range[1] - range[0]);
    return (v - range[0]) / span;
  });
}

// ── Live view state ──────────────────────────────────────────────────────────
const canvas = document.getElementById("screen") as HTMLCanvasElement;
const context = canvas.getContext("2d") as CanvasRenderingContext2D;
let imageData = context.createImageData(canvas.width, canvas.height);

// Match the canvas to the frame the incoming pattern declares. The CSS keeps
// object-fit: contain, so a portrait pattern letterboxes inside the card
// instead of being squashed into a landscape box.
function resizeLive(frame: MatrixSize) {
  if (canvas.width === frame.width && canvas.height === frame.height) return;
  canvas.width = frame.width;
  canvas.height = frame.height;
  imageData = context.createImageData(frame.width, frame.height);
}

// The longest single step a pattern is ever handed. A frame that took longer
// than this is split into several of these rather than delivered as one jump:
// handing a whole stall to a pattern that integrates by dt teleports
// everything in it.
const MAX_STEP = 0.05;
// …and the most real time worth catching up on. Past this the frames are
// simply lost, which is what you want: returning to a tab that was hidden for
// a minute should resume, not fast-forward through a minute of simulation.
const MAX_CATCHUP = 0.25;

const live = {
  loaded: null as Loaded | null,
  running: true,
  simTime: 0,
  lastNow: 0,
  knobValues: [0.5, 0.5, 0.5, 0.5] as number[],
  knobRanges: [[0, 1], [0, 1], [0, 1], [0, 1]] as KnobRange[],
  knobWrap: [false, false, false, false] as boolean[],
  knobUnitsPerTurn: [1, 1, 1, 1] as number[],
  prevKnobs: null as number[] | null,
  failed: false,
  // Whether the canvas already shows the current state. Cleared whenever
  // something changes what should be on screen, so a paused preview still
  // redraws exactly once instead of either freezing stale or spinning at
  // 60fps. See tick().
  painted: false,
  // The pending requestAnimationFrame handle, or 0 when this sandbox is
  // asleep. A paused preview schedules NOTHING — see tick().
  frame: 0,
  // For the harness test (scripts/sandbox-smoke.ts), which drives this page
  // with a fake clock and reads the pattern's params back.
  get runtime() {
    return this.loaded?.runtime ?? null;
  },
};

function paint(loaded: Loaded) {
  imageData.data.set(loaded.runtime.data);
  context.putImageData(imageData, 0, 0);
}

function post(message: Record<string, unknown>) {
  parent.postMessage(message, "*");
}

/**
 * One simulation step. Returns false once the pattern has thrown.
 *
 * `withKnobDeltas` is true for the first step of a frame only: a knob turn is
 * one event, and replaying it across the catch-up steps below would multiply
 * the turn by however far behind the preview had fallen.
 */
function step(dt: number, withKnobDeltas: boolean): boolean {
  if (!live.loaded) return false;
  live.simTime += dt;

  let deltas: number[] | null = null;
  if (withKnobDeltas) {
    const prev = live.prevKnobs ?? live.knobValues;
    deltas = live.knobValues.map((v, i) =>
      knobTargetToDelta(prev[i], v, live.knobWrap[i], live.knobUnitsPerTurn[i] || 1),
    );
    live.prevKnobs = live.knobValues.slice();
  }

  const input = makeInput(deltas, live.knobValues, normalize(live.knobValues, live.knobRanges), live.knobRanges);
  const result = render(live.loaded, dt, live.simTime, input);
  if (!result.ok) {
    live.failed = true;
    post({ type: "pf-status", ok: false, error: result.error });
    return false;
  }
  return true;
}

/** Schedule a frame, unless one is already pending or this sandbox is dead. */
function wake() {
  if (live.frame !== 0 || live.failed || !live.loaded) return;
  // A sandbox that has been asleep has a stale lastNow; without this the first
  // frame back would bill the pattern for the whole pause.
  live.lastNow = performance.now();
  live.frame = requestAnimationFrame(tick);
}

function tick(now: number) {
  live.frame = 0;
  const loaded = live.loaded;
  if (!loaded || live.failed) return;

  const elapsed = Math.min(Math.max(0, (now - live.lastNow) / 1000), MAX_CATCHUP);
  live.lastNow = now;

  // A paused preview keeps its runtime loaded so hovering plays instantly, but
  // it has nothing new to draw. Paint once — a fresh load, or a knob turned
  // while stopped — and then stop scheduling frames ENTIRELY.
  //
  // It used to re-arm rAF forever and bail out inside the callback. That is
  // cheap per call and expensive in aggregate: a feed mounts one sandbox per
  // nearby card (thirteen of them on a full wall), and thirteen documents each
  // holding a live animation callback share the frame budget with the one card
  // the cursor is actually on. pf-run/pf-knobs/pf-load call wake() instead.
  if (!live.running) {
    if (!live.painted && step(0, true)) {
      paint(loaded);
      live.painted = true;
    }
    return;
  }

  // Slow frames must not become slow motion.
  //
  // dt used to be clamped to MAX_STEP and handed over once, so a preview
  // rendering at 10fps advanced the simulation by 50ms per 100ms of wall
  // clock: a pattern that integrates velocity by dt physically moved at half
  // speed. That reads as the pattern dying rather than stuttering, and it only
  // showed up on the wall — the detail page runs one sandbox and never falls
  // far enough behind to notice. The clamp now bounds each STEP, and whatever
  // real time is left over is stepped again (at most MAX_CATCHUP/MAX_STEP
  // times, so a long stall cannot turn into an unbounded burst).
  let remaining = elapsed;
  let first = true;
  do {
    const slice = remaining > MAX_STEP ? MAX_STEP : remaining;
    if (!step(slice, first)) return;
    remaining -= slice;
    first = false;
  } while (remaining > 1e-5);

  paint(loaded);
  live.painted = true;
  live.frame = requestAnimationFrame(tick);
}

// ── Still rendering (feed thumbnails) ────────────────────────────────────────
type StillRequest = {
  code?: unknown;
  fps?: number;
  seconds?: number;
  knobValues?: number[];
  knobRanges?: KnobRange[];
};

function renderStill(request: StillRequest): { ok: boolean; error?: string; dataUrl?: string } {
  const code = String(request.code ?? "");
  const frame = matrixFromCode(code);
  const { loaded, ok, error } = load(code, frame);
  if (!ok) return { ok: false, error };

  const fps = request.fps || 15;
  const seconds = typeof request.seconds === "number" ? request.seconds : 0.9;
  const frames = Math.max(1, Math.floor(seconds * fps));
  const values = request.knobValues ?? [0.5, 0.5, 0.5, 0.5];
  const ranges = request.knobRanges ?? [[0, 1], [0, 1], [0, 1], [0, 1]];
  const normalizedValues = normalize(values, ranges);

  for (let f = 0; f < frames; f++) {
    const result = render(loaded, 1 / fps, f / fps, makeInput(null, values, normalizedValues, ranges));
    if (!result.ok) return { ok: false, error: result.error };
  }

  const off = document.createElement("canvas");
  off.width = frame.width;
  off.height = frame.height;
  const offContext = off.getContext("2d") as CanvasRenderingContext2D;
  const offImage = offContext.createImageData(frame.width, frame.height);
  offImage.data.set(loaded.runtime.data);
  offContext.putImageData(offImage, 0, 0);
  return { ok: true, dataUrl: off.toDataURL("image/png") };
}

// ── Message protocol ─────────────────────────────────────────────────────────
type Message = {
  type?: unknown;
  code?: unknown;
  id?: unknown;
  knobValues?: unknown;
  knobRanges?: unknown;
  knobWrap?: unknown;
  knobUnitsPerTurn?: unknown;
  running?: unknown;
  values?: unknown;
  ranges?: unknown;
};

window.addEventListener("message", (event: MessageEvent) => {
  const msg = event.data as Message | null;
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "pf-load") {
    const code = String(msg.code ?? "");
    const frame = matrixFromCode(code);
    resizeLive(frame);
    live.simTime = 0;
    live.lastNow = performance.now();
    live.failed = false;
    live.prevKnobs = null;
    // A fresh pattern must reach the canvas even if it loads paused.
    live.painted = false;
    if (Array.isArray(msg.knobValues)) live.knobValues = (msg.knobValues as number[]).slice(0, PATTERN_KNOB_COUNT);
    if (Array.isArray(msg.knobRanges)) live.knobRanges = msg.knobRanges as KnobRange[];
    if (Array.isArray(msg.knobWrap)) live.knobWrap = msg.knobWrap as boolean[];
    if (Array.isArray(msg.knobUnitsPerTurn)) live.knobUnitsPerTurn = msg.knobUnitsPerTurn as number[];
    if (typeof msg.running === "boolean") live.running = msg.running;
    const { loaded, ok, error } = load(code, frame);
    live.loaded = loaded;
    if (ok) {
      paint(loaded);
      post({ type: "pf-status", ok: true });
      wake();
    } else {
      live.failed = true;
      post({ type: "pf-status", ok: false, error });
    }
  } else if (msg.type === "pf-knobs") {
    if (Array.isArray(msg.values)) live.knobValues = (msg.values as number[]).slice(0, PATTERN_KNOB_COUNT);
    if (Array.isArray(msg.ranges)) live.knobRanges = msg.ranges as KnobRange[];
    // Knobs can be turned on a card that is not playing — redraw that once.
    live.painted = false;
    wake();
  } else if (msg.type === "pf-run") {
    live.running = Boolean(msg.running);
    // Starting is the whole point of waking; stopping needs it too, so the
    // paused branch of tick gets a chance to settle the final frame.
    wake();
  } else if (msg.type === "pf-still") {
    let result: { ok: boolean; error?: string; dataUrl?: string };
    try {
      result = renderStill(msg as StillRequest);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    post({ ...result, type: "pf-still-result", id: msg.id });
  }
});

// The harness test reaches in here. Inside an opaque-origin iframe nothing
// else can.
(globalThis as unknown as { __pfLive: typeof live }).__pfLive = live;

post({ type: "pf-ready" });
