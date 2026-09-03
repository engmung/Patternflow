// The current Director show as canonical performance JSON, ready for the
// community's per-pattern performance rail — or null when there is nothing
// valid to attach (empty timeline, over the device budget, or a bake the
// encoder refuses). Callers pass this to PublishModal so a pattern and its
// show publish together in one Share.

import { serializePerformance, validatePerformance } from "@/lib/pattern/pfst";
import { labPatternName, useLabStore } from "../store";
import { bakeShowV2 } from "./bake";
import { showHasContent } from "./types";

export function currentPerformanceJson(): string | null {
  const state = useLabStore.getState();
  const show = state.director;
  if (!showHasContent(show)) return null;
  // Same identity rule as the panel's .pfs export: blank title falls back to
  // the pattern name, and the opening cue carries that name so the show finds
  // its pattern on a device.
  const name = labPatternName(state);
  const named = show.title.trim() ? show : { ...show, title: name };
  const baked = bakeShowV2(named, { openingPattern: name });
  if (baked.overBudget) return null;
  const json = JSON.stringify(serializePerformance(baked.perf));
  return validatePerformance(json).ok ? json : null;
}
