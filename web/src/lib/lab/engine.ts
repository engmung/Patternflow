// ── Lab render engine ────────────────────────────────────────────────────────
// Owns one PatternRuntime per code layer and composites the visible stack into
// a single RGBA frame each animation tick. Lives OUTSIDE React: the preview
// panel drives it from requestAnimationFrame and reads the store imperatively,
// so knob turns and code edits never restart the loop.

import {
  PatternRuntime,
  createIdleInput,
  knobTargetToDelta,
  type ColorRamp,
} from "@/lib/patternHarness";
import {
  knobUnitsPerTurn,
  LOGICAL_KNOB_WRAP,
} from "@/lib/patternflowControls";
import type { MatrixSize } from "@/lib/patternMatrix";
import { applyMaskToCoverage, compositeLayers, type CompositeEntry } from "./compositor";
import type { CodeLayer, Layer, RampState } from "./types";

const RECOMPILE_DEBOUNCE_MS = 180;

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rampStateToHarness(ramp: RampState): ColorRamp {
  return {
    stops: ramp.stops.map((stop) => ({
      position: stop.position,
      color: hexToRgb(stop.color),
      alpha: stop.alpha,
    })),
    mode: ramp.mode,
    wrap: ramp.wrap,
  };
}

type LayerEntry = {
  runtime: PatternRuntime;
  code: string;
  width: number;
  height: number;
  pendingCode: string | null;
  pendingAt: number;
  // Ramp cache: rebuild the harness ramp only when the layer's ramp state
  // object identity changes (zustand updates are immutable).
  rampState: RampState | null;
  ramp: ColorRamp | null;
};

/** The store slice the engine consumes each frame. */
export type EngineProject = {
  matrix: MatrixSize;
  layers: Layer[];
  activeLayerId: string;
  knobs: number[];
  ranges: Array<[number, number]>;
};

export type EngineFrame = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  renderMs: number;
};

export class LabEngine {
  private entries = new Map<string, LayerEntry>();
  /** Latest per-layer runtime error (null = healthy). */
  readonly errors = new Map<string, string | null>();

  private out = new Uint8ClampedArray(0);
  private outWidth = 0;
  private outHeight = 0;

  // Encoder button state, pressed via the Knobs panel; applies to the ACTIVE
  // code layer only (the physical device also routes buttons to the running
  // pattern).
  private btnHeld = [false, false, false, false];
  private btnPending = [false, false, false, false];

  pressButton(index: number) {
    if (this.btnHeld[index]) return;
    this.btnHeld[index] = true;
    this.btnPending[index] = true;
  }

  releaseButton(index: number) {
    this.btnHeld[index] = false;
  }

  releaseAllButtons() {
    this.btnHeld = [false, false, false, false];
  }

  /** Drop cached runtimes for layers that no longer exist. */
  private prune(layers: Layer[]) {
    const ids = new Set(layers.map((layer) => layer.id));
    for (const id of this.entries.keys()) {
      if (!ids.has(id)) {
        this.entries.delete(id);
        this.errors.delete(id);
      }
    }
  }

  private ensureEntry(layer: CodeLayer, matrix: MatrixSize, now: number): LayerEntry {
    let entry = this.entries.get(layer.id);

    if (!entry || entry.width !== matrix.width || entry.height !== matrix.height) {
      const runtime = new PatternRuntime(matrix.width, matrix.height);
      const result = runtime.loadCode(layer.code);
      this.errors.set(layer.id, result.ok ? null : result.error ?? "Pattern failed to load.");
      entry = {
        runtime,
        code: layer.code,
        width: matrix.width,
        height: matrix.height,
        pendingCode: null,
        pendingAt: 0,
        rampState: null,
        ramp: null,
      };
      this.entries.set(layer.id, entry);
      return entry;
    }

    if (layer.code !== entry.code) {
      // Debounce recompiles so typing doesn't re-run setup() per keystroke.
      if (entry.pendingCode !== layer.code) {
        entry.pendingCode = layer.code;
        entry.pendingAt = now;
      } else if (now - entry.pendingAt >= RECOMPILE_DEBOUNCE_MS) {
        const result = entry.runtime.loadCode(layer.code);
        this.errors.set(layer.id, result.ok ? null : result.error ?? "Pattern failed to load.");
        entry.code = layer.code;
        entry.pendingCode = null;
      }
    }

    return entry;
  }

  // Previous frame's knob values, for delta computation — one shared set for
  // the whole stack, exactly like the four physical encoders.
  private prevKnobs: number[] | null = null;

