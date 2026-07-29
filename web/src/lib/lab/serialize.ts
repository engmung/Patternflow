// ── Lab project persistence (v2, layered) ────────────────────────────────────
// The layered lab stores its whole working state — layer stack included — in
// one localStorage key. Pixel layers serialize their RGBA bytes as base64.
// Reads are defensive: a project written by any other build must degrade to
// "no project" (or partial restore) rather than crash the lab on boot.
//
// Migration: when no v2 project exists, the old single-pattern draft
// (patternflow_lab_draft_v1 + patternflow_ramp_v1) is lifted into a one-layer
// project, so nobody loses work by opening the new lab once.

import { RAMP_MODES, type RampMode } from "@/lib/patternHarness";
import { COLOR_MODES, THINKING_LEVELS } from "@/lib/gemini";
import type { ColorMode, ThinkingLevelKey } from "@/lib/gemini";
import { isValidMatrix, DEFAULT_MATRIX, type MatrixSize } from "@/lib/patternMatrix";
import { loadDraft } from "@/lib/labDraft";
import { PATTERN_KNOB_COUNT } from "@/lib/patternHarness";
import {
  BLEND_MODES,
  DEFAULT_RAMP_STATE,
  MAX_RAMP_STOPS,
  cloneRampState,
  layerId,
  type BlendMode,
  type CodeLayer,
  type ForkRef,
  type GenSettings,
  type KnobRange,
  type LabProject,
  type Layer,
  type LayerRole,
  type PixelLayer,
  type RampState,
} from "./types";
import { defaultKnobState, matchKnobsAnnotation } from "./annotations";
import { matchMatrixAnnotation } from "@/lib/patternMatrix";

export const PROJECT_STORAGE = "patternflow_lab_project_v2";
export const LAYOUT_STORAGE = "patternflow_lab_layout_v1";
/** Old single-pattern lab keys, read once for migration. */
const LEGACY_RAMP_STORAGE = "patternflow_ramp_v1";

const MAX_CODE_CHARS = 200_000;
const MAX_LAYERS = 24;
const MAX_PIXEL_BYTES = 512 * 512 * 4;

