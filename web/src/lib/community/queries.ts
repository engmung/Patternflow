import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  comments,
  deckPatterns,
  decks,
  featuredPatterns,
  likes,
  notifications,
  patternHeaders,
  patterns,
  postAttachments,
  postComments,
  posts,
  presence,
  reports,
  territories,
  territoryPins,
  user,
} from "./schema";

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
//
// TRAP, learned the hard way: `${table.column}` renders as an UNQUALIFIED
// column name, and SQLite binds a bare name to the innermost table that owns
// one — `(SELECT COUNT(*) FROM posts WHERE territory_id = id)` counts posts
// whose territory_id equals THEIR OWN id, which is zero, forever, without
// erroring. So every subquery here aliases its inner tables and writes outer
// references as `${table}.column`, which renders qualified.
const likeCount = sql<number>`(SELECT COUNT(*) FROM ${likes} AS lk WHERE lk.pattern_id = ${patterns}.id)`;
const forkCount = sql<number>`(SELECT COUNT(*) FROM ${patterns} AS child WHERE child.parent_id = ${patterns}.id)`;
// "Hardware ready" means an EFFECTIVE header exists: the author's own, or a
// live community port (see lib/community/ports.ts). Which one wins is the
// page's business; the feed only cares that a build has something to compile.
const hasCpp = sql<number>`(${patterns.codeCpp} IS NOT NULL OR EXISTS (
  SELECT 1 FROM ${patternHeaders} AS ph
  WHERE ph.pattern_id = ${patterns}.id AND ph.stale = 0
))`;
// How many *other people* put this pattern in a public deck. Distinct owners,
// not rows, and never the pattern's own author: a like costs a click, but this
// costs one of somebody's two public deck slots spent on someone else's work —
// which is why it ranks better than likes (#256).
const deckCount = sql<number>`(
  SELECT COUNT(DISTINCT d.user_id) FROM ${deckPatterns} AS dp
  JOIN ${decks} AS d ON d.id = dp.deck_id
  WHERE dp.pattern_id = ${patterns}.id
    AND d.visibility = 'public'
    AND d.user_id != ${patterns}.user_id
)`;

/** Feed ordering. All of them are all-time; add a time window once volume
 *  justifies it.
 *
 *  "decks" was deliberately left out while decks were a side feature — with a
 *  handful of them it would have reordered the wall on almost no signal. The
 *  redesign makes a deck the thing the community is FOR (two public slots a
 *  person, a curated shelf on the decks page), so the signal is now the
 *  scarcest one on the site and earns its tab. */
export const FEED_SORTS = ["new", "top", "forks", "decks"] as const;
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
        : sort === "decks"
          ? [desc(deckCount), desc(patterns.createdAt)]
          : [desc(patterns.createdAt)];

  const rows = await db
    .select(feedColumns)
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(and(feedVisible, hardwareOnly ? hardwareReady : undefined))
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
      license: patterns.license,
      madeOn: patterns.madeOn,
      madeHow: patterns.madeHow,
      parentId: patterns.parentId,
      visibility: patterns.visibility,
      pinnedHeaderId: patterns.pinnedHeaderId,
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

const postCommentCount = sql<number>`(SELECT COUNT(*) FROM ${postComments} AS pc WHERE pc.post_id = ${posts}.id)`;

export type PostListItem = {
  id: string;
  title: string;
  body: string;
  /** The notice — moderator-pinned, floats above everything. */
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  username: string | null;
  displayUsername: string | null;
  commentCount: number;
};

export async function countPosts(territoryId?: string): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(posts)
    .where(territoryId ? eq(posts.territoryId, territoryId) : undefined);
  return rows[0]?.count ?? 0;
}

