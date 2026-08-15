// Reading a performance out of whatever file the person has.
//
// The Director saves `.pfs`, so that is what people have; `.json` still loads
// because Directors from before the format settled saved that instead. Either
// leaves here as the canonical JSON the API stores, and the table is
// regenerated from it on the way out — nothing is lost by normalising on the
// way in, since the table carries everything a recording is.

import { decodePfst, normalizePerformance, serializePerformance } from "./performance";

/** Canonical JSON text for a picked file, or the reason it cannot be read. */
export async function readPerformanceFile(
  file: File,
): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
  const looksPacked =
    /\.pfs$/i.test(file.name) || file.type === "application/octet-stream";

  if (looksPacked) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const perf = decodePfst(bytes);
      return { ok: true, json: JSON.stringify(serializePerformance(perf), null, 2) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not read that .pfs table.",
      };
    }
  }

  try {
    const text = await file.text();
    // Parse and re-serialize so a hand-edited file arrives in the same shape a
    // .pfs does, and a malformed one is caught here rather than on submit.
    const perf = normalizePerformance(JSON.parse(text));
    return { ok: true, json: JSON.stringify(serializePerformance(perf), null, 2) };
  } catch {
    return { ok: false, error: "That file is neither valid JSON nor a .pfs table." };
  }
}