// ── base64 helpers ──
export function bytesToBase64(bytes: Uint8ClampedArray): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string, expectedLength: number): Uint8ClampedArray | null {
  try {
    const binary = atob(base64);
    if (binary.length !== expectedLength) return null;
    const bytes = new Uint8ClampedArray(expectedLength);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// ── validation helpers ──
function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function readRamp(raw: unknown): RampState {
  if (!raw || typeof raw !== "object") return cloneRampState(DEFAULT_RAMP_STATE);
  const candidate = raw as Partial<RampState>;
  if (!Array.isArray(candidate.stops) || candidate.stops.length === 0) {
    return cloneRampState(DEFAULT_RAMP_STATE);
  }
  return {
    stops: candidate.stops.slice(0, MAX_RAMP_STOPS).map((stop) => ({
      position: clamp01(stop?.position, 0),
      color: /^#[0-9a-fA-F]{6}$/.test(String(stop?.color)) ? String(stop.color) : "#ffffff",
      alpha: clamp01((stop as { alpha?: unknown })?.alpha, 1),
    })),
    mode: RAMP_MODES.includes(candidate.mode as RampMode)
      ? (candidate.mode as RampMode)
      : "linear",
    wrap: Boolean(candidate.wrap),
  };
}

function readKnobs(raw: Record<string, unknown>): {
  knobs: number[];
  ranges: KnobRange[];
  labels: string[];
} {
  const fallback = defaultKnobState();
  const knobs = Array.isArray(raw.knobs) ? raw.knobs.map(Number) : null;
  const labels = Array.isArray(raw.knobLabels) ? raw.knobLabels.map(String) : null;
  const ranges: KnobRange[] | null = Array.isArray(raw.ranges)
    ? raw.ranges.map((entry): KnobRange => {
        if (Array.isArray(entry) && entry.length === 2) {
          const min = Number(entry[0]);
          const max = Number(entry[1]);
          if (Number.isFinite(min) && Number.isFinite(max) && max > min) return [min, max];
        }
        return [0, 1];
      })
    : null;
  return {
    knobs:
      knobs && knobs.length === PATTERN_KNOB_COUNT && knobs.every(Number.isFinite)
        ? knobs
        : fallback.knobs,
    ranges: ranges && ranges.length === PATTERN_KNOB_COUNT ? ranges : fallback.ranges,
    labels:
      labels && labels.length === PATTERN_KNOB_COUNT
        ? labels.map((label) => label.slice(0, 24))
        : fallback.labels,
  };
}

function readBlend(raw: unknown): BlendMode {
  return BLEND_MODES.includes(raw as BlendMode) ? (raw as BlendMode) : "normal";
}

// ── project (de)serialization ──
type SerializedLayer = Record<string, unknown>;

type SerializedProject = {
  version: 2;
  savedAt: number;
  matrix: MatrixSize;
  activeLayerId: string;
  knobs: number[];
  ranges: KnobRange[];
  knobLabels: string[];
  forkOf: ForkRef;
  gen: GenSettings;
  layers: SerializedLayer[];
};

export function serializeProject(project: LabProject): string | null {
  const layers: SerializedLayer[] = project.layers.slice(0, MAX_LAYERS).map((layer) => {
    if (layer.type === "code") {
      return {
        type: "code",
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        blend: layer.blend,
        role: layer.role,
        maskInvert: layer.maskInvert,
        code: layer.code.slice(0, MAX_CODE_CHARS),
        ramp: layer.ramp,
        recolor: layer.recolor,
      };
    }
    return {
      type: "pixel",
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      blend: layer.blend,
      role: layer.role,
      maskInvert: layer.maskInvert,
      width: layer.width,
      height: layer.height,
      px: bytesToBase64(layer.data),
    };
  });

  const payload: SerializedProject = {
    version: 2,
    savedAt: Date.now(),
    matrix: project.matrix,
    activeLayerId: project.activeLayerId,
    knobs: project.knobs,
    ranges: project.ranges,
    knobLabels: project.knobLabels,
    forkOf: project.forkOf,
    gen: project.gen,
    layers,
  };
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

function readGen(raw: unknown): GenSettings {
  const gen = (raw ?? {}) as Record<string, unknown>;
  const count = Number(gen.count);
  const refs = Number(gen.refs);
  return {
    count: Number.isFinite(count) ? Math.max(1, Math.min(20, Math.round(count))) : 5,
    thinking: THINKING_LEVELS.includes(gen.thinking as ThinkingLevelKey)
      ? (gen.thinking as ThinkingLevelKey)
      : "LOW",
    refs: Number.isFinite(refs) ? refs : 6,
    colorMode: COLOR_MODES.includes(gen.colorMode as ColorMode)
      ? (gen.colorMode as ColorMode)
      : "vfield",
  };
}

function readLayer(raw: SerializedLayer): Layer | null {
  const id = typeof raw.id === "string" && raw.id ? raw.id : layerId();
  const name = typeof raw.name === "string" ? raw.name.slice(0, 60) : "Layer";
  const common = {
    id,
    name,
    visible: raw.visible !== false,
    opacity: clamp01(raw.opacity, 1),
    blend: readBlend(raw.blend),
    role: (raw.role === "mask" ? "mask" : "paint") as LayerRole,
    maskInvert: Boolean(raw.maskInvert),
  };

  if (raw.type === "code") {
    const code = typeof raw.code === "string" ? raw.code : null;
    if (code === null || code.length > MAX_CODE_CHARS) return null;
    const layer: CodeLayer = {
      ...common,
      type: "code",
      code,
      ramp: readRamp(raw.ramp),
      recolor: Boolean(raw.recolor),
      knobsAnnotationRaw: matchKnobsAnnotation(code),
      matrixAnnotationRaw: matchMatrixAnnotation(code),
    };
    return layer;
  }

  if (raw.type === "pixel") {
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    const byteLength = width * height * 4;
    if (byteLength <= 0 || byteLength > MAX_PIXEL_BYTES) return null;
    const data =
      typeof raw.px === "string" ? base64ToBytes(raw.px, byteLength) : null;
    if (!data) return null;
    const layer: PixelLayer = {
      ...common,
      type: "pixel",
      width,
      height,
      data,
      rev: 0,
    };
    return layer;
  }

  return null;
}

export function deserializeProject(json: string): (LabProject & { savedAt: number }) | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;
  if (raw.version !== 2 || !Array.isArray(raw.layers)) return null;

  const layers = (raw.layers as SerializedLayer[])
    .slice(0, MAX_LAYERS)
    .map(readLayer)
    .filter((layer): layer is Layer => layer !== null);
  if (layers.length === 0) return null;

  const matrixCandidate = raw.matrix as Partial<MatrixSize> | undefined;
  const matrix = isValidMatrix(matrixCandidate)
    ? { width: Number(matrixCandidate!.width), height: Number(matrixCandidate!.height) }
    : DEFAULT_MATRIX;

  const forkOf =
    raw.forkOf && typeof raw.forkOf === "object"
      ? (() => {
          const entry = raw.forkOf as Record<string, unknown>;
          return typeof entry.id === "string" && typeof entry.title === "string"
            ? {
                id: entry.id,
                title: entry.title.slice(0, 120),
                // Absent on drafts saved before forks tracked the parent's
                // licence; the publish API enforces compatibility regardless.
                license: typeof entry.license === "string" ? entry.license : null,
              }
            : null;
        })()
      : null;

  const activeLayerId =
    typeof raw.activeLayerId === "string" &&
    layers.some((layer) => layer.id === raw.activeLayerId)
      ? raw.activeLayerId
      : layers[0].id;

  // Knobs live at project level. Projects saved by the brief per-layer-knobs
  // build carry them on the first code layer instead — read those as the
  // fallback so nothing resets.
  let knobSource: Record<string, unknown> = raw;
  if (!Array.isArray(raw.knobs)) {
    const legacyCarrier = (raw.layers as SerializedLayer[]).find(
      (entry) => entry.type === "code" && Array.isArray(entry.knobs),
    );
    if (legacyCarrier) knobSource = legacyCarrier;
  }
  const knobState = readKnobs(knobSource);

  return {
    savedAt: Number(raw.savedAt) || 0,
    matrix,
    layers,
    activeLayerId,
    knobs: knobState.knobs,
    ranges: knobState.ranges,
    knobLabels: knobState.labels,
    forkOf,
    gen: readGen(raw.gen),
  };
}

// ── storage IO ──
function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadProject(): (LabProject & { savedAt: number }) | null {
  const raw = readStorage(PROJECT_STORAGE);
  if (!raw) return null;
  return deserializeProject(raw);
}

export function saveProject(project: LabProject): boolean {
  if (typeof window === "undefined") return false;
  const json = serializeProject(project);
  if (!json) return false;
  try {
    window.localStorage.setItem(PROJECT_STORAGE, json);
    return true;
  } catch {
    // Quota / private mode — losing autosave must never break the editor.
    return false;
  }
}

export function clearProject() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROJECT_STORAGE);
  } catch {
    // ignore
  }
}

