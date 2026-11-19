// ── Lab store slice: the layer stack: add, remove, order, per-layer settings, code edits, pixel buffers, errors ──
// One of the slices store.ts composes. Bodies are unchanged from the single
// 800-line store they came out of; only the file boundary is new.

import { matrixesEqual, matchMatrixAnnotation, parseMatrixAnnotation, type MatrixSize } from "@/lib/pattern/matrix";
import { parseRampAnnotation, stripRampAnnotation } from "@/lib/pattern/ramp";
import { applyKnobEntries, matchKnobsAnnotation, parseKnobsAnnotation, patternNameFromCode } from "../annotations";
import { cloneRampState, createPixelLayer, isCodeLayer, layerId, nextLayerName, type LabProject, type Layer } from "../types";
import type { LabStore } from "../store";
import type { SliceSet, SliceGet } from "./kinds";
import { codeLayerFromSource, resizePixelLayers, updateLayer, updateCodeLayer, STARTER_CODE } from "./shared";

type LayersSlice = Pick<LabStore, "selectLayer" | "addCodeLayer" | "addPixelLayer" | "addCodeLayerFromCode" | "duplicateLayer" | "removeLayer" | "reorderLayer" | "renameLayer" | "setLayerVisible" | "setLayerOpacity" | "setLayerBlend" | "setLayerRole" | "setLayerMaskInvert" | "updateLayerCode" | "applyMatrixLine" | "applyCodeToActive" | "bumpPixelLayer" | "replacePixelData" | "setLayerErrors">;

export function createLayersSlice(set: SliceSet, get: SliceGet): LayersSlice {
  return {
    selectLayer: (id) => {
      if (get().layers.some((layer) => layer.id === id)) set({ activeLayerId: id });
    },

    addCodeLayer: () => {
      const state = get();
      const { layer } = codeLayerFromSource(STARTER_CODE, nextLayerName(state.layers, "Code"));
      // Over another layer the low end starts transparent, as Fade low leaves
      // it, so the pattern beneath shows through the dark half of each band.
      if (state.layers.length > 0) {
        layer.ramp.stops = layer.ramp.stops.map((stop, index) => (index === 0 ? { ...stop, alpha: 0 } : stop));
      }
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
      // An unnamed piece takes the name on the code's `// Pattern:` line. A
      // caller's name (a community title) is a layer name and leaves it alone.
      const lineName = name === undefined && !state.name.trim() ? patternNameFromCode(code) : null;
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
        ...(lineName ? { name: lineName } : {}),
      });
    },

    duplicateLayer: (id) => {
      const state = get();
      const index = state.layers.findIndex((layer) => layer.id === id);
      if (index < 0) return;
      const source = state.layers[index];
      const copyId = layerId();
      const name = `${source.name} copy`.slice(0, 60);
      const copy: Layer =
        source.type === "code"
          ? { ...source, id: copyId, name, ramp: cloneRampState(source.ramp) }
          : source.type === "text"
            ? {
                ...source,
                id: copyId,
                name,
                data: new Uint8ClampedArray(source.data),
                rev: 0,
                spec: { ...source.spec },
                ramp: cloneRampState(source.ramp),
              }
            : { ...source, id: copyId, name, data: new Uint8ClampedArray(source.data), rev: 0 };
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

    updateLayerCode: (id, code, options) => {
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

      // A changed `// Pattern:` line names the piece while it has no name, or
      // while its name is still the one the old line gave. Typing the line out
      // then follows it past the first letter. A name typed into the field stays.
      let namePatch: Partial<LabProject> = {};
      const lineBefore = patternNameFromCode(layer.code);
      const lineAfter = patternNameFromCode(code);
      if (lineAfter && lineAfter !== lineBefore) {
        const current = state.name.trim();
        if (!current || current === lineBefore) namePatch = { name: lineAfter };
      }

      // The editor holds the @matrix line while it has focus (applyMatrixLine
      // takes it from there), so the frame changes once and not at each
      // keystroke on the way from 128x64 to 96x64.
      const hold = options?.holdMatrix === true;
      const matrixRaw = matchMatrixAnnotation(code);
      const matrix = hold ? null : frameFromLine(layer.matrixAnnotationRaw, code, state.matrix);

      let layers = updateCodeLayer(state.layers, id, (entry) => ({
        ...entry,
        code,
        knobsAnnotationRaw: knobsRaw,
        matrixAnnotationRaw: hold ? entry.matrixAnnotationRaw : matrixRaw,
      }));
      if (matrix) layers = resizePixelLayers(layers, matrix);
      set({ layers, ...knobPatch, ...namePatch, ...(matrix ? { matrix } : {}) });
    },

    applyMatrixLine: (id) => {
      const state = get();
      const layer = state.layers.find((entry) => entry.id === id);
      if (!isCodeLayer(layer)) return;
      const matrixRaw = matchMatrixAnnotation(layer.code);
      if (matrixRaw === layer.matrixAnnotationRaw) return;
      const matrix = frameFromLine(layer.matrixAnnotationRaw, layer.code, state.matrix);
      let layers = updateCodeLayer(state.layers, id, (entry) => ({ ...entry, matrixAnnotationRaw: matrixRaw }));
      if (matrix) layers = resizePixelLayers(layers, matrix);
      set({ layers, ...(matrix ? { matrix } : {}) });
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

    setLayerErrors: (errors) => {
      const current = get().layerErrors;
      const keys = Object.keys(errors);
      const same =
        keys.length === Object.keys(current).length &&
        keys.every((key) => current[key] === errors[key]);
      if (!same) set({ layerErrors: errors });
    },
  };
}

/**
 * The frame a changed @matrix line asks for, or null to keep the frame there
 * is. A line the Lab cannot read (1x64, 600x64) or no line at all is not a
 * frame, and the pixel and text layers stay as they are.
 */
function frameFromLine(appliedRaw: string | null, code: string, current: MatrixSize): MatrixSize | null {
  if (matchMatrixAnnotation(code) === appliedRaw) return null;
  const parsed = parseMatrixAnnotation(code);
  return parsed && !matrixesEqual(parsed, current) ? parsed : null;
}
