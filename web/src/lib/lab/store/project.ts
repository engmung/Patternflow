// ── Lab store slice: the whole project: hydration, the session ring, matrix, generation settings, lineage, name ──
// One of the slices store.ts composes. Bodies are unchanged from the single
// 800-line store they came out of; only the file boundary is new.

import { matrixesEqual } from "@/lib/pattern/matrix";
import { clearDraft, loadGallery } from "@/lib/lab/legacyDraft";
import { clearProject, deserializeProject, loadProject, migrateLegacyDraft, serializeProject } from "../serialize";
import { readSession, stashSession } from "../sessions";
import { cloneRampState, layerId, type Layer } from "../types";
import type { LabStore } from "../store";
import type { SliceSet, SliceGet } from "./kinds";
import { defaultProject, resizePixelLayers } from "./shared";

export type ProjectSlice = Pick<LabStore, "hydrate" | "discardProject" | "stashCurrent" | "parkSnapshot" | "restoreSession" | "setMatrix" | "setGen" | "setForkOf" | "setEditOf" | "setName" | "importStackLayers">;

export function createProjectSlice(set: SliceSet, get: SliceGet): ProjectSlice {
  return {
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

    stashCurrent: () => {
      const state = get();
      const json = serializeProject({
        name: state.name,
        matrix: state.matrix,
        layers: state.layers,
        activeLayerId: state.activeLayerId,
        knobs: state.knobs,
        ranges: state.ranges,
        knobLabels: state.knobLabels,
        forkOf: state.forkOf,
        editOf: state.editOf,
        gen: state.gen,
        director: state.director,
      });
      if (!json) return false;
      const title =
        state.name.trim() ||
        (state.editOf?.title ?? state.forkOf?.title ?? state.layers[0]?.name ?? "Untitled work");
      const stashed = stashSession(json, title, state.layers.length);
      if (stashed) {
        clearProject();
        set({ ...defaultProject(), restoredAt: null, layers: [], activeLayerId: "" });
      }
      return stashed;
    },

    // Park a copy WITHOUT clearing the canvas — the difference from
    // stashCurrent, and the whole point: revising a published pattern overwrites
    // the only published copy, so the version you started from goes into the
    // ring the moment it lands and Recent ▾ can hand it back.
    parkSnapshot: (title) => {
      const state = get();
      const json = serializeProject({
        name: state.name,
        matrix: state.matrix,
        layers: state.layers,
        activeLayerId: state.activeLayerId,
        knobs: state.knobs,
        ranges: state.ranges,
        knobLabels: state.knobLabels,
        forkOf: state.forkOf,
        editOf: state.editOf,
        gen: state.gen,
        director: state.director,
      });
      if (!json) return false;
      return stashSession(
        json,
        title ??
          (state.name.trim() ||
            (state.editOf?.title ?? state.forkOf?.title ?? state.layers[0]?.name ?? "Untitled work")),
        state.layers.length,
      );
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

    setMatrix: (matrix) => {
      const state = get();
      if (matrixesEqual(state.matrix, matrix)) return;
      set({ matrix, layers: resizePixelLayers(state.layers, matrix) });
    },

    setGen: (patch) => set((state) => ({ gen: { ...state.gen, ...patch } })),
    // Fork and edit are opposite ends of the same handoff, so setting one
    // clears the other: a project cannot both become a new pattern and update
    // an existing one.
    setForkOf: (forkOf) => set(forkOf ? { forkOf, editOf: null } : { forkOf }),
    setEditOf: (editOf) => set(editOf ? { editOf, forkOf: null } : { editOf }),

    setName: (name) => set({ name: name.slice(0, 60) }),

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
        // An imported composition brings its name along — but never erases a
        // name the current canvas already has.
        ...(payload.name && !state.name ? { name: payload.name } : {}),
      });
    },
  };
}
