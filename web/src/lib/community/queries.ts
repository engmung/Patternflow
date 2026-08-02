import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  comments,
  deckPatterns,
  decks,
  likes,
  notifications,
  patternHeaders,
  patterns,
  postComments,
  posts,
  reports,
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
const likeCount = sql<number>`(SELECT COUNT(*) FROM ${likes} WHERE ${likes.patternId} = ${patterns.id})`;
const forkCount = sql<number>`(SELECT COUNT(*) FROM ${patterns} AS child WHERE child.parent_id = ${patterns.id})`;
// "Hardware ready" means an EFFECTIVE header exists: the author's own, or a
// live community port (see lib/community/ports.ts). Which one wins is the
// page's business; the feed only cares that a build has something to compile.
const hasCpp = sql<number>`(${patterns.codeCpp} IS NOT NULL OR EXISTS (
  SELECT 1 FROM ${patternHeaders} AS ph
  WHERE ph.pattern_id = ${patterns.id} AND ph.stale = 0
))`;
// How many *other people* put this pattern in a public deck. Distinct owners,
// not rows, and never the pattern's own author: a like costs a click, but this
// costs one of somebody's two public deck slots spent on someone else's work —
// which is why it ranks better than likes (#256).
const deckCount = sql<number>`(
  SELECT COUNT(DISTINCT d.user_id) FROM ${deckPatterns} AS dp
  JOIN ${decks} AS d ON d.id = dp.deck_id
  WHERE dp.pattern_id = ${patterns.id}
    AND d.visibility = 'public'
    AND d.user_id != ${patterns.userId}
)`;

/** Feed ordering. "top"/"forks" are all-time; add a time window once volume justifies it.
 *  The deck-inclusion count rides on every card (DCK) but is not a sort yet —
 *  with a handful of decks it would reorder the feed on almost no signal. */
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
  /** "public" | "unlisted" | "private" — always "public" in the feed itself. */
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

// The feed shows public patterns only. Unlisted and private rows exist in the
// same table, so EVERY listing query needs this — a miss here is a leak (#255).
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
 * public rows — unlisted stays reachable by link, not by browsing the author.
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

const deckPatternCount = sql<number>`(SELECT COUNT(*) FROM ${deckPatterns} WHERE ${deckPatterns.deckId} = ${decks.id})`;

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
async function withPreviews(rows: DeckListRow[], perDeck = 3): Promise<DeckListItem[]> {
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
