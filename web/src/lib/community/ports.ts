// Which .h a pattern actually ships — pure resolution, no database access,
// so the page, the header route and the smoke test cannot disagree.
//
// The order:
//   1. the author's own header — their pattern, their port, always wins
//   2. the port the author pinned, if it is still live
//   3. the oldest live port — first come, and being first is not hijackable
//      the way "latest wins" would be
//
// "Live" means not stale: a port is of a SPECIFIC version of the JS, and once
// the source moves the guarantee is gone (same rule that detaches the
// author's own header on edit).

export type PortRow = {
  id: string;
  userId: string;
  codeCpp: string;
  note: string | null;
  stale: boolean;
  createdAt: Date;
  username: string | null;
  displayUsername: string | null;
};

export type EffectiveHeader =
  | { codeCpp: string; source: "author" }
  | { codeCpp: string; source: "port"; portId: string; handle: string | null }
  | null;

export function resolveHeader(
  pattern: { codeCpp: string | null; pinnedHeaderId: string | null },
  /** All of the pattern's ports, ordered oldest first. */
  ports: PortRow[],
): EffectiveHeader {
  if (pattern.codeCpp) return { codeCpp: pattern.codeCpp, source: "author" };

  const live = ports.filter((port) => !port.stale);
  const pinned = pattern.pinnedHeaderId
    ? live.find((port) => port.id === pattern.pinnedHeaderId)
    : undefined;
  const chosen = pinned ?? live[0];
  if (!chosen) return null;

  return {
    codeCpp: chosen.codeCpp,
    source: "port",
    portId: chosen.id,
    handle: chosen.displayUsername ?? chosen.username ?? null,
  };
}
