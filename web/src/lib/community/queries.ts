import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { comments, likes, patterns, user } from "./schema";

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

export async function listFeed({
  sort = "new",
  hardwareOnly = false,
  limit = 60,
}: { sort?: FeedSort; hardwareOnly?: boolean; limit?: number } = {}): Promise<FeedItem[]> {
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
    .limit(limit);
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

/** Minimal parent info for the "forked from" link. */
export async function getPatternStub(id: string) {
  const db = getDb();
  const rows = await db
    .select({ id: patterns.id, title: patterns.title, userId: patterns.userId })
    .from(patterns)
    .where(eq(patterns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listComments(patternId: string) {
  const db = getDb();
  return db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
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
