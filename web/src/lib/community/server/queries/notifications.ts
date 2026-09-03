// ── Community queries: notifications — counts, the list, marking read ──
// One of the files server/queries.ts is assembled from (2026-09). Bodies are
// unchanged from the single 1,364-line file they came out of.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { decks, notifications, patterns, posts, user } from "../schema";

// ── Notifications ────────────────────────────────────────────────────────────

/** The header badge. Read on every page load, so it stays one indexed COUNT. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows[0]?.count ?? 0;
}

export type NotificationRow = {
  id: string;
  type: string;
  targetType: string;
  targetId: string;
  targetTitle: string;
  snippet: string | null;
  readAt: Date | null;
  createdAt: Date;
  actorUsername: string | null;
  actorDisplayUsername: string | null;
  /** Source of the pattern this alert is about, for the row's mini canvas.
   *  Null when the target is a deck or a post. */
  patternCode: string | null;
};

/**
 * The recipient's notifications, newest first. Rows whose target has since
 * gone private (and is not the recipient's own) are dropped at read time —
 * the link would 404. Deleted targets are cleared by the delete routes; the
 * join guard here is the belt to those braces, so the count and the list can
 * disagree briefly. Opening the page marks everything read, which settles it.
 */
export async function listNotifications(
  userId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  const rows = await getDb()
    .select({
      id: notifications.id,
      type: notifications.type,
      targetType: notifications.targetType,
      targetId: notifications.targetId,
      targetTitle: notifications.targetTitle,
      snippet: notifications.snippet,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorUsername: user.username,
      actorDisplayUsername: user.displayUsername,
      patternVisibility: patterns.visibility,
      patternUserId: patterns.userId,
      // The row draws the pattern it is about, so it needs the source. Null
      // for deck and post alerts, which have no canvas to show.
      patternCode: patterns.code,
      deckVisibility: decks.visibility,
      deckUserId: decks.userId,
      postId: posts.id,
    })
    .from(notifications)
    .innerJoin(user, eq(notifications.actorId, user.id))
    .leftJoin(
      patterns,
      and(eq(notifications.targetType, "pattern"), eq(notifications.targetId, patterns.id)),
    )
    .leftJoin(
      decks,
      and(eq(notifications.targetType, "deck"), eq(notifications.targetId, decks.id)),
    )
    .leftJoin(
      posts,
      and(eq(notifications.targetType, "post"), eq(notifications.targetId, posts.id)),
    )
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows
    .filter((row) => {
      if (row.targetType === "pattern") {
        if (!row.patternUserId) return false;
        return row.patternVisibility !== "private" || row.patternUserId === userId;
      }
      if (row.targetType === "deck") {
        if (!row.deckUserId) return false;
        return row.deckVisibility !== "private" || row.deckUserId === userId;
      }
      if (row.targetType === "post") return Boolean(row.postId);
      return true;
    })
    .map((row) => ({
      id: row.id,
      type: row.type,
      targetType: row.targetType,
      targetId: row.targetId,
      targetTitle: row.targetTitle,
      snippet: row.snippet,
      readAt: row.readAt,
      createdAt: row.createdAt,
      actorUsername: row.actorUsername,
      actorDisplayUsername: row.actorDisplayUsername,
      patternCode: row.patternCode,
    }));
}

/** Opening the notifications page reads everything — there is no per-row
 *  unread state to manage at this scale. */
export async function markNotificationsRead(userId: string): Promise<void> {
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