/** Threads in one territory, newest first, the notice (if any) on top. */
export async function listPosts({
  territoryId,
  limit,
  offset = 0,
}: {
  territoryId?: string;
  limit: number;
  offset?: number;
}): Promise<PostListItem[]> {
  const rows = await getDb()
    .select({
      id: posts.id,
      title: posts.title,
      body: posts.body,
      pinnedAt: posts.pinnedAt,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      ...authorFields,
      commentCount: postCommentCount,
    })
    .from(posts)
    .innerJoin(user, eq(posts.userId, user.id))
    .where(territoryId ? eq(posts.territoryId, territoryId) : undefined)
    // The notice first (there is at most one), then newest.
    .orderBy(sql`${posts.pinnedAt} IS NULL`, desc(posts.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map(({ pinnedAt, ...row }) => ({ ...row, pinned: pinnedAt !== null }));
}

// ── The map ──────────────────────────────────────────────────────────────────

const pinCount = sql<number>`(SELECT COUNT(*) FROM ${territoryPins} AS tp WHERE tp.territory_id = ${territories}.id)`;
const threadCount = sql<number>`(SELECT COUNT(*) FROM ${posts} AS th WHERE th.territory_id = ${territories}.id)`;

export type TerritoryListItem = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  span: number;
  position: number;
  x: number;
  y: number;
  shippingNext: boolean;
  questions: string | null;
  pinCount: number;
  threadCount: number;
};

const territoryColumns = {
  id: territories.id,
  code: territories.code,
  title: territories.title,
  description: territories.description,
  span: territories.span,
  position: territories.position,
  x: territories.x,
  y: territories.y,
  shippingNext: territories.shippingNext,
  questions: territories.questions,
  pinCount,
  threadCount,
};

/** Every live direction, in map order. Archived ones drop off the map but keep
 *  their threads readable by link. */
export async function listTerritories(): Promise<TerritoryListItem[]> {
  return getDb()
    .select(territoryColumns)
    .from(territories)
    .where(isNull(territories.archivedAt))
    .orderBy(territories.position, territories.code);
}

/**
 * Every territory including archived ones, for the editor.
 *
 * The public list hides archived rows because they are not places to go any
 * more; the editor must show them because "un-retire this" is one of the
 * things it exists to let you do.
 */
export async function listTerritoriesForAdmin(): Promise<
  (TerritoryListItem & { archivedAt: Date | null })[]
> {
  return getDb()
    .select({ ...territoryColumns, archivedAt: territories.archivedAt })
    .from(territories)
    .orderBy(territories.position, territories.code);
}

export async function getTerritoryByCode(code: string): Promise<TerritoryListItem | null> {
  const rows = await getDb()
    .select(territoryColumns)
    .from(territories)
    .where(eq(territories.code, code.toUpperCase()))
    .limit(1);
  return rows[0] ?? null;
}

export type TerritoryPin = {
  userId: string;
  username: string | null;
  displayUsername: string | null;
  note: string | null;
  createdAt: Date;
};

/** Who is working here, longest-standing first — the map's whole payload. */
export async function listTerritoryPins(territoryId: string): Promise<TerritoryPin[]> {
  return getDb()
    .select({
      userId: territoryPins.userId,
      ...authorFields,
      note: territoryPins.note,
      createdAt: territoryPins.createdAt,
    })
    .from(territoryPins)
    .innerJoin(user, eq(territoryPins.userId, user.id))
    .where(eq(territoryPins.territoryId, territoryId))
    .orderBy(territoryPins.createdAt);
}

/** The viewer's own pins — drives "You're pinned here" on the map and the
 *  "working on …" line on their profile. */
export async function listPinsByUser(
  userId: string,
): Promise<{ territoryId: string; code: string; title: string; note: string | null; createdAt: Date }[]> {
  return getDb()
    .select({
      territoryId: territoryPins.territoryId,
      code: territories.code,
      title: territories.title,
      note: territoryPins.note,
      createdAt: territoryPins.createdAt,
    })
    .from(territoryPins)
    .innerJoin(territories, eq(territoryPins.territoryId, territories.id))
    .where(eq(territoryPins.userId, userId))
    .orderBy(territoryPins.createdAt);
}

/** Somebody standing on the constellation. */
export type PresencePerson = {
  userId: string;
  username: string | null;
  displayUsername: string | null;
  x: number;
  y: number;
  status: string | null;
  updatedAt: Date;
};

/** Everyone who has walked somewhere, for the map's people layer. */
export async function listPresence(): Promise<PresencePerson[]> {
  return getDb()
    .select({
      userId: presence.userId,
      ...authorFields,
      x: presence.x,
      y: presence.y,
      status: presence.status,
      updatedAt: presence.updatedAt,
    })
    .from(presence)
    .innerJoin(user, eq(presence.userId, user.id))
    .orderBy(presence.updatedAt);
}

/**
 * Accounts that have never moved — rendered as the cluster of squares at the
 * core, which doubles as "how many people signed up". Same aliasing rule as
 * the count subqueries at the top of this file.
 */
export async function countUnmoved(): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(user)
    .where(sql`${user}.id NOT IN (SELECT pr.user_id FROM ${presence} AS pr)`);
  return rows[0]?.count ?? 0;
}

