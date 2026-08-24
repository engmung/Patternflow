// ── Pattern Lab capture module ───────────────────────────────────────────────
// Renders the lab's layer stack for OUTPUT rather than for the LED panel:
// stills (PNG) and clips (MP4/WebM) at print/screen resolutions, with the
// pattern either re-run at the output size ("native"), blown up as crisp
// blocks ("pixel"), drawn as round LEDs ("led"), or — the default — re-run
// only when a probe shows the code scales, upscaled otherwise ("auto", see
// probe.ts). Upscales are nearest-only for now; smoothing/interpolation is
// planned to return as a separate option layered on top, not as a look.
//
// This whole directory is an add-on. It owns its own LabEngine instance and
// runs it in a Web Worker, so nothing here touches the live preview, the
// store, the persistence format, or the export/publish paths. Removing the
// Capture panel removes the feature; the rest of the lab does not know it is
// there.

import type { MatrixSize } from "@/lib/patternMatrix";
import type { Layer, PixelLayer } from "../types";

/** What the user picks. */
export type CaptureStyle = "auto" | "native" | "pixel" | "led";
/** What actually gets painted once `auto` has been resolved. */
export type CaptureLook = "native" | "pixel" | "led";
/** Looks that take a W×H output size; the others take a blow-up factor. */
export const SIZED_STYLES: CaptureStyle[] = ["auto", "native"];

/**
 * What sits behind the picture.
 *   black        exactly what the panel shows — the composite as-is, opaque.
 *   transparent  PNG alpha (video flattens it onto black).
 *   color        flattened onto a solid color of your choosing.
 */
export type CaptureBackdrop = "black" | "transparent" | "color";

/**
 * Which parts become see-through when the backdrop is not black.
 *   unpainted  only where no layer painted (or a ramp/opacity/mask left a
 *              hole) — the composition is treated as paint.
 *   dark       black fades to clear, like the light an LED emits — a pattern
 *              laid over white paper glows instead of sitting in a black box.
 *              (the "unmult" operation: alpha = max(r, g, b).)
 */
export type CaptureCutout = "unpainted" | "dark";

export type CaptureVideoFormat = "mp4" | "webm";

/**
 * Clockwise turn applied to the finished picture — the device's "mounting"
 * idea: the pattern always runs in its own orientation, the output frame is
 * what gets turned. 90/270 swap the render grid so a landscape pattern fills
 * a portrait output edge to edge.
 */
export type CaptureRotation = 0 | 90 | 180 | 270;
export const CAPTURE_ROTATIONS: CaptureRotation[] = [0, 90, 180, 270];

export type CaptureSettings = {
  style: CaptureStyle;
  /**
   * Output size for `auto` / `native`. Native runs the pattern code at
   * exactly this grid; the auto fallback covers it with the matrix render,
   * cropping the overflow.
   */
  width: number;
  height: number;
  /** Integer blow-up of the project matrix for `pixel` / `led`. */
  scale: number;
  /**
   * How blocky upscales are drawn — the Pixel look and Auto's fallback.
   * "crisp" keeps hard cell edges, "soft" interpolates between them.
   */
  upscale: "crisp" | "soft";
  /**
   * Live-stage quality only, never the exports: "auto" caps the stage near
   * 720p-class, "fast" much lower for instant feedback on heavy patterns.
   * The picture keeps the exact composition either way, just fewer pixels.
   */
  previewMode: "auto" | "fast";
  rotation: CaptureRotation;
  backdrop: CaptureBackdrop;
  cutout: CaptureCutout;
  /** Hex, for `backdrop: "color"`. */
  backdropColor: string;
  /** LED look: dot diameter as a fraction of the cell, and glow strength. */
  ledDot: number;
  ledGlow: number;
  /** Stage playback speed multiplier. */
  speed: number;
  video: {
    fps: number;
    seconds: number;
    format: CaptureVideoFormat;
  };
};

export const CAPTURE_SIDE_MAX = 4096;
export const CAPTURE_SIDE_MIN = 16;
export const CAPTURE_SCALES = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32] as const;
export const CAPTURE_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export const CAPTURE_FPS = [24, 30, 60] as const;
export const CAPTURE_SECONDS_MAX = 60;

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  style: "auto",
  width: 1024,
  height: 512,
  scale: 8,
  upscale: "crisp",
  previewMode: "auto",
  rotation: 0,
  backdrop: "black",
  cutout: "unpainted",
  backdropColor: "#ffffff",
  ledDot: 0.72,
  ledGlow: 0.35,
  speed: 1,
  video: { fps: 30, seconds: 6, format: "mp4" },
};

/**
 * The geometry one settings object resolves to for a given project matrix.
 * The render grid is placed in the unturned `box` at `scale`, offset by
 * (offsetX, offsetY) — zero for exact multiples, negative when a cover fit
 * crops — and the box is turned by `rotation` to become the `output`.
 */
export type CaptureGeometry = {
  look: CaptureLook;
  /** The grid the pattern code actually runs at. */
  render: MatrixSize;
  /** The unturned picture. */
  box: MatrixSize;
  /** The picture that is written out. */
  output: MatrixSize;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: CaptureRotation;
};

/** What the worker decided for `auto`, for the panel to show. */
export type AutoVerdict = {
  verdict: "native" | "upscale";
  reason: string;
  description: string;
  /** The probe's numbers, for the tooltip. */
  detail: string;
};

/**
 * The slice of the lab project the stage needs. Code layers travel whole;
 * pixel layers travel with their buffer only when `rev` changed since the
 * last message (the worker keeps the previous copy).
 */
export type WirePixelLayer = Omit<PixelLayer, "data"> & { data?: Uint8ClampedArray };
export type WireLayer = Exclude<Layer, PixelLayer> | WirePixelLayer;

export type WireProject = {
  matrix: MatrixSize;
  layers: WireLayer[];
  activeLayerId: string;
  knobs: number[];
  ranges: Array<[number, number]>;
};

/** A fully-resolved project as the worker holds it. */
export type CaptureProject = Omit<WireProject, "layers"> & { layers: Layer[] };

// ── worker protocol ──

export type VideoRequest = {
  fps: number;
  seconds: number;
  format: CaptureVideoFormat;
};

export type ToWorker =
  | { type: "project"; project: WireProject }
  | { type: "settings"; settings: CaptureSettings }
  | { type: "visible"; visible: boolean }
  | { type: "play" }
  | { type: "pause" }
  | { type: "restart" }
  | { type: "step"; frames: number }
  | { type: "frame-shown" }
  | { type: "export-image"; requestId: number }
  | { type: "export-video"; requestId: number; video: VideoRequest }
  | { type: "cancel-export" };

export type FrameMessage = {
  type: "frame";
  bitmap: ImageBitmap;
  width: number;
  height: number;
  time: number;
  playing: boolean;
  renderMs: number;
  errors: Record<string, string>;
  geometry: CaptureGeometry;
  /** Present while the style is `auto`. */
  auto: AutoVerdict | null;
  /**
   * Set when the live stage rendered below the requested size to stay fluid:
   * the linear factor applied (0.5 = half width). Exports are never scaled,
   * so export previews and small outputs carry null.
   */
  preview: number | null;
};

export type FromWorker =
  | { type: "ready" }
  | FrameMessage
  | { type: "state"; time: number; playing: boolean }
  | { type: "progress"; requestId: number; done: number; total: number }
  | { type: "image"; requestId: number; blob: Blob }
  | { type: "video"; requestId: number; blob: Blob; extension: string }
  | { type: "failed"; requestId: number; message: string }
  | { type: "fatal"; message: string };
