// ── Lab store ────────────────────────────────────────────────────────────────
// One zustand store holds the whole layered project plus the AI gallery. The
// render engine reads it imperatively each frame (labEngine + getState), while
// panels subscribe to the slices they draw. All updates are immutable EXCEPT
// pixel buffers, which are mutated in place and versioned via `rev`.

import { create } from "zustand";
import {
  DEFAULT_MATRIX,
  matrixesEqual,
  matchMatrixAnnotation,
  parseMatrixAnnotation,
  type MatrixSize,
} from "@/lib/patternMatrix";
import { parseRampAnnotation, stripRampAnnotation } from "@/lib/patternRamp";
import { livePresets } from "@/lib/presets";
import { clearDraft, loadGallery, saveGallery } from "@/lib/labDraft";
import {
  applyKnobEntries,
  defaultKnobState,
  matchKnobsAnnotation,
  parseKnobsAnnotation,
  type KnobAnnotationEntry,
} from "./annotations";
import {
  clearProject,
  deserializeProject,
  loadProject,
  migrateLegacyDraft,
  saveProject,
  serializeProject,
} from "./serialize";
import { readSession, stashSession } from "./sessions";
import { resizeSurface } from "./pixelTools";
import {
  DEFAULT_RAMP_STATE,
  cloneRampState,
  createPixelLayer,
  isCodeLayer,
  layerId,
  nextLayerName,
  type BlendMode,
  type CodeLayer,
  type ForkRef,
  type LayerRole,
  type GalleryItem,
  type GenJob,
  type GenSettings,
  type KnobRange,
  type LabProject,
  type Layer,
  type PixelLayer,
  type RampState,
  type RampStopState,
} from "./types";

const labPresets = livePresets.filter((preset) => preset.labOnly);
const initialLabPreset = labPresets[0] ?? livePresets[0];

