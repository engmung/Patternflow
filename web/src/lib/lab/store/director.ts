// ── Lab store slice: the Director show that publishes alongside the pattern ──
// One of the slices store.ts composes. Bodies are unchanged from the single
// 800-line store they came out of; only the file boundary is new.

import type { LabStore } from "../store";
import type { SliceSet } from "./kinds";

export type DirectorSlice = Pick<LabStore, "updateDirector">;

export function createDirectorSlice(set: SliceSet): DirectorSlice {
  return {
    updateDirector: (update) => set((state) => ({ director: update(state.director) })),
  };
}
