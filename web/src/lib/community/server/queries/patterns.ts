// ── Community queries: patterns — the feed, one pattern, its comments, likes, ports and performances ──
// One of the files server/queries.ts is assembled from (2026-09). Bodies are
// unchanged from the single 1,364-line file they came out of.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { comments, featuredPatterns, likes, patternHeaders, patternPerformances, patterns, user } from "../schema";
import { authorFields, deckCount, forkCount, hasCpp, likeCount } from "./shared";

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/** Feed ordering. All of them are all-time; add a time window once volume
 *  justifies it.
 *
 *  "decks" was deliberately left out while decks were a side feature — with a
 *  handful of them it would have reordered the wall on almost no signal. The
 *  redesign makes a deck the thing the community is FOR (a handful of public slots a
 *  person, a curated shelf on the decks page), so the signal is now the
 *  scarcest one on the site and earns its tab. */
/* "liked" is the odd one out: a filter wearing a sort's clothes. It shows only
 * what the viewer has liked, newest first, and it exists because a like was
 * write-only — you could press it and never find the pattern again. It replaces
 * a separate "Saved" list that lived in localStorage, so it was per-browser and
 * gone the moment you cleared site data. A like was already server-side and
 * per-account; the list was the only part missing. */
export const FEED_SORTS = ["new", "top", "forks", "decks", "liked"] as const;

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
  /** "public" | "private" — always "public" in the feed itself. */
  visibility: string;
  /** Distinct other people whose public decks carry this pattern. */
  deckCount: number;
};

const feedColumns = {
  id: patterns.id,
  title: patterns.title,
  code: patterns.code,
  parentId: patterns.parentId,
  createdAt: patterns.createdAt,
  visibility: patterns.visibility,
  ...authorFields,
  likeCount,
  forkCount,
  hasCpp,
  deckCount,
};

type FeedRow = Omit<FeedItem, "hasCpp"> & { hasCpp: number | boolean };

function toFeedItems(rows: FeedRow[]): FeedItem[] {
  // SQLite has no boolean type — the `IS NOT NULL` expression comes back as 0/1.
  return rows.map((row) => ({ ...row, hasCpp: Boolean(row.hasCpp) }));
}

// The feed shows public patterns only. Private rows live in the same table, so
// EVERY listing query needs this — a miss here is a leak (#255).
const feedVisible = eq(patterns.visibility, "public");

// The hardware filter and the card chip must agree, so both read `hasCpp`.
const hardwareReady = sql`${hasCpp} = 1`;

/** How many patterns match the current filter — drives the page count. */
export async function countFeed(hardwareOnly = false): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(patterns)
    .where(and(feedVisible, hardwareOnly ? hardwareReady : undefined));
  return rows[0]?.count ?? 0;
}

export async function listFeed({
  sort = "new",
  hardwareOnly = false,
  limit = 60,
  offset = 0,
  viewerId = null,
}: {
  sort?: FeedSort;
  hardwareOnly?: boolean;
  limit?: number;
  offset?: number;
  /** Required by `sort: "liked"` — whose likes to list. */
  viewerId?: string | null;
} = {}): Promise<FeedItem[]> {
  const db = getDb();

  // A signed-out visitor has no likes, and answering with the whole wall
  // would be worse than answering with nothing: the tab says "the ones you
  // liked". Empty is the honest reply.
  if (sort === "liked" && !viewerId) return [];
  // Every ordering falls back to newest-first so results are stable when the
  // primary key ties (which it does constantly while counts are near zero).
  const order =
    sort === "top"
      ? [desc(likeCount), desc(patterns.createdAt)]
      : sort === "forks"
        ? [desc(forkCount), desc(patterns.createdAt)]
        : sort === "decks"
          ? [desc(deckCount), desc(patterns.createdAt)]
          : [desc(patterns.createdAt)];

  // Still subject to feedVisible, like every other listing. Having liked
  // something is not a standing right to keep reading it: if the author takes
  // it private afterwards, it leaves your list too. The alternative would turn
  // a like into a way to hold a copy of work somebody withdrew.
  const likedByViewer =
    sort === "liked"
      ? sql`EXISTS (SELECT 1 FROM ${likes} WHERE ${likes.patternId} = ${patterns.id} AND ${likes.userId} = ${viewerId})`
      : undefined;

  const rows = await db
    .select(feedColumns)
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(and(feedVisible, likedByViewer, hardwareOnly ? hardwareReady : undefined))
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
  return toFeedItems(rows);
}

/**
 * The marquee's patterns, in the order a moderator put them.
 *
 * Anything that has stopped being public since it was featured drops out
 * silently rather than 404-ing on the front page — the same `feedVisible` rule
 * every other listing obeys.
 */