  /**
   * Advance every visible code layer one frame and composite the stack.
   * `layers[0]` is the top of the stack (UI order); compositing walks
   * back-to-front. Every layer receives the SAME knob input.
   */
  render(project: EngineProject, dt: number, time: number): EngineFrame {
    const { matrix, layers, activeLayerId, knobs, ranges } = project;
    const startedAt = performance.now();
    this.prune(layers);

    if (this.outWidth !== matrix.width || this.outHeight !== matrix.height) {
      this.out = new Uint8ClampedArray(matrix.width * matrix.height * 4);
      this.outWidth = matrix.width;
      this.outHeight = matrix.height;
    }

    const btnPressed = [...this.btnPending];
    const btnHeld = [...this.btnHeld];
    this.btnPending = [false, false, false, false];

    const previous = this.prevKnobs ?? knobs;
    const knobDeltas = knobs.map((value, knobIndex) =>
      knobTargetToDelta(
        previous[knobIndex] ?? value,
        value,
        LOGICAL_KNOB_WRAP[knobIndex],
        knobUnitsPerTurn(ranges[knobIndex] ?? [0, 1]),
      ),
    );
    const knobNormalized = knobs.map((value, knobIndex) => {
      const range = ranges[knobIndex] ?? [0, 1];
      const span = Math.max(0.0001, range[1] - range[0]);
      return (value - range[0]) / span;
    });
    this.prevKnobs = [...knobs];

    // Pass 1 — advance every visible code layer's runtime, mask layers
    // included: a code mask animates like any other pattern.
    for (let index = layers.length - 1; index >= 0; index--) {
      const layer = layers[index];
      if (!layer.visible || layer.type !== "code") continue;
      if (layer.role !== "mask" && layer.opacity <= 0) continue;

      const entry = this.ensureEntry(layer, matrix, startedAt);
      const runtime = entry.runtime;

      if (entry.rampState !== layer.ramp) {
        entry.rampState = layer.ramp;
        entry.ramp = rampStateToHarness(layer.ramp);
        runtime.setRamp(entry.ramp);
      }
      runtime.recolor = layer.recolor;

      const isActive = layer.id === activeLayerId;
      const result = runtime.renderFrame(
        dt,
        time,
        createIdleInput(knobDeltas, {
          knobValues: knobs,
          knobNormalized,
          knobRanges: ranges,
          btnPressed: isActive ? btnPressed : undefined,
          btnHeld: isActive ? btnHeld : undefined,
        }),
      );
      this.errors.set(layer.id, result.ok ? null : result.error ?? "Runtime error.");
    }

    // Pass 2 — group paint entries with the mask layers sitting above them,
    // then composite. On error the runtime keeps its last good frame — it
    // still composites, so a typo mid-edit dims nothing.
    const compositeEntries = this.buildEntries(matrix, layers, null);
    compositeLayers(this.out, compositeEntries, matrix.width * matrix.height);

    return {
      data: this.out,
      width: matrix.width,
      height: matrix.height,
      renderMs: performance.now() - startedAt,
    };
  }

  /** A layer's CURRENT buffer at this frame size, or null if unavailable. */
  private bufferOf(layer: Layer, matrix: MatrixSize): Uint8ClampedArray | null {
    if (layer.type === "pixel") {
      return layer.width === matrix.width && layer.height === matrix.height ? layer.data : null;
    }
    const entry = this.entries.get(layer.id);
    return entry && entry.width === matrix.width && entry.height === matrix.height
      ? entry.runtime.data
      : null;
  }

  /**
   * Bottom→top composite entries with mask grouping: a mask layer contributes
   * no paint — its buffer ANDs into the coverage of the nearest paint layer
   * BELOW it (multiple stacked masks intersect).
   */
  private buildEntries(
    matrix: MatrixSize,
    layers: Layer[],
    excludeId: string | null,
  ): CompositeEntry[] {
    const pixelCount = matrix.width * matrix.height;
    const entries: CompositeEntry[] = [];
    let lastPaint: CompositeEntry | null = null;

    for (let index = layers.length - 1; index >= 0; index--) {
      const layer = layers[index];
      if (layer.id === excludeId || !layer.visible) continue;

      const buffer = this.bufferOf(layer, matrix);
      if (!buffer) continue;

      if (layer.role === "mask") {
        if (!lastPaint) continue; // mask at the very bottom gates nothing
        if (!lastPaint.mask) lastPaint.mask = new Uint8Array(pixelCount).fill(1);
        applyMaskToCoverage(
          lastPaint.mask,
          buffer,
          layer.type === "pixel",
          layer.maskInvert,
          pixelCount,
        );
        continue;
      }

      if (layer.opacity <= 0) {
        // Invisible paint still anchors masks above it, so they don't leak
        // onto a deeper layer.
        lastPaint = { data: buffer, opacity: 0, blend: layer.blend };
        continue;
      }
      const entry: CompositeEntry = { data: buffer, opacity: layer.opacity, blend: layer.blend };
      entries.push(entry);
      lastPaint = entry;
    }
    return entries;
  }

  /**
   * Composite the current buffers of every visible layer EXCEPT `excludeId`
   * (no time advance) — the pixel editor's alignment backdrop.
   */
  compositeBackdrop(matrix: MatrixSize, layers: Layer[], excludeId: string): EngineFrame {
    if (this.outWidth !== matrix.width || this.outHeight !== matrix.height) {
      this.out = new Uint8ClampedArray(matrix.width * matrix.height * 4);
      this.outWidth = matrix.width;
      this.outHeight = matrix.height;
    }
    const backdrop = new Uint8ClampedArray(matrix.width * matrix.height * 4);
    compositeLayers(backdrop, this.buildEntries(matrix, layers, excludeId), matrix.width * matrix.height);
    return { data: backdrop, width: matrix.width, height: matrix.height, renderMs: 0 };
  }
}

/** One shared engine per lab session. */
export const labEngine = new LabEngine();
