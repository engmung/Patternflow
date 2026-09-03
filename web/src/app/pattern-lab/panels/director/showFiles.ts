// ── The show as files ────────────────────────────────────────────────────────
// .pfs out (what the panel plays from /shows), .mid out (one CC per lane for
// a DAW), and .pfs / Director JSON in. The pattern's name rides along: a
// blank title falls back to it, so the file downloads as <pattern>.pfs.

import { encodePfst, pfsFilename, serializePerformance, validatePerformance } from "@/lib/pattern/pfst";
import { bakeShowV2, showFromPerformance } from "@/lib/lab/director/bake";
import { midiFilename, showToMidi } from "@/lib/lab/director/exporters/midi";
import type { DirectorShow } from "@/lib/lab/director/types";
import { readPerformanceFile } from "../../community";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const named = (director: DirectorShow, patternName: string) =>
  director.title.trim() ? director : { ...director, title: patternName };

/** Returns an error message, or null when the download started. */
export function exportPfs(director: DirectorShow, patternName: string): string | null {
  const out = bakeShowV2(named(director, patternName), { openingPattern: patternName });
  const check = validatePerformance(JSON.stringify(serializePerformance(out.perf)));
  if (!check.ok) return check.error;
  const bytes = encodePfst(check.perf);
  downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" }), pfsFilename(check.perf));
  return null;
}

export function exportMidi(director: DirectorShow, patternName: string, knobLabels: string[]) {
  const show = named(director, patternName);
  const bytes = showToMidi(show, { labels: knobLabels });
  downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" }), midiFilename(show.title));
}

/**
 * Read a .pfs (or Director JSON) into a show. Resolves to the show, or to an
 * error message; `confirmReplace` is asked only when there is a show to lose.
 */
export async function importShowFile(
  file: File,
  hasContent: boolean,
  confirmReplace: () => boolean,
): Promise<{ ok: true; show: DirectorShow } | { ok: false; error: string } | { ok: false; error: null }> {
  const result = await readPerformanceFile(file);
  if (!result.ok) return { ok: false, error: result.error };
  const check = validatePerformance(result.json);
  if (!check.ok) return { ok: false, error: check.error };
  if (hasContent && !confirmReplace()) return { ok: false, error: null };
  return { ok: true, show: showFromPerformance(check.perf) };
}
