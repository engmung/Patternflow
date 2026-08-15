// Reading a performance out of whatever file the person has.
//
// The Director saves two halves of the same recording — the JSON it edits and
// the .pfs table it sends to a panel — and people reach for whichever is in
// front of them. Both land here and leave as canonical JSON, which is the one
// shape the API stores: it is the editable form, and the .pfs is regenerated
// from it on download, so nothing is lost by normalising on the way in.

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
