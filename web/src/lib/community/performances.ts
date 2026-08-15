// Which performance represents a pattern — pure resolution, no database
// access, the same contract lib/community/ports.ts holds for firmware
// headers, so the page and the routes cannot disagree.
//
// The order:
//   1. the author's own newest recording — their pattern, their ride
//   2. the recording the author pinned (patterns.pinnedPerformanceId)
//   3. the oldest recording — first come, and being first is not hijackable
//      the way "latest wins" would be
//
// Unlike firmware ports there is no `stale`: a performance drives the wire
// values (0..1000), which keep applying cleanly across pattern edits — the
// look may drift with the code, but nothing breaks, and the author can always
// re-pin or re-record.

export type PerformanceRow = {
  id: string;
  userId: string;
  performanceJson: string;
  note: string | null;
  createdAt: Date;
  username: string | null;
  displayUsername: string | null;
};

export type EffectivePerformance = {
  row: PerformanceRow;
  source: "author" | "pinned" | "first";
};

export function resolvePerformance(
  pattern: { userId: string; pinnedPerformanceId: string | null },
  /** All of the pattern's recordings, ordered oldest first. */
  rows: PerformanceRow[],
): EffectivePerformance | null {
  if (rows.length === 0) return null;

  const authorRows = rows.filter((row) => row.userId === pattern.userId);
  if (authorRows.length > 0) {
    return { row: authorRows[authorRows.length - 1], source: "author" };
  }

  const pinned = pattern.pinnedPerformanceId
    ? rows.find((row) => row.id === pattern.pinnedPerformanceId)
    : undefined;
  if (pinned) return { row: pinned, source: "pinned" };

  return { row: rows[0], source: "first" };
}