const STARTER_CODE = `// New layer — draws a scrolling value field, colored by this layer's ramp.
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

const MIN_RANGE_SPAN = 0.001;

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

function defaultProject(): LabProject {
  const { layer, matrix, knobEntries } = codeLayerFromSource(initialLabPreset.code, "Code 1");
  const base = defaultKnobState();
  const knobState = knobEntries ? applyKnobEntries(knobEntries, base) : base;
  return {
    matrix: matrix ?? DEFAULT_MATRIX,
    layers: [layer],
    activeLayerId: layer.id,
    knobs: knobState.knobs,
    ranges: knobState.ranges,
    knobLabels: knobState.labels,
    forkOf: null,
    gen: { count: 5, thinking: "LOW", refs: 6, colorMode: "vfield" },
  };
}

function resizePixelLayers(layers: Layer[], matrix: MatrixSize): Layer[] {
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

export type LabStore = LabProject & {
  hydrated: boolean;
  /** Non-null when a previous session was restored — drives the header badge. */
  restoredAt: number | null;
  gallery: GalleryItem[];
  jobs: GenJob[];
  layerErrors: Record<string, string | null>;
  /** Selected ramp stop per code layer (UI state, not persisted). */
  rampSelection: Record<string, number>;

  setRampSelection: (layerId: string, index: number) => void;
  hydrate: () => void;
  discardProject: () => void;
  /** Park the current work in the session ring and empty the canvas. */
  stashCurrent: () => boolean;
  /** Swap the canvas for a stashed session, parking what is there now. */
  restoreSession: (id: string) => boolean;

  setMatrix: (matrix: MatrixSize) => void;
  setGen: (patch: Partial<GenSettings>) => void;
  setForkOf: (forkOf: ForkRef) => void;

  selectLayer: (id: string) => void;
  addCodeLayer: () => void;
  addPixelLayer: () => void;
  addCodeLayerFromCode: (code: string, name?: string, forkOf?: ForkRef) => void;
  /** Restore a shared @stack: its layers land ON TOP of the current stack. */
  importStackLayers: (payload: LabProject) => void;
  duplicateLayer: (id: string) => void;
  removeLayer: (id: string) => void;
  reorderLayer: (fromIndex: number, toIndex: number) => void;
  renameLayer: (id: string, name: string) => void;
  setLayerVisible: (id: string, visible: boolean) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerBlend: (id: string, blend: BlendMode) => void;
  setLayerRole: (id: string, role: LayerRole) => void;
  setLayerMaskInvert: (id: string, maskInvert: boolean) => void;

  updateLayerCode: (id: string, code: string) => void;
  applyCodeToActive: (code: string) => void;
  setKnob: (index: number, value: number) => void;
  setRange: (index: number, edge: "min" | "max", value: number) => void;
  setLayerRecolor: (id: string, recolor: boolean) => void;
  setLayerRampMode: (id: string, mode: RampState["mode"]) => void;
  setLayerRampWrap: (id: string, wrap: boolean) => void;
  updateLayerRampStop: (id: string, stopIndex: number, patch: Partial<RampStopState>) => void;
  addLayerRampStop: (id: string, stop: RampStopState) => void;
  deleteLayerRampStop: (id: string, stopIndex: number) => void;
  setLayerRampStops: (id: string, stops: RampStopState[]) => void;

  bumpPixelLayer: (id: string) => void;
  replacePixelData: (id: string, data: Uint8ClampedArray) => void;

  setGallery: (update: (current: GalleryItem[]) => GalleryItem[]) => void;
  setJobs: (update: (current: GenJob[]) => GenJob[]) => void;
  setLayerErrors: (errors: Record<string, string | null>) => void;
};

function updateLayer(layers: Layer[], id: string, patch: (layer: Layer) => Layer): Layer[] {
  return layers.map((layer) => (layer.id === id ? patch(layer) : layer));
}

function updateCodeLayer(
  layers: Layer[],
  id: string,
  patch: (layer: CodeLayer) => CodeLayer,
): Layer[] {
  return layers.map((layer) => (layer.id === id && layer.type === "code" ? patch(layer) : layer));
}

export const useLabStore = create<LabStore>((set, get) => ({
  ...defaultProject(),
  hydrated: false,
  restoredAt: null,
  gallery: [],
  jobs: [],
  layerErrors: {},
  rampSelection: {},

  setRampSelection: (layerId, index) =>
    set((state) => ({ rampSelection: { ...state.rampSelection, [layerId]: index } })),

  hydrate: () => {
    if (get().hydrated) return;
    const restored = loadProject() ?? migrateLegacyDraft();
    if (restored) {
      const { savedAt, ...project } = restored;
      set({
        ...project,
        hydrated: true,
        restoredAt: savedAt || Date.now(),
        gallery: loadGallery(),
      });
      return;
    }
    set({ hydrated: true, gallery: loadGallery() });
  },

  // Used before anything replaces the canvas wholesale, so a community open
  // can never eat work in progress. Returns whether anything was stashed.
  stashCurrent: () => {
    const state = get();
    const json = serializeProject({
      matrix: state.matrix,
      layers: state.layers,
      activeLayerId: state.activeLayerId,
      knobs: state.knobs,
      ranges: state.ranges,
      knobLabels: state.knobLabels,
      forkOf: state.forkOf,
      gen: state.gen,
    });
    if (!json) return false;
    const title = state.forkOf?.title ?? state.layers[0]?.name ?? "Untitled work";
    const stashed = stashSession(json, title, state.layers.length);
    if (stashed) {
      clearProject();
      set({ ...defaultProject(), restoredAt: null, layers: [], activeLayerId: "" });
    }
    return stashed;
  },

  restoreSession: (id) => {
    const json = readSession(id);
    if (!json) return false;
    const restored = deserializeProject(json);
    if (!restored) return false;
    get().stashCurrent();
    const { savedAt, ...project } = restored;
    set({ ...project, restoredAt: savedAt || Date.now() });
    return true;
  },

  discardProject: () => {
    clearProject();
    clearDraft(); // also clears the legacy draft + gallery keys
    set({
      ...defaultProject(),
      restoredAt: null,
      gallery: [],
      jobs: [],
      layerErrors: {},
    });
  },

  setMatrix: (matrix) => {
    const state = get();
    if (matrixesEqual(state.matrix, matrix)) return;
    set({ matrix, layers: resizePixelLayers(state.layers, matrix) });
  },

  setGen: (patch) => set((state) => ({ gen: { ...state.gen, ...patch } })),
  setForkOf: (forkOf) => set({ forkOf }),

  selectLayer: (id) => {
    if (get().layers.some((layer) => layer.id === id)) set({ activeLayerId: id });
  },

  addCodeLayer: () => {
    const state = get();
    const { layer } = codeLayerFromSource(STARTER_CODE, nextLayerName(state.layers, "Code"));
    set({ layers: [layer, ...state.layers], activeLayerId: layer.id });
  },

  addPixelLayer: () => {
    const state = get();
    const layer = createPixelLayer(state.matrix, nextLayerName(state.layers, "Pixel"));
    set({ layers: [layer, ...state.layers], activeLayerId: layer.id });
  },

  addCodeLayerFromCode: (code, name, forkOf) => {
    const state = get();
    const { layer, matrix, knobEntries } = codeLayerFromSource(
      code,
      name ?? nextLayerName(state.layers, "Code"),
    );
    const nextMatrix = matrix && !matrixesEqual(matrix, state.matrix) ? matrix : state.matrix;
    let layers: Layer[] = [layer, ...state.layers];
    if (nextMatrix !== state.matrix) layers = resizePixelLayers(layers, nextMatrix);
    const knobState = knobEntries
      ? applyKnobEntries(knobEntries, {
          knobs: state.knobs,
          ranges: state.ranges,
          labels: state.knobLabels,
        })
      : null;
    set({
      layers,
      activeLayerId: layer.id,
      matrix: nextMatrix,
      ...(knobState
        ? { knobs: knobState.knobs, ranges: knobState.ranges, knobLabels: knobState.labels }
        : {}),
      ...(forkOf !== undefined ? { forkOf } : {}),
    });
  },

  importStackLayers: (payload) => {
    const state = get();
    // Fresh ids: the same composition can be imported twice, and imported ids
    // must never collide with the current stack's. Masks bind by ORDER (the
    // layer below), so the block keeps working as long as it stays contiguous.
    const imported: Layer[] = payload.layers.map((layer) =>
      layer.type === "pixel"
        ? { ...layer, id: layerId(), data: new Uint8ClampedArray(layer.data), rev: 0 }
        : { ...layer, id: layerId(), ramp: cloneRampState(layer.ramp) },
    );
    if (imported.length === 0) return;

    // The composition's frame wins — that is what "opening it" means. The
    // existing stack's pixel layers resize to match (centered).
    const matrix = payload.matrix;
    let layers: Layer[] = [...imported, ...state.layers];
    if (!matrixesEqual(matrix, state.matrix)) layers = resizePixelLayers(layers, matrix);

    set({
      layers,
      matrix,
      activeLayerId: imported[0].id,
      knobs: payload.knobs,
      ranges: payload.ranges,
      knobLabels: payload.knobLabels,
    });
  },

  duplicateLayer: (id) => {
    const state = get();
    const index = state.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    const source = state.layers[index];
    const copy: Layer =
      source.type === "code"
        ? {
            ...source,
            id: layerId(),
            name: `${source.name} copy`.slice(0, 60),
            ramp: cloneRampState(source.ramp),
          }
        : {
            ...source,
            id: layerId(),
            name: `${source.name} copy`.slice(0, 60),
            data: new Uint8ClampedArray(source.data),
            rev: 0,
          };
    const layers = [...state.layers];
    layers.splice(index, 0, copy);
    set({ layers, activeLayerId: copy.id });
  },

  removeLayer: (id) => {
    const state = get();
    if (state.layers.length <= 1) return;
    const index = state.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    const layers = state.layers.filter((layer) => layer.id !== id);
    const nextActive =
      state.activeLayerId === id
        ? (layers[Math.min(index, layers.length - 1)]?.id ?? layers[0].id)
        : state.activeLayerId;
    set({ layers, activeLayerId: nextActive });
  },

  reorderLayer: (fromIndex, toIndex) => {
    const state = get();
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= state.layers.length ||
      toIndex >= state.layers.length
    ) {
      return;
    }
    const layers = [...state.layers];
    const [moved] = layers.splice(fromIndex, 1);
    layers.splice(toIndex, 0, moved);
    set({ layers });
  },

  renameLayer: (id, name) => {
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) return;
    set((state) => ({ layers: updateLayer(state.layers, id, (layer) => ({ ...layer, name: trimmed })) }));
  },

  setLayerVisible: (id, visible) =>
    set((state) => ({ layers: updateLayer(state.layers, id, (layer) => ({ ...layer, visible })) })),

  setLayerOpacity: (id, opacity) =>
    set((state) => ({
      layers: updateLayer(state.layers, id, (layer) => ({
        ...layer,
        opacity: Math.max(0, Math.min(1, opacity)),
      })),
    })),

  setLayerBlend: (id, blend) =>
    set((state) => ({ layers: updateLayer(state.layers, id, (layer) => ({ ...layer, blend })) })),

  setLayerRole: (id, role) =>
    set((state) => ({ layers: updateLayer(state.layers, id, (layer) => ({ ...layer, role })) })),

  setLayerMaskInvert: (id, maskInvert) =>
    set((state) => ({
      layers: updateLayer(state.layers, id, (layer) => ({ ...layer, maskInvert })),
    })),

  updateLayerCode: (id, code) => {
    const state = get();
    const layer = state.layers.find((entry) => entry.id === id);
    if (!isCodeLayer(layer)) return;

    // A changed @knobs line applies to the SHARED knob set (last writer
    // wins) — the same way loading a new pattern retuned the old lab.
    let knobPatch: Partial<LabProject> = {};
    const knobsRaw = matchKnobsAnnotation(code);
    if (knobsRaw !== layer.knobsAnnotationRaw) {
      const entries = knobsRaw ? parseKnobsAnnotation(code) : null;
      if (entries) {
        const applied = applyKnobEntries(entries, {
          knobs: state.knobs,
          ranges: state.ranges,
          labels: state.knobLabels,
        });
        knobPatch = {
          knobs: applied.knobs,
          ranges: applied.ranges,
          knobLabels: applied.labels,
        };
      }
    }

    let matrixPatch: { matrix: MatrixSize } | null = null;
    const matrixRaw = matchMatrixAnnotation(code);
    if (matrixRaw !== layer.matrixAnnotationRaw) {
      const parsed = parseMatrixAnnotation(code) ?? DEFAULT_MATRIX;
      if (!matrixesEqual(parsed, state.matrix)) matrixPatch = { matrix: parsed };
    }

    let layers = updateCodeLayer(state.layers, id, (entry) => ({
      ...entry,
      code,
      knobsAnnotationRaw: knobsRaw,
      matrixAnnotationRaw: matrixRaw,
    }));
    if (matrixPatch) layers = resizePixelLayers(layers, matrixPatch.matrix);
    set({ layers, ...knobPatch, ...(matrixPatch ?? {}) });
  },

  applyCodeToActive: (code) => {
    const state = get();
    const active = state.layers.find((layer) => layer.id === state.activeLayerId);
    if (isCodeLayer(active)) {
      // A gallery/preset load may carry a ramp annotation — route it into the
      // layer's ramp (chained), keeping the editor clean.
      const rampAnnotation = parseRampAnnotation(code);
      if (rampAnnotation) {
        get().setLayerRampStops(
          active.id,
          rampAnnotation.stops.map((stop) => ({
            position: stop.position,
            color: stop.color,
            alpha: 1,
          })),
        );
        get().setLayerRampMode(active.id, rampAnnotation.mode);
        get().setLayerRampWrap(active.id, rampAnnotation.wrap);
        get().setLayerRecolor(active.id, rampAnnotation.recolor);
        get().updateLayerCode(active.id, stripRampAnnotation(code));
      } else {
        get().updateLayerCode(active.id, code);
      }
      return;
    }
    get().addCodeLayerFromCode(code);
  },

  setKnob: (index, value) =>
    set((state) => ({
      knobs: state.knobs.map((knob, knobIndex) => (knobIndex === index ? value : knob)),
    })),

  setRange: (index, edge, value) => {
    if (!Number.isFinite(value)) return;
    set((state) => {
      const range = state.ranges[index] ?? [0, 1];
      const next: KnobRange = [...range];
      if (edge === "min") {
        next[0] = value;
        if (next[1] <= next[0]) next[1] = next[0] + MIN_RANGE_SPAN;
      } else {
        next[1] = value;
        if (next[0] >= next[1]) next[0] = next[1] - MIN_RANGE_SPAN;
      }
      // Keep the knob at the same normalized position within the new range.
      const previousSpan = Math.max(MIN_RANGE_SPAN, range[1] - range[0]);
      const normalized = ((state.knobs[index] ?? range[0]) - range[0]) / previousSpan;
      const nextValue = next[0] + Math.max(0, Math.min(1, normalized)) * (next[1] - next[0]);
      return {
        ranges: state.ranges.map((entry, entryIndex) => (entryIndex === index ? next : entry)),
        knobs: state.knobs.map((knob, knobIndex) => (knobIndex === index ? nextValue : knob)),
      };
    });
  },

  setLayerRecolor: (id, recolor) =>
    set((state) => ({
      layers: updateCodeLayer(state.layers, id, (layer) => ({ ...layer, recolor })),
    })),

  setLayerRampMode: (id, mode) =>
    set((state) => ({
      layers: updateCodeLayer(state.layers, id, (layer) => ({
        ...layer,
        ramp: { ...layer.ramp, mode },
      })),
    })),

  setLayerRampWrap: (id, wrap) =>
    set((state) => ({
      layers: updateCodeLayer(state.layers, id, (layer) => ({
        ...layer,
        ramp: { ...layer.ramp, wrap },
      })),
    })),

  updateLayerRampStop: (id, stopIndex, patch) =>
    set((state) => ({
      layers: updateCodeLayer(state.layers, id, (layer) => ({
        ...layer,
        ramp: {
          ...layer.ramp,
          stops: layer.ramp.stops.map((stop, index) =>
            index === stopIndex ? { ...stop, ...patch } : stop,
          ),
        },
      })),
    })),

  addLayerRampStop: (id, stop) =>
    set((state) => ({
      layers: updateCodeLayer(state.layers, id, (layer) =>
        layer.ramp.stops.length >= 64
          ? layer
          : { ...layer, ramp: { ...layer.ramp, stops: [...layer.ramp.stops, stop] } },
      ),
    })),

  deleteLayerRampStop: (id, stopIndex) =>
    set((state) => ({
      layers: updateCodeLayer(state.layers, id, (layer) =>
        layer.ramp.stops.length <= 1
          ? layer
          : {
              ...layer,
              ramp: {
                ...layer.ramp,
                stops: layer.ramp.stops.filter((_, index) => index !== stopIndex),
              },
            },
      ),
    })),

  setLayerRampStops: (id, stops) =>
    set((state) => ({
      layers: updateCodeLayer(state.layers, id, (layer) => ({
        ...layer,
        ramp: { ...layer.ramp, stops: stops.slice(0, 64) },
      })),
    })),

  bumpPixelLayer: (id) =>
    set((state) => ({
      layers: updateLayer(state.layers, id, (layer) =>
        layer.type === "pixel" ? { ...layer, rev: layer.rev + 1 } : layer,
      ),
    })),

  replacePixelData: (id, data) =>
    set((state) => ({
      layers: updateLayer(state.layers, id, (layer) =>
        layer.type === "pixel" && data.length === layer.width * layer.height * 4
          ? { ...layer, data, rev: layer.rev + 1 }
          : layer,
      ),
    })),

  setGallery: (update) => set((state) => ({ gallery: update(state.gallery) })),
  setJobs: (update) => set((state) => ({ jobs: update(state.jobs) })),

  setLayerErrors: (errors) => {
    const current = get().layerErrors;
    const keys = Object.keys(errors);
    const same =
      keys.length === Object.keys(current).length &&
      keys.every((key) => current[key] === errors[key]);
    if (!same) set({ layerErrors: errors });
  },
}));

// ── persistence ──
// Debounced project autosave + gallery persist, gated until hydration so the
// pre-restore default state can never overwrite a stored project.
let saveTimer: ReturnType<typeof setTimeout> | null = null;

if (typeof window !== "undefined") {
  useLabStore.subscribe((state, previous) => {
    if (!state.hydrated) return;

    if (state.gallery !== previous.gallery) {
      saveGallery(state.gallery);
    }

    const projectChanged =
      state.matrix !== previous.matrix ||
      state.layers !== previous.layers ||
      state.activeLayerId !== previous.activeLayerId ||
      state.knobs !== previous.knobs ||
      state.ranges !== previous.ranges ||
      state.knobLabels !== previous.knobLabels ||
      state.forkOf !== previous.forkOf ||
      state.gen !== previous.gen;
    if (!projectChanged) return;

    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const current = useLabStore.getState();
      saveProject({
        matrix: current.matrix,
        layers: current.layers,
        activeLayerId: current.activeLayerId,
        knobs: current.knobs,
        ranges: current.ranges,
        knobLabels: current.knobLabels,
        forkOf: current.forkOf,
        gen: current.gen,
      });
    }, 600);
  });
}

// ── selectors ──
export function useActiveLayer(): Layer | undefined {
  return useLabStore((state) => state.layers.find((layer) => layer.id === state.activeLayerId));
}

export function useActiveCodeLayer(): CodeLayer | undefined {
  const layer = useActiveLayer();
  return isCodeLayer(layer) ? layer : undefined;
}

/**
 * The code layer whose knobs/ramp the side panels should edit: the active
 * layer when it is code, otherwise the topmost code layer.
 */
export function useFocusCodeLayer(): CodeLayer | undefined {
  return useLabStore((state) => {
    const active = state.layers.find((layer) => layer.id === state.activeLayerId);
    if (isCodeLayer(active)) return active;
    return state.layers.find(isCodeLayer);
  });
}