// ── v1 migration ──
/**
 * Lift the old single-pattern draft into a one-layer project. Returns null
 * when there is nothing to migrate.
 */
export function migrateLegacyDraft(): (LabProject & { savedAt: number }) | null {
  const draft = loadDraft(PATTERN_KNOB_COUNT);
  if (!draft || typeof draft.code !== "string" || draft.code.length === 0) return null;

  const knobState = defaultKnobState();
  const ramp = (() => {
    const raw = readStorage(LEGACY_RAMP_STORAGE);
    if (!raw) return cloneRampState(DEFAULT_RAMP_STATE);
    try {
      return readRamp(JSON.parse(raw));
    } catch {
      return cloneRampState(DEFAULT_RAMP_STATE);
    }
  })();

  const layer: CodeLayer = {
    id: layerId(),
    type: "code",
    name: "Code 1",
    visible: true,
    opacity: 1,
    blend: "normal",
    role: "paint",
    maskInvert: false,
    code: draft.code,
    ramp,
    recolor: Boolean(draft.recolor),
    knobsAnnotationRaw: matchKnobsAnnotation(draft.code),
    matrixAnnotationRaw: matchMatrixAnnotation(draft.code),
  };

  return {
    savedAt: draft.savedAt || Date.now(),
    matrix: draft.matrix ?? DEFAULT_MATRIX,
    layers: [layer],
    activeLayerId: layer.id,
    knobs: draft.knobs ?? knobState.knobs,
    ranges: draft.ranges ?? knobState.ranges,
    knobLabels: draft.knobLabels ?? knobState.labels,
    forkOf: draft.forkOf ?? null,
    gen: readGen(draft.gen),
  };
}
