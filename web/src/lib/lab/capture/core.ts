// ── Capture core ─────────────────────────────────────────────────────────────
// The stage's renderer, with no DOM in it: a private LabEngine plus a clock,
// turning (project, settings, dt) into a straight-alpha RGBA picture at the
// output size. Runs inside the capture worker; the smoke test runs it in
// node. Nothing here is shared with the live preview — a second engine means
// the stage has its own pattern state and its own time, like a render view
// next to a viewport.

import type { MatrixSize } from "@/lib/patternMatrix";
import { LabEngine } from "../engine";
import type { Layer, PixelLayer } from "../types";
import {
  CAPTURE_SIDE_MAX,
  CAPTURE_SIDE_MIN,
  type CaptureGeometry,
  type CaptureLook,
  type CaptureProject,
  type CaptureRotation,
  type CaptureSettings,
  type WireProject,
} from "./types";

export function clampSide(value: number): number {
  if (!Number.isFinite(value)) return CAPTURE_SIDE_MIN;
  return Math.max(CAPTURE_SIDE_MIN, Math.min(CAPTURE_SIDE_MAX, Math.round(value)));
}

/** The largest of the allowed blow-ups that keeps both sides within limits. */
export function clampScale(scale: number, matrix: MatrixSize): number {
  const longest = Math.max(matrix.width, matrix.height);
  const max = Math.max(1, Math.floor(CAPTURE_SIDE_MAX / longest));
  const wanted = Number.isFinite(scale) ? Math.max(1, Math.round(scale)) : 1;
  return Math.min(wanted, max);
}

