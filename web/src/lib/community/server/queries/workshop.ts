// ── Community queries: the workshop — posts and their comments, territories and pins, attachments, presence, the atlas ──
// One of the files server/queries.ts is assembled from (2026-09). Bodies are
// unchanged from the single 1,364-line file they came out of.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { atlasPins, patterns, postAttachments, postComments, posts, presence, territories, territoryPins, user } from "../schema";
import { authorFields } from "./shared";

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