export async function listFeatured(limit = 8): Promise<FeedItem[]> {
  const rows = await getDb()
    .select(feedColumns)
    .from(featuredPatterns)
    .innerJoin(patterns, eq(featuredPatterns.patternId, patterns.id))
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(feedVisible)
    .orderBy(featuredPatterns.position, desc(featuredPatterns.createdAt))
    .limit(limit);
  return toFeedItems(rows);
}

/** Ids only — for the admin page's "already in the marquee" marks. */
export async function listFeaturedIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ patternId: featuredPatterns.patternId })
    .from(featuredPatterns)
    .orderBy(featuredPatterns.position);
  return rows.map((row) => row.patternId);
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
      cppModeratedAt: patterns.cppModeratedAt,
      license: patterns.license,
      madeOn: patterns.madeOn,
      madeHow: patterns.madeHow,
      parentId: patterns.parentId,
      visibility: patterns.visibility,
      pinnedHeaderId: patterns.pinnedHeaderId,
      pinnedPerformanceId: patterns.pinnedPerformanceId,
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
 * own choice has to stay compatible with. Carries visibility so interaction
 * routes (like, comment, fork) can refuse private patterns without loading
 * the whole row.
 */
export async function getPatternStub(id: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: patterns.id,
      title: patterns.title,
      userId: patterns.userId,
      license: patterns.license,
      visibility: patterns.visibility,
      ...authorFields,
    })
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(eq(patterns.id, id))
    .limit(1);
  return rows[0] ?? null;
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

/** Which of these patterns the viewer has already liked (empty when signed
 *  out). Pass the page's pattern ids to keep it one small indexed IN query —
 *  omitted, it returns the viewer's whole liked set. */
export async function likedPatternIds(
  userId: string | null | undefined,
  patternIds?: string[],
): Promise<Set<string>> {
  if (!userId) return new Set();
  if (patternIds && patternIds.length === 0) return new Set();
  const rows = await getDb()
    .select({ patternId: likes.patternId })
    .from(likes)
    .where(
      patternIds
        ? and(eq(likes.userId, userId), inArray(likes.patternId, patternIds))
        : eq(likes.userId, userId),
    );
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

/**
 * A profile is the complete archive only to its owner. Everyone else sees the
 * public rows.
 */
export async function listPatternsByUser(
  userId: string,
  viewerId: string | null = null,
): Promise<FeedItem[]> {
  const db = getDb();
  const rows = await db
    .select(feedColumns)
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(
      viewerId === userId
        ? eq(patterns.userId, userId)
        : and(eq(patterns.userId, userId), feedVisible),
    )
    .orderBy(desc(patterns.createdAt));
  return toFeedItems(rows);
}

// ── Community ports ──────────────────────────────────────────────────────────

/** A pattern's ports, oldest first — the order resolution reads them in. */
export async function listPatternPorts(patternId: string) {
  return getDb()
    .select({
      id: patternHeaders.id,
      userId: patternHeaders.userId,
      codeCpp: patternHeaders.codeCpp,
      note: patternHeaders.note,
      stale: sql<number>`${patternHeaders.stale}`,
      moderatedAt: patternHeaders.moderatedAt,
      createdAt: patternHeaders.createdAt,
      ...authorFields,
    })
    .from(patternHeaders)
    .innerJoin(user, eq(patternHeaders.userId, user.id))
    .where(eq(patternHeaders.patternId, patternId))
    .orderBy(patternHeaders.createdAt)
    .then((rows) =>
      // SQLite booleans come back 0/1 — normalise once, here.
      rows.map((row) => ({ ...row, stale: Boolean(row.stale) })),
    );
}

/** A pattern's recordings, oldest first — the order resolvePerformance reads. */
export async function listPatternPerformances(patternId: string) {
  return getDb()
    .select({
      id: patternPerformances.id,
      userId: patternPerformances.userId,
      performanceJson: patternPerformances.performanceJson,
      note: patternPerformances.note,
      createdAt: patternPerformances.createdAt,
      ...authorFields,
    })
    .from(patternPerformances)
    .innerJoin(user, eq(patternPerformances.userId, user.id))
    .where(eq(patternPerformances.patternId, patternId))
    .orderBy(patternPerformances.createdAt);
}

/** Ownership check for deleting a recording — and the pin's validation. */
export async function getPerformanceStub(id: string) {
  const rows = await getDb()
    .select({
      id: patternPerformances.id,
      userId: patternPerformances.userId,
      patternId: patternPerformances.patternId,
    })
    .from(patternPerformances)
    .where(eq(patternPerformances.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Ownership check for deleting a port — and the pin's validation, which
 *  needs to know the port belongs to the pattern and is still live. */
export async function getPortStub(id: string) {
  const rows = await getDb()
    .select({
      id: patternHeaders.id,
      userId: patternHeaders.userId,
      patternId: patternHeaders.patternId,
      stale: sql<number>`${patternHeaders.stale}`,
    })
    .from(patternHeaders)
    .where(eq(patternHeaders.id, id))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, stale: Boolean(row.stale) } : null;
}
