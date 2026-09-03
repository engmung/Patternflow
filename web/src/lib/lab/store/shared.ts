// ── Lab store: helpers the slices share ──────────────────────────────────────
// Pure functions over project state — building a layer from source, the
// default project, resizing pixel layers to a new matrix — that more than
// one slice needs. No store access here; the slices do that.

import { DEFAULT_MATRIX, matchMatrixAnnotation, parseMatrixAnnotation, type MatrixSize } from "@/lib/pattern/matrix";
import { parseRampAnnotation, stripRampAnnotation } from "@/lib/pattern/ramp";
import { livePresets } from "@/lib/presets";
import { applyKnobEntries, defaultKnobState, matchKnobsAnnotation, parseKnobsAnnotation, type KnobAnnotationEntry } from "../annotations";
import { emptyShow } from "../director/types";
import { resizeSurface } from "../pixelTools";
import { DEFAULT_RAMP_STATE, cloneRampState, layerId, type CodeLayer, type LabProject, type Layer, type PixelLayer, type RampState } from "../types";
const labPresets = livePresets.filter((preset) => preset.labOnly);
export const initialLabPreset = labPresets[0] ?? livePresets[0];

export const STARTER_CODE = `// New layer — draws a scrolling value field, colored by this layer's ramp.
// Replace with your own pattern. Only draw() is required.
export function draw(display, params, time) {
  for (let y = 0; y < display.height; y++) {
    for (let x = 0; x < display.width; x++) {
      const v = (x / display.width + time * 0.12) % 1;
      display.setValue(x, y, v);
    }
  }
}
`;

export const MIN_RANGE_SPAN = 0.001;

/**
 * Build a fresh code layer from source, applying the @ramp annotation to the
 * layer and returning any @knobs state for the caller to merge into the
 * PROJECT-level knobs (knobs are one shared set, unlike per-layer ramps).
 */
export function codeLayerFromSource(
  code: string,
  name: string,
): {
  layer: CodeLayer;
  matrix: MatrixSize | null;
  knobEntries: KnobAnnotationEntry[] | null;
} {
  const rampAnnotation = parseRampAnnotation(code);
  let ramp: RampState = cloneRampState(DEFAULT_RAMP_STATE);
  let recolor = false;
  let cleanCode = code;
  if (rampAnnotation) {
    ramp = {
      stops: rampAnnotation.stops.map((stop) => ({
        position: stop.position,
        color: stop.color,
        alpha: 1,
      })),
      mode: rampAnnotation.mode,
      wrap: rampAnnotation.wrap,
    };
    recolor = rampAnnotation.recolor;
    cleanCode = stripRampAnnotation(code);
  }

  const knobEntries = parseKnobsAnnotation(cleanCode);

  const layer: CodeLayer = {
    id: layerId(),
    type: "code",
    name,
    visible: true,
    opacity: 1,
    blend: "normal",
    role: "paint",
    maskInvert: false,
    code: cleanCode,
    ramp,
    recolor,
    knobsAnnotationRaw: matchKnobsAnnotation(cleanCode),
    matrixAnnotationRaw: matchMatrixAnnotation(cleanCode),
  };
  return { layer, matrix: parseMatrixAnnotation(cleanCode), knobEntries };
}

export function defaultProject(): LabProject {
  const { layer, matrix, knobEntries } = codeLayerFromSource(initialLabPreset.code, "Code 1");
  const base = defaultKnobState();
  const knobState = knobEntries ? applyKnobEntries(knobEntries, base) : base;
  return {
    name: "",
    matrix: matrix ?? DEFAULT_MATRIX,
    layers: [layer],
    activeLayerId: layer.id,
    knobs: knobState.knobs,
    ranges: knobState.ranges,
    knobLabels: knobState.labels,
    forkOf: null,
    editOf: null,
    gen: { count: 5, thinking: "LOW", refs: 6, colorMode: "vfield" },
    director: emptyShow(),
  };
}

export function resizePixelLayers(layers: Layer[], matrix: MatrixSize): Layer[] {
  return layers.map((layer) => {
    if (layer.type !== "pixel") return layer;
    if (layer.width === matrix.width && layer.height === matrix.height) return layer;
    const data = resizeSurface(layer.data, layer.width, layer.height, matrix.width, matrix.height);
    const resized: PixelLayer = {
      ...layer,
      width: matrix.width,
      height: matrix.height,
      data,
      rev: layer.rev + 1,
    };
    return resized;
  });
}


export function updateLayer(layers: Layer[], id: string, patch: (layer: Layer) => Layer): Layer[] {
  return layers.map((layer) => (layer.id === id ? patch(layer) : layer));
}

export function updateCodeLayer(
  layers: Layer[],
  id: string,
  patch: (layer: CodeLayer) => CodeLayer,
): Layer[] {
  return layers.map((layer) => (layer.id === id && layer.type === "code" ? patch(layer) : layer));
}
