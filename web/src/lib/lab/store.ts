// ── Lab store ────────────────────────────────────────────────────────────────
// One zustand store holds the whole layered project plus the AI gallery. The
// render engine reads it imperatively each frame (labEngine + getState), while
// panels subscribe to the slices they draw. All updates are immutable EXCEPT
// pixel buffers, which are mutated in place and versioned via `rev`.
//
// The actions live in ./store/<slice>.ts, one file per concern, composed here;
// ./store/shared.ts holds the helpers they share. The store's shape (LabStore),
// its persistence subscription and the selectors stay in this file.

import { create } from "zustand";
import type { MatrixSize } from "@/lib/pattern/matrix";
import { saveGallery } from "@/lib/lab/legacyDraft";
import { saveProject } from "./serialize";
import type { DirectorShow } from "./director/types";
import { isCodeLayer, type BlendMode, type CodeLayer, type EditRef, type ForkRef, type LayerRole, type GalleryItem, type GenJob, type GenSettings, type LabProject, type Layer, type RampState, type RampStopState } from "./types";
import { defaultProject } from "./store/shared";
import { createProjectSlice } from "./store/project";
import { createLayersSlice } from "./store/layers";
import { createKnobsSlice } from "./store/knobs";
import { createRampSlice } from "./store/ramp";
import { createDirectorSlice } from "./store/director";
import { createGallerySlice } from "./store/gallery";

export { codeLayerFromSource } from "./store/shared";

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
  /** Park a COPY and keep working — used when the canvas is about to become
   *  the only copy of something, e.g. revising a published pattern. */
  parkSnapshot: (title?: string) => boolean;
  /** Swap the canvas for a stashed session, parking what is there now. */
  restoreSession: (id: string) => boolean;

  setMatrix: (matrix: MatrixSize) => void;
  setGen: (patch: Partial<GenSettings>) => void;
  setForkOf: (forkOf: ForkRef) => void;
  setEditOf: (editOf: EditRef) => void;

  selectLayer: (id: string) => void;
  addCodeLayer: () => void;
  addPixelLayer: () => void;
  addCodeLayerFromCode: (code: string, name?: string, forkOf?: ForkRef) => void;
  /** Restore a shared @stack: its layers land ON TOP of the current stack. */
  /** Rename the piece — the identity every hand-off shares (see LabProject.name). */
  setName: (name: string) => void;
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
  /** Immutable edit of the Director show (timeline authoring). */
  updateDirector: (update: (show: DirectorShow) => DirectorShow) => void;
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

export const useLabStore = create<LabStore>((set, get) => ({
  ...defaultProject(),
  hydrated: false,
  restoredAt: null,
  gallery: [],
  jobs: [],
  layerErrors: {},
  rampSelection: {},

  ...createProjectSlice(set, get),
  ...createLayersSlice(set, get),
  ...createKnobsSlice(set),
  ...createRampSlice(set),
  ...createDirectorSlice(set),
  ...createGallerySlice(set),
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
      state.name !== previous.name ||
      state.matrix !== previous.matrix ||
      state.layers !== previous.layers ||
      state.activeLayerId !== previous.activeLayerId ||
      state.knobs !== previous.knobs ||
      state.ranges !== previous.ranges ||
      state.knobLabels !== previous.knobLabels ||
      state.forkOf !== previous.forkOf ||
      state.editOf !== previous.editOf ||
      state.gen !== previous.gen ||
      state.director !== previous.director;
    if (!projectChanged) return;

    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const current = useLabStore.getState();
      saveProject({
        name: current.name,
        matrix: current.matrix,
        layers: current.layers,
        activeLayerId: current.activeLayerId,
        knobs: current.knobs,
        ranges: current.ranges,
        knobLabels: current.knobLabels,
        forkOf: current.forkOf,
        editOf: current.editOf,
        gen: current.gen,
        director: current.director,
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

/**
 * THE name of what is being built — the one identity every hand-off shares.
 * The hardware export seeds its NAME from this, the module build slugs the
 * .pfm from that NAME, and the Director stamps the same name into the show's
 * opening pattern cue and its .pfs filename — so a show finds its pattern on
 * the device without anyone retyping anything. The project's own name (the
 * header input) wins; unnamed projects fall back to the focus code layer,
 * then any layer — layer names are parts, but they beat "pattern".
 */
export function labPatternName(
  state: Pick<LabStore, "name" | "layers" | "activeLayerId">,
): string {
  const project = state.name.trim();
  if (project) return project;
  const active = state.layers.find((layer) => layer.id === state.activeLayerId);
  const layer = isCodeLayer(active) ? active : (state.layers.find(isCodeLayer) ?? state.layers[0]);
  const name = layer?.name.trim() ?? "";
  return name || "pattern";
}
