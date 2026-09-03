// ── Lab store slice: the AI gallery and its generation queue ──
// One of the slices store.ts composes. Bodies are unchanged from the single
// 800-line store they came out of; only the file boundary is new.

import type { LabStore } from "../store";
import type { SliceSet } from "./kinds";

export type GallerySlice = Pick<LabStore, "setGallery" | "setJobs">;

export function createGallerySlice(set: SliceSet): GallerySlice {
  return {
    setGallery: (update) => set((state) => ({ gallery: update(state.gallery) })),
    setJobs: (update) => set((state) => ({ jobs: update(state.jobs) })),
  };
}