export type RecentThread = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  username: string | null;
  displayUsername: string | null;
  commentCount: number;
  territoryCode: string;
  territoryTitle: string;
};

/**
 * The newest threads across every territory — the workshop's proof of life.
 * Pure recency, no notice-first ordering: this strip answers "is anything
 * happening here", not "what should I read first".
 */
export async function listRecentThreads(limit = 4): Promise<RecentThread[]> {
  return getDb()
    .select({
      id: posts.id,
      title: posts.title,
      body: posts.body,
      createdAt: posts.createdAt,
      ...authorFields,
      commentCount: postCommentCount,
      territoryCode: territories.code,
      territoryTitle: territories.title,
    })
    .from(posts)
    .innerJoin(user, eq(posts.userId, user.id))
    .innerJoin(territories, eq(posts.territoryId, territories.id))
    .orderBy(desc(posts.createdAt))
    .limit(limit);
}

export type AttachmentView = {
  id: string;
  postId: string;
  commentId: string | null;
  filename: string;
  bytes: number;
};

/** Files on a thread — the body's and every reply's, in one read. */
export async function listAttachments(postId: string): Promise<AttachmentView[]> {
  return getDb()
    .select({
      id: postAttachments.id,
      postId: postAttachments.postId,
      commentId: postAttachments.commentId,
      filename: postAttachments.filename,
      bytes: postAttachments.bytes,
    })
    .from(postAttachments)
    .where(eq(postAttachments.postId, postId))
    .orderBy(postAttachments.createdAt);
}

export async function getAttachment(id: string) {
  const rows = await getDb()
    .select({
      id: postAttachments.id,
      postId: postAttachments.postId,
      commentId: postAttachments.commentId,
      // Who hung it there — the DELETE route's whole authorisation check.
      userId: postAttachments.userId,
      filename: postAttachments.filename,
      bytes: postAttachments.bytes,
    })
    .from(postAttachments)
    .where(eq(postAttachments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function countAttachments(
  postId: string,
  commentId: string | null,
): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(postAttachments)
    .where(
      and(
        eq(postAttachments.postId, postId),
        commentId === null
          ? isNull(postAttachments.commentId)
          : eq(postAttachments.commentId, commentId),
      ),
    );
  return rows[0]?.count ?? 0;
}

/**
 * Bytes this person is already storing, and bytes everyone is storing.
 *
 * The per-parent cap (five files a thread) bounds a single thread and nothing
 * else: a determined account just makes more threads, and the only ceiling
 * left is the disk the Pi boots from. These two are what the upload route
 * checks its quotas against.
 */
export async function attachmentBytesByUser(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ total: sql<number>`COALESCE(SUM(${postAttachments.bytes}), 0)` })
    .from(postAttachments)
    .where(eq(postAttachments.userId, userId));
  return rows[0]?.total ?? 0;
}

export async function attachmentBytesTotal(): Promise<number> {
  const rows = await getDb()
    .select({ total: sql<number>`COALESCE(SUM(${postAttachments.bytes}), 0)` })
    .from(postAttachments);
  return rows[0]?.total ?? 0;
}

