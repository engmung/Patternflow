// ── Community queries: notifications — counts, the list, marking read ──
// One of the files server/queries.ts is assembled from (2026-09). Bodies are
// unchanged from the single 1,364-line file they came out of.

import { and, desc, eq, isNotNull, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { getDb } from "../db";
import { decks, notifications, patterns, user } from "../schema";

// ── Notifications ────────────────────────────────────────────────────────────

// The badge and the list read the same rows. Until 26 October 2026 the badge
// was a bare COUNT and the list dropped rows after reading them, so bea saw
// "Alerts 1" over an empty page once the pattern she had commented on went
// private, and "Alerts 2" with a workshop alert left over. Both now join and
// filter the same way, and the filter lives here, once.
const PATTERN_TARGET = and(
  eq(notifications.targetType, "pattern"),
  eq(notifications.targetId, patterns.id),
);
const DECK_TARGET = and(eq(notifications.targetType, "deck"), eq(notifications.targetId, decks.id));

/**
 * Which of the recipient's rows they get to see. A row whose target has gone
 * private (and is not the recipient's own) is dropped — the link would 404.
 * Deleted targets are cleared by the delete routes; the join is the belt to
 * those braces. A workshop thread is dropped too: the workshop came down on
 * 26 October 2026 and its alerts stay in the table, with nowhere left to
 * link to.
 *
 * A moderator keeps theirs: every private page opens for them, and the row
 * they need most is the author answering the reason they left under a
 * pattern they took down.
 */
function shownTo(userId: string, moderator: boolean) {
  const open = (visibility: SQLiteColumn, owner: SQLiteColumn) =>
    moderator
      ? isNotNull(owner)
      : and(isNotNull(owner), or(ne(visibility, "private"), eq(owner, userId)));
  return and(
    eq(notifications.userId, userId),
    or(
      and(eq(notifications.targetType, "pattern"), open(patterns.visibility, patterns.userId)),
      and(eq(notifications.targetType, "deck"), open(decks.visibility, decks.userId)),
      notInArray(notifications.targetType, ["pattern", "deck", "post"]),
    ),
  );
}

/** The header badge: the unread rows the list would show. Read on every
 *  page load; the joins are primary-key lookups. */
export async function countUnreadNotifications(
  userId: string,
  { moderator = false }: { moderator?: boolean } = {},
): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .innerJoin(user, eq(notifications.actorId, user.id))
    .leftJoin(patterns, PATTERN_TARGET)
    .leftJoin(decks, DECK_TARGET)
    .where(and(shownTo(userId, moderator), isNull(notifications.readAt)));
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
   *  Null when the target is a deck. */
  patternCode: string | null;
};

/** The recipient's notifications, newest first, as many as `limit`. Opening
 *  the page marks everything read. */
export async function listNotifications(
  userId: string,
  { limit = 50, moderator = false }: { limit?: number; moderator?: boolean } = {},
): Promise<NotificationRow[]> {
  return getDb()
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
      // The row draws the pattern it is about, so it needs the source. Null
      // for deck alerts, which have no canvas to show.
      patternCode: patterns.code,
    })
    .from(notifications)
    .innerJoin(user, eq(notifications.actorId, user.id))
    .leftJoin(patterns, PATTERN_TARGET)
    .leftJoin(decks, DECK_TARGET)
    .where(shownTo(userId, moderator))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** Opening the notifications page reads everything — there is no per-row
 *  unread state to manage at this scale. */
export async function markNotificationsRead(userId: string): Promise<void> {
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
