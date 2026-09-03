// The set/get a slice creator receives — zustand's, typed against the whole
// store so a slice may read any field and write any field. Slices are a
// file boundary, not an access boundary: the engine and the panels have
// always read the store whole, and a layers action legitimately touches
// knobs (importing a stack brings its knob ranges along).

import type { StoreApi } from "zustand";
import type { LabStore } from "../store";

export type SliceSet = StoreApi<LabStore>["setState"];
export type SliceGet = StoreApi<LabStore>["getState"];