function turned(size: MatrixSize, rotation: CaptureRotation): MatrixSize {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/**
 * `autoLook` is what the probe decided for the `auto` style; until a
 * verdict exists auto behaves as native. The output size never depends on
 * it, so the panel can resolve sizes without one.
 */
export function resolveGeometry(
  settings: CaptureSettings,
  matrix: MatrixSize,
  autoLook: "native" | "pixel" = "native",
): CaptureGeometry {
  const { rotation } = settings;
  const look: CaptureLook = settings.style === "auto" ? autoLook : settings.style;

  if (settings.style === "pixel" || settings.style === "led") {
    const scale = clampScale(settings.scale, matrix);
    const box = { width: matrix.width * scale, height: matrix.height * scale };
    return {
      look,
      render: { width: matrix.width, height: matrix.height },
      box,
      output: turned(box, rotation),
      scale,
      offsetX: 0,
      offsetY: 0,
      rotation,
    };
  }

  // Sized looks: the size is the finished picture; the unturned box is
  // the frame that turns INTO it.
  const output = { width: clampSide(settings.width), height: clampSide(settings.height) };
  const box = turned(output, rotation);
  if (look === "native") {
    return { look, render: box, box, output, scale: 1, offsetX: 0, offsetY: 0, rotation };
  }
  // Cover fit of the matrix render: fill the box, crop the overflow,
  // centred — a 2:1 pattern on a 1.75:1 card loses a sliver at each side
  // rather than being squashed.
  const scale = Math.max(box.width / matrix.width, box.height / matrix.height);
  return {
    look,
    render: { width: matrix.width, height: matrix.height },
    box,
    output,
    scale,
    offsetX: (box.width - matrix.width * scale) / 2,
    offsetY: (box.height - matrix.height * scale) / 2,
    rotation,
  };
}

/**
 * Nearest-neighbour stretch, independent per axis — a 128×64 sprite sheet
 * drawn for the panel lands on a 1050×600 card without a blurry resample,
 * and an off-aspect output simply stretches it the way the pattern beneath
 * stretches too.
 */
export function stretchNearest(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  if (srcWidth <= 0 || srcHeight <= 0) return out;
  for (let y = 0; y < dstHeight; y++) {
    const sy = Math.min(srcHeight - 1, Math.floor((y * srcHeight) / dstHeight));
    const srcRow = sy * srcWidth;
    const dstRow = y * dstWidth;
    for (let x = 0; x < dstWidth; x++) {
      const sx = Math.min(srcWidth - 1, Math.floor((x * srcWidth) / dstWidth));
      const si = (srcRow + sx) * 4;
      const di = (dstRow + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

/**
 * Merge a wire project into the previous one: a pixel layer that arrived
 * without its buffer keeps the copy from last time. A layer with neither is
 * dropped rather than rendered empty — it cannot happen with an in-order
 * channel, but a silent blank layer would be the worst way to find out.
 */
export function mergeWireProject(
  previous: CaptureProject | null,
  wire: WireProject,
): CaptureProject {
  const known = new Map<string, PixelLayer>();
  for (const layer of previous?.layers ?? []) {
    if (layer.type === "pixel") known.set(layer.id, layer);
  }
  const layers: Layer[] = [];
  for (const layer of wire.layers) {
    if (layer.type !== "pixel") {
      layers.push(layer);
      continue;
    }
    if (layer.data) {
      layers.push(layer as PixelLayer);
      continue;
    }
    const earlier = known.get(layer.id);
    if (!earlier) continue;
    layers.push({ ...layer, data: earlier.data });
  }
  return {
    matrix: wire.matrix,
    layers,
    activeLayerId: wire.activeLayerId,
    knobs: wire.knobs,
    ranges: wire.ranges,
  };
}

export type CaptureFrame = {
  geometry: CaptureGeometry;
  /** The engine composite, opaque, at `geometry.render`. */
  opaque: Uint8ClampedArray;
  /**
   * Straight-alpha RGBA at `geometry.render`, built for the chosen backdrop
   * and cutout. Same buffer as `opaque` when nothing is cut out.
   */
  rgba: Uint8ClampedArray;
  renderMs: number;
  time: number;
  errors: Record<string, string>;
};

type StretchedEntry = {
  /** The store's layer object this copy was made from. */
  source: PixelLayer;
  width: number;
  height: number;
  layer: PixelLayer;
};

export class CaptureCore {
  private engine = new LabEngine();
  private project: CaptureProject | null = null;
  private stretched = new Map<string, StretchedEntry>();
  private coverage = new Uint8ClampedArray(0);
  private straight = new Uint8ClampedArray(0);
  settings: CaptureSettings;
  /** What `auto` resolves to; the worker sets it from the probe. */
  autoLook: "native" | "pixel" = "native";
  time = 0;

  constructor(settings: CaptureSettings) {
    this.settings = settings;
  }

  get ready(): boolean {
    return this.project !== null;
  }

  get matrix(): MatrixSize | null {
    return this.project?.matrix ?? null;
  }

  setProject(project: CaptureProject) {
    this.project = project;
  }

  setSettings(settings: CaptureSettings) {
    this.settings = settings;
  }

  geometry(): CaptureGeometry | null {
    if (!this.project) return null;
    return resolveGeometry(this.settings, this.project.matrix, this.autoLook);
  }

  /** Fresh pattern state, time zero — a new take. */
  reset() {
    this.engine = new LabEngine();
    this.stretched.clear();
    this.time = 0;
  }

  /**
   * Pixel layers drawn for the project matrix, stretched to the render grid.
   * Cached per layer by rev + size; code layers pass straight through.
   */
  private layersFor(render: MatrixSize): Layer[] {
    const project = this.project!;
    const live = new Set<string>();
    const layers = project.layers.map((layer) => {
      if (layer.type !== "pixel") return layer;
      if (layer.width === render.width && layer.height === render.height) return layer;
      live.add(layer.id);
      const cached = this.stretched.get(layer.id);
      if (cached && cached.width === render.width && cached.height === render.height) {
        if (cached.source === layer) return cached.layer;
        if (cached.source.rev === layer.rev && cached.source.data === layer.data) {
          // Same pixels, new flags (opacity, visibility, blend…): re-wrap the
          // stretched buffer instead of resampling it.
          cached.source = layer;
          cached.layer = { ...layer, width: render.width, height: render.height, data: cached.layer.data };
          return cached.layer;
        }
      }
      const stretchedLayer: PixelLayer = {
        ...layer,
        width: render.width,
        height: render.height,
        data: stretchNearest(layer.data, layer.width, layer.height, render.width, render.height),
      };
      this.stretched.set(layer.id, {
        source: layer,
        width: render.width,
        height: render.height,
        layer: stretchedLayer,
      });
      return stretchedLayer;
    });
    for (const id of this.stretched.keys()) {
      if (!live.has(id)) this.stretched.delete(id);
    }
    return layers;
  }

  /**
   * Advance the stage clock by `dt` seconds of pattern time (0 re-renders
   * the current moment) and produce the output picture. `geometryOverride`
   * lets the caller render the same moment at a different size — the live
   * stage passes a budget-capped geometry, exports pass nothing.
   */
  step(dt: number, geometryOverride?: CaptureGeometry): CaptureFrame | null {
    const project = this.project;
    if (!project) return null;
    const geometry =
      geometryOverride ?? resolveGeometry(this.settings, project.matrix, this.autoLook);
    const layers = this.layersFor(geometry.render);
    this.time += dt;

    const frame = this.engine.render(
      {
        matrix: geometry.render,
        layers,
        activeLayerId: project.activeLayerId,
        knobs: project.knobs,
        ranges: project.ranges,
      },
      dt,
      this.time,
    );

    const errors: Record<string, string> = {};
    this.engine.errors.forEach((message, id) => {
      if (message) errors[id] = message;
    });

    return {
      geometry,
      opaque: frame.data,
      rgba: this.straightFor(frame.data, geometry, layers),
      renderMs: frame.renderMs,
      time: this.time,
      errors,
    };
  }

  private straightFor(
    opaque: Uint8ClampedArray,
    geometry: CaptureGeometry,
    layers: Layer[],
  ): Uint8ClampedArray {
    const { look } = geometry;
    const { backdrop, cutout } = this.settings;
    // LEDs are light, not paint: the dot look always keys dark to clear so a
    // dim LED over any backdrop is a faint dot, exactly as over black.
    const mode = look === "led" ? "dark" : backdrop === "black" ? "none" : cutout;
    if (mode === "none") return opaque;

    const pixelCount = geometry.render.width * geometry.render.height;
    if (this.straight.length !== pixelCount * 4) {
      this.straight = new Uint8ClampedArray(pixelCount * 4);
    }
    const out = this.straight;

    if (mode === "dark") {
      unmultiply(opaque, out, pixelCount);
      return out;
    }

    if (this.coverage.length !== pixelCount) this.coverage = new Uint8ClampedArray(pixelCount);
    this.engine.coverage(geometry.render, layers, this.coverage);
    unpremultiply(opaque, this.coverage, out, pixelCount);
    return out;
  }
}

/**
 * Black → clear. The composite over an opaque black panel IS the
 * premultiplied picture of the light the LEDs emit; alpha = max channel
 * recovers the straight color, so a dim red (50,0,0) becomes (255,0,0) at 20 %.
 */
export function unmultiply(src: Uint8ClampedArray, out: Uint8ClampedArray, pixelCount: number) {
  for (let i = 0; i < pixelCount; i++) {
    const j = i * 4;
    const r = src[j];
    const g = src[j + 1];
    const b = src[j + 2];
    const alpha = Math.max(r, g, b);
    if (alpha === 0) {
      out[j] = 0;
      out[j + 1] = 0;
      out[j + 2] = 0;
      out[j + 3] = 0;
      continue;
    }
    const k = 255 / alpha;
    out[j] = r * k;
    out[j + 1] = g * k;
    out[j + 2] = b * k;
    out[j + 3] = alpha;
  }
}

/**
 * Unpainted → clear. Normal blending over black yields premultiplied color,
 * so dividing by the layer-stack coverage gives the straight color of what
 * WAS painted; pixels nothing touched come out fully transparent.
 */
export function unpremultiply(
  src: Uint8ClampedArray,
  coverage: Uint8ClampedArray,
  out: Uint8ClampedArray,
  pixelCount: number,
) {
  for (let i = 0; i < pixelCount; i++) {
    const j = i * 4;
    const alpha = coverage[i];
    if (alpha === 0) {
      out[j] = 0;
      out[j + 1] = 0;
      out[j + 2] = 0;
      out[j + 3] = 0;
      continue;
    }
    const k = 255 / alpha;
    // Uint8ClampedArray clamps the add/screen overshoot for us.
    out[j] = src[j] * k;
    out[j + 1] = src[j + 1] * k;
    out[j + 2] = src[j + 2] * k;
    out[j + 3] = alpha;
  }
}