export async function getPost(id: string) {
  const rows = await getDb()
    .select({
      id: posts.id,
      userId: posts.userId,
      title: posts.title,
      body: posts.body,
      pinnedAt: posts.pinnedAt,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      ...authorFields,
      // Where it lives. The thread page is a page ABOUT a territory as much as
      // about the thread — breadcrumb, sidebar card, "more in A3".
      territoryId: posts.territoryId,
      territoryCode: territories.code,
      territoryTitle: territories.title,
    })
    .from(posts)
    .innerJoin(user, eq(posts.userId, user.id))
    .innerJoin(territories, eq(posts.territoryId, territories.id))
    .where(eq(posts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Ownership check for edit/delete, without loading the body. The title rides
 *  along for notification rows, which snapshot it. */
export async function getPostStub(id: string) {
  const rows = await getDb()
    .select({ id: posts.id, userId: posts.userId, title: posts.title })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Ownership check for a reply, without loading its body — used to decide who
 *  may hang a file on it. */
export async function getPostCommentStub(id: string) {
  const rows = await getDb()
    .select({ id: postComments.id, postId: postComments.postId, userId: postComments.userId })
    .from(postComments)
    .where(eq(postComments.id, id))
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

// ── Decks ────────────────────────────────────────────────────────────────────
// Shared decks: the ordered set someone published, distinct from the working
// deck in localStorage (lib/community/deck.ts). Reads follow the same
// visibility rules as patterns.

const deckPatternCount = sql<number>`(SELECT COUNT(*) FROM ${deckPatterns} AS dpn WHERE dpn.deck_id = ${decks}.id)`;

export type DeckListItem = {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
  username: string | null;
  displayUsername: string | null;
  patternCount: number;
  /** First few patterns in running order — the card's thumbnail strip. */
  preview: { id: string; title: string; code: string }[];
};

const deckListColumns = {
  id: decks.id,
  title: decks.title,
  description: decks.description,
  visibility: decks.visibility,
  createdAt: decks.createdAt,
  updatedAt: decks.updatedAt,
  ...authorFields,
  patternCount: deckPatternCount,
};

type DeckListRow = Omit<DeckListItem, "preview">;

/**
 * Attach each deck's first few visible patterns. One query per deck — at this
 * scale (two public decks per account) a join-and-regroup would be more code
 * than the problem.
 */
async function withPreviews(rows: DeckListRow[], perDeck = 4): Promise<DeckListItem[]> {
  const db = getDb();
  const result: DeckListItem[] = [];
  for (const row of rows) {
    const preview = await db
      .select({ id: patterns.id, title: patterns.title, code: patterns.code })
      .from(deckPatterns)
      .innerJoin(patterns, eq(deckPatterns.patternId, patterns.id))
      .where(
        and(
          eq(deckPatterns.deckId, row.id),
          // A pattern that went private after the deck was published renders
          // as a gap on the deck page, so it cannot headline the card either.
          ne(patterns.visibility, "private"),
        ),
      )
      .orderBy(deckPatterns.position)
      .limit(perDeck);
    result.push({ ...row, preview });
  }
  return result;
}

/** The deck feed: published decks, newest first. No pager yet — two public
 *  decks per account keeps this list countable for a long while. */
export async function listPublicDecks(limit = 60): Promise<DeckListItem[]> {
  const rows = await getDb()
    .select(deckListColumns)
    .from(decks)
    .innerJoin(user, eq(decks.userId, user.id))
    .where(eq(decks.visibility, "public"))
    .orderBy(desc(decks.createdAt))
    .limit(limit);
  return withPreviews(rows);
}

/**
 * Public decks this pattern was picked into — the other half of the DCK count
 * on its card, named rather than tallied.
 *
 * Being chosen for somebody's running order is a scarcer compliment than a
 * like (two public slots per account), so the pattern's own page says who did
 * the choosing. Only the shelf, never someone's private arrangement.
 */
export async function listDecksWithPattern(
  patternId: string,
  limit = 6,
): Promise<{ id: string; title: string }[]> {
  return getDb()
    .select({ id: decks.id, title: decks.title })
    .from(deckPatterns)
    .innerJoin(decks, eq(deckPatterns.deckId, decks.id))
    .where(and(eq(deckPatterns.patternId, patternId), eq(decks.visibility, "public")))
    .orderBy(desc(decks.createdAt))
    .limit(limit);
}

/** A profile's decks: all of them to the owner, public ones to everyone else. */
export async function listDecksByUser(
  userId: string,
  viewerId: string | null = null,
): Promise<DeckListItem[]> {
  const rows = await getDb()
    .select(deckListColumns)
    .from(decks)
    .innerJoin(user, eq(decks.userId, user.id))
    .where(
      viewerId === userId
        ? eq(decks.userId, userId)
        : and(eq(decks.userId, userId), eq(decks.visibility, "public")),
    )
    .orderBy(desc(decks.createdAt));
  return withPreviews(rows);
}

export async function getDeck(id: string) {
  const rows = await getDb()
    .select({
      id: decks.id,
      userId: decks.userId,
      title: decks.title,
      description: decks.description,
      visibility: decks.visibility,
      createdAt: decks.createdAt,
      updatedAt: decks.updatedAt,
      ...authorFields,
    })
    .from(decks)
    .innerJoin(user, eq(decks.userId, user.id))
    .where(eq(decks.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Ownership check for PATCH/DELETE, without loading the whole deck. */
export async function getDeckStub(id: string) {
  const rows = await getDb()
    .select({ id: decks.id, userId: decks.userId, title: decks.title, visibility: decks.visibility })
    .from(decks)
    .where(eq(decks.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type DeckItem = {
  position: number;
  patternId: string;
  titleSnapshot: string;
  /** Null when the slot is a gap — see `gap`. */
  pattern: FeedItem | null;
  /** Why the slot is empty. A deck shows the gap rather than silently
   *  shortening the set (#256): the running order is the author's work. */
  gap: "deleted" | "private" | null;
};

/**
 * A deck's contents in running order. `viewerId` decides whether a pattern
 * that has since gone private still renders (its own author keeps seeing it).
 */
export async function listDeckItems(
  deckId: string,
  viewerId: string | null = null,
): Promise<DeckItem[]> {
  const rows = await getDb()
    .select({
      position: deckPatterns.position,
      patternId: deckPatterns.patternId,
      titleSnapshot: deckPatterns.titleSnapshot,
      patternRow: {
        id: patterns.id,
        title: patterns.title,
        code: patterns.code,
        parentId: patterns.parentId,
        createdAt: patterns.createdAt,
        visibility: patterns.visibility,
        userId: patterns.userId,
      },
      username: user.username,
      displayUsername: user.displayUsername,
      likeCount,
      forkCount,
      hasCpp,
      deckCount,
    })
    .from(deckPatterns)
    // LEFT joins: a deleted pattern's row is gone, and the whole point of the
    // snapshot column is that the deck row survives it.
    .leftJoin(patterns, eq(deckPatterns.patternId, patterns.id))
    .leftJoin(user, eq(patterns.userId, user.id))
    .where(eq(deckPatterns.deckId, deckId))
    .orderBy(deckPatterns.position);

  return rows.map((row) => {
    if (!row.patternRow?.id) {
      return {
        position: row.position,
        patternId: row.patternId,
        titleSnapshot: row.titleSnapshot,
        pattern: null,
        gap: "deleted" as const,
      };
    }
    const p = row.patternRow;
    if (p.visibility === "private" && viewerId !== p.userId) {
      return {
        position: row.position,
        patternId: row.patternId,
        titleSnapshot: row.titleSnapshot,
        pattern: null,
        gap: "private" as const,
      };
    }
    return {
      position: row.position,
      patternId: row.patternId,
      titleSnapshot: row.titleSnapshot,
      pattern: {
        id: p.id,
        title: p.title,
        code: p.code,
        parentId: p.parentId,
        createdAt: p.createdAt,
        visibility: p.visibility,
        username: row.username,
        displayUsername: row.displayUsername,
        likeCount: row.likeCount,
        forkCount: row.forkCount,
        hasCpp: Boolean(row.hasCpp),
        deckCount: row.deckCount,
      },
      gap: null,
    };
  });
}

/** How many public decks this account has — the two-slot cap's input. */
export async function countPublicDecksByUser(
  userId: string,
  excludeDeckId?: string,
): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(decks)
    .where(
      and(
        eq(decks.userId, userId),
        eq(decks.visibility, "public"),
        excludeDeckId ? ne(decks.id, excludeDeckId) : undefined,
      ),
    );
  return rows[0]?.count ?? 0;
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

/**
 * The rows a deck submission points at — existence and visibility checks
 * happen against these, and the title snapshots are taken from them.
 */
export async function getPatternsForDeck(ids: string[]) {
  if (ids.length === 0) return [];
  return getDb()
    .select({
      id: patterns.id,
      title: patterns.title,
      userId: patterns.userId,
      visibility: patterns.visibility,
    })
    .from(patterns)
    .where(inArray(patterns.id, ids));
}
