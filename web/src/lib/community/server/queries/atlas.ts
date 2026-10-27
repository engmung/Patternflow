// ── Community queries: the atlas — patterns placed on it ──
// One of the files server/queries.ts is assembled from. Until 26 October 2026
// this read sat in queries/workshop.ts; the workshop came down that day and
// the atlas stayed.

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { atlasPins, patterns, user } from "../schema";
import { authorFields } from "./shared";

/**
 * Patterns placed on the atlas (/community/atlas), with enough of the pattern
 * row to render a live tile. Map pins ("pin") are public patterns only — an
 * unlisted work is link-only everywhere else, and a spot on the shared map
 * would un-unlist it. Research rows ("research") may be private: everyone sees
 * the public ones, but a private failure is shown only to its author (or a
 * moderator) — pass the viewer so the filter can tell.
 */
export async function listAtlasPins(viewer?: { id: string; isAdmin: boolean } | null) {
  const rows = await getDb()
    .select({
      patternId: atlasPins.patternId,
      x: atlasPins.x,
      y: atlasPins.y,
      entryId: atlasPins.entryId,
      kind: atlasPins.kind,
      visibility: patterns.visibility,
      title: patterns.title,
      code: patterns.code,
      userId: patterns.userId,
      ...authorFields,
    })
    .from(atlasPins)
    .innerJoin(patterns, eq(atlasPins.patternId, patterns.id))
    .innerJoin(user, eq(patterns.userId, user.id))
    .orderBy(atlasPins.updatedAt);
  return rows.filter((row) => {
    if (row.visibility === "public") return true;
    if (row.kind !== "research") return false; // a map pin never carries a non-public pattern
    return Boolean(viewer && (viewer.isAdmin || viewer.id === row.userId));
  });
}
