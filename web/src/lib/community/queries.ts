import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { comments, likes, patterns, postComments, posts, reports, user } from "./schema";

// Server-side read helpers for the community pages. Pages query the SQLite
// file directly through these — no GET API layer for a single-process app.

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

const authorFields = {
  username: user.username,
  displayUsername: user.displayUsername,
};

// Counts stay as correlated subqueries rather than denormalized columns: at
// this scale SQLite does them for free, and a stored counter is one more thing
// that can drift out of sync with reality.
const likeCount = sql<number>`(SELECT COUNT(*) FROM ${likes} WHERE ${likes.patternId} = ${patterns.id})`;
const forkCount = sql<number>`(SELECT COUNT(*) FROM ${patterns} AS child WHERE child.parent_id = ${patterns.id})`;
const hasCpp = sql<number>`(${patterns.codeCpp} IS NOT NULL)`;

/** Feed ordering. "top"/"forks" are all-time; add a time window once volume justifies it. */
export const FEED_SORTS = ["new", "top", "forks"] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export function parseFeedSort(raw: string | undefined): FeedSort {
  return FEED_SORTS.includes(raw as FeedSort) ? (raw as FeedSort) : "new";
}

export type FeedItem = {
  id: string;
  title: string;
  code: string;
  parentId: string | null;
  createdAt: Date;
  username: string | null;
  displayUsername: string | null;
  likeCount: number;
  forkCount: number;
  hasCpp: boolean;
};

const feedColumns = {
  id: patterns.id,
  title: patterns.title,
  code: patterns.code,
  parentId: patterns.parentId,
  createdAt: patterns.createdAt,
  ...authorFields,
  likeCount,
  forkCount,
  hasCpp,
};

type FeedRow = Omit<FeedItem, "hasCpp"> & { hasCpp: number | boolean };

function toFeedItems(rows: FeedRow[]): FeedItem[] {
  // SQLite has no boolean type — the `IS NOT NULL` expression comes back as 0/1.
  return rows.map((row) => ({ ...row, hasCpp: Boolean(row.hasCpp) }));
}

/** How many patterns match the current filter — drives the page count. */
export async function countFeed(hardwareOnly = false): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(patterns)
    .where(hardwareOnly ? isNotNull(patterns.codeCpp) : undefined);
  return rows[0]?.count ?? 0;
}

export async function listFeed({
  sort = "new",
  hardwareOnly = false,
  limit = 60,
  offset = 0,
}: {
  sort?: FeedSort;
  hardwareOnly?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<FeedItem[]> {
  const db = getDb();
  // Every ordering falls back to newest-first so results are stable when the
  // primary key ties (which it does constantly while counts are near zero).
  const order =
    sort === "top"
      ? [desc(likeCount), desc(patterns.createdAt)]
      : sort === "forks"
        ? [desc(forkCount), desc(patterns.createdAt)]
        : [desc(patterns.createdAt)];

  const rows = await db
    .select(feedColumns)
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(hardwareOnly ? isNotNull(patterns.codeCpp) : undefined)
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
  return toFeedItems(rows);
}

export async function getPattern(id: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: patterns.id,
      userId: patterns.userId,
      title: patterns.title,
      description: patterns.description,
      code: patterns.code,
      codeCpp: patterns.codeCpp,
      license: patterns.license,
      madeOn: patterns.madeOn,
      madeHow: patterns.madeHow,
      parentId: patterns.parentId,
      createdAt: patterns.createdAt,
      updatedAt: patterns.updatedAt,
      ...authorFields,
      likeCount,
      forkCount,
    })
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(eq(patterns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Parent info for the "forked from" link — and for the two things a fork owes
 * its parent: the upstream credit baked into the source, and the licence its
 * own choice has to stay compatible with.
 */
export async function getPatternStub(id: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: patterns.id,
      title: patterns.title,
      userId: patterns.userId,
      license: patterns.license,
      ...authorFields,
    })
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(eq(patterns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

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
  type: "pattern" | "post" | "comment",
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

export async function listComments(patternId: string) {
  const db = getDb();
  return db
    .select({
      id: comments.id,
      userId: comments.userId,
      body: comments.body,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      ...authorFields,
    })
    .from(comments)
    .innerJoin(user, eq(comments.userId, user.id))
    .where(eq(comments.patternId, patternId))
    .orderBy(comments.createdAt);
}

/** Which of these patterns the viewer has already liked (empty when signed out). */
export async function likedPatternIds(
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await getDb()
    .select({ patternId: likes.patternId })
    .from(likes)
    .where(eq(likes.userId, userId));
  return new Set(rows.map((row) => row.patternId));
}

export async function hasLiked(userId: string, patternId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ patternId: likes.patternId })
    .from(likes)
    .where(and(eq(likes.userId, userId), eq(likes.patternId, patternId)))
    .limit(1);
  return rows.length > 0;
}

export async function countLikes(patternId: string): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(likes)
    .where(eq(likes.patternId, patternId));
  return rows[0]?.count ?? 0;
}

// ── Discussions ────────────────────────────────────────────────────────────────────

const postCommentCount = sql<number>`(SELECT COUNT(*) FROM ${postComments} WHERE ${postComments.postId} = ${posts.id})`;

export type PostListItem = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  username: string | null;
  displayUsername: string | null;
  commentCount: number;
};

export async function countPosts(): Promise<number> {
  const rows = await getDb().select({ count: sql<number>`COUNT(*)` }).from(posts);
  return rows[0]?.count ?? 0;
}

export async function listPosts({
  limit,
  offset = 0,
}: {
  limit: number;
  offset?: number;
}): Promise<PostListItem[]> {
  return getDb()
    .select({
      id: posts.id,
      title: posts.title,
      body: posts.body,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      ...authorFields,
      commentCount: postCommentCount,
    })
    .from(posts)
    .innerJoin(user, eq(posts.userId, user.id))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getPost(id: string) {
  const rows = await getDb()
    .select({
      id: posts.id,
      userId: posts.userId,
      title: posts.title,
      body: posts.body,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      ...authorFields,
    })
    .from(posts)
    .innerJoin(user, eq(posts.userId, user.id))
    .where(eq(posts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Ownership check for edit/delete, without loading the body. */
export async function getPostStub(id: string) {
  const rows = await getDb()
    .select({ id: posts.id, userId: posts.userId })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPostComments(postId: string) {
  return getDb()
    .select({
      id: postComments.id,
      userId: postComments.userId,
      body: postComments.body,
      createdAt: postComments.createdAt,
      editedAt: postComments.editedAt,
      ...authorFields,
    })
    .from(postComments)
    .innerJoin(user, eq(postComments.userId, user.id))
    .where(eq(postComments.postId, postId))
    .orderBy(postComments.createdAt);
}

export async function getUserByUsername(usernameLower: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: user.id,
      username: user.username,
      displayUsername: user.displayUsername,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.username, usernameLower))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPatternsByUser(userId: string): Promise<FeedItem[]> {
  const db = getDb();
  const rows = await db
    .select(feedColumns)
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(eq(patterns.userId, userId))
    .orderBy(desc(patterns.createdAt));
  return toFeedItems(rows);
}
