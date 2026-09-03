// ── Community queries: moderation — reports and the stubs they point at ──
// One of the files server/queries.ts is assembled from (2026-09). Bodies are
// unchanged from the single 1,364-line file they came out of.

import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { comments, decks, patterns, postComments, posts, reports, user } from "../schema";

// ── Reports ──────────────────────────────────────────────────────────────────

export type ReportRow = {
  id: string;
  targetType: string;
  targetId: string;
  targetTitle: string | null;
  targetUserId: string | null;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: Date;
  reporterName: string | null;
  /** How many times this author has been reported, across all their content. */
  priorReports: number;
};

/**
 * Reports for the moderation queue, newest first. `priorReports` is the reason
 * the table exists at all — one complaint is noise, the same account appearing
 * repeatedly is a pattern, and that is only visible if the count survives the
 * removal of whatever was reported.
 */
export async function listReports(status: "open" | "all" = "open"): Promise<ReportRow[]> {
  const priorReports = sql<number>`(
    SELECT COUNT(*) FROM ${reports} AS prior
    WHERE prior.target_user_id = ${reports.targetUserId}
  )`;

  return getDb()
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      targetTitle: reports.targetTitle,
      targetUserId: reports.targetUserId,
      reason: reports.reason,
      detail: reports.detail,
      status: reports.status,
      createdAt: reports.createdAt,
      reporterName: user.displayUsername,
      priorReports,
    })
    .from(reports)
    .leftJoin(user, eq(reports.reporterId, user.id))
    .where(status === "open" ? eq(reports.status, "open") : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(200);
}

export async function countOpenReports(): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(reports)
    .where(eq(reports.status, "open"));
  return rows[0]?.count ?? 0;
}

/** Ownership check for comment deletion, without loading the thread. */
export async function getCommentStub(on: "pattern" | "post", id: string) {
  const db = getDb();
  if (on === "pattern") {
    const rows = await db
      .select({ id: comments.id, userId: comments.userId })
      .from(comments)
      .where(eq(comments.id, id))
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await db
    .select({ id: postComments.id, userId: postComments.userId })
    .from(postComments)
    .where(eq(postComments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Title + author of whatever is being reported, so the report keeps a readable
 * snapshot. Comments have no title, so the body stands in — truncated, because
 * this is a label in a moderation list, not a copy of the content.
 */
export async function reportTarget(
  type: "pattern" | "post" | "comment" | "deck",
  id: string,
): Promise<{ title: string; userId: string } | null> {
  const db = getDb();
  if (type === "pattern") {
    const rows = await db
      .select({ title: patterns.title, userId: patterns.userId })
      .from(patterns)
      .where(eq(patterns.id, id))
      .limit(1);
    return rows[0] ?? null;
  }
  if (type === "deck") {
    const rows = await db
      .select({ title: decks.title, userId: decks.userId })
      .from(decks)
      .where(eq(decks.id, id))
      .limit(1);
    return rows[0] ?? null;
  }
  if (type === "post") {
    const rows = await db
      .select({ title: posts.title, userId: posts.userId })
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await db
    .select({ body: comments.body, userId: comments.userId })
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  const row = rows[0];
  return row ? { title: row.body.slice(0, 80), userId: row.userId } : null;
}
