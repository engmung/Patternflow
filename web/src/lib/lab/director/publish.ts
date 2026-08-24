// The current Director show as canonical performance JSON, ready for the
// community's per-pattern performance rail — or null when there is nothing
// valid to attach (empty timeline, over the device budget, or a bake the
// encoder refuses). Callers pass this to PublishModal so a pattern and its
// show publish together in one Share.

import { serializePerformance, validatePerformance } from "@/lib/community/performance";
import { useLabStore } from "../store";
import { bakeShowV2 } from "./bake";
import { showHasContent } from "./types";

export function currentPerformanceJson(): string | null {
  const show = useLabStore.getState().director;
  if (!showHasContent(show)) return null;
  const baked = bakeShowV2(show);
  if (baked.overBudget) return null;
  const json = JSON.stringify(serializePerformance(baked.perf));
  return validatePerformance(json).ok ? json : null;
}
