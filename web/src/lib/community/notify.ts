import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { newId } from "./queries";
import { comments, notifications, postComments, territoryPins } from "./schema";

// Fan-out on write: the mutation that causes a notification also records it,
// one row per recipient. Nothing here is real-time — the rows sit until the
// recipient's next page load reads the count.
//
// Two rules every writer follows:
//   - never notify the actor about their own act
//   - each recipient gets at most one row per event

const SNIPPET_MAX = 120;

/** One line of preview — the row has to read without opening anything. */
function snippetOf(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX - 1)}…` : flat;
}

export type NotificationType =
  | "comment"
  | "thread"
  | "fork"
  | "deck"
  | "port"
  | "pin"
  | "performance"
  | "perf-pin"
  | "territory";

type Seed = {
  userId: string;
  type: NotificationType;
  actorId: string;
  targetType: "pattern" | "post" | "deck";
  targetId: string;
  targetTitle: string;
  sourceId?: string | null;
  snippet?: string | null;
};

async function insertAll(seeds: Seed[]): Promise<void> {
  if (seeds.length === 0) return;
  const now = new Date();
  await getDb()
    .insert(notifications)
    .values(
      seeds.map((seed) => ({
        id: newId(),
        userId: seed.userId,
        type: seed.type,
        actorId: seed.actorId,
        targetType: seed.targetType,
        targetId: seed.targetId,
        targetTitle: seed.targetTitle,
        sourceId: seed.sourceId ?? null,
        snippet: seed.snippet ?? null,
        createdAt: now,
      })),
    );
}

/**
 * A new comment notifies the owner ("comment") and everyone who commented on
 * the same thing earlier ("thread") — which is what a reply means on a flat
 * thread. The actor is excluded from both, and the owner never gets the
 * weaker "thread" row on top of their "comment" one.
 */
export async function notifyCommentAdded(opts: {
  on: "pattern" | "post";
  targetId: string;
  targetTitle: string;
  ownerId: string;
  actorId: string;
  commentId: string;
  body: string;
}): Promise<void> {
  const snippet = snippetOf(opts.body);
  const seeds: Seed[] = [];

  if (opts.ownerId !== opts.actorId) {
    seeds.push({
      userId: opts.ownerId,
      type: "comment",
      actorId: opts.actorId,
      targetType: opts.on,
      targetId: opts.targetId,
      targetTitle: opts.targetTitle,
      sourceId: opts.commentId,
      snippet,
    });
  }

  const db = getDb();
  const earlier =
    opts.on === "pattern"
      ? await db
          .selectDistinct({ userId: comments.userId })
          .from(comments)
          .where(eq(comments.patternId, opts.targetId))
      : await db
          .selectDistinct({ userId: postComments.userId })
          .from(postComments)
          .where(eq(postComments.postId, opts.targetId));

  for (const row of earlier) {
    if (row.userId === opts.actorId || row.userId === opts.ownerId) continue;
    seeds.push({
      userId: row.userId,
      type: "thread",
      actorId: opts.actorId,
      targetType: opts.on,
      targetId: opts.targetId,
      targetTitle: opts.targetTitle,
      sourceId: opts.commentId,
      snippet,
    });
  }

  await insertAll(seeds);
}

/**
 * A new thread in a territory notifies everyone pinned there.
 *
 * This is what makes a pin a SUBSCRIPTION rather than a badge: "I'm working
 * here" already names exactly the people who want to hear that something
 * happened here, so the fan-out list costs no schema and no opt-in flow.
 * The author is excluded as always — and being pinned themselves (the modal
 * checks "also pin me" by default) must not earn them a row about their own
 * thread.
 */
export async function notifyNewThread(opts: {
  territoryId: string;
  /** "A1 · Wired control — OSC" — rides in the snippet so the sentence can
   *  say where without a join at read time. */
  territoryLabel: string;
  postId: string;
  postTitle: string;
  actorId: string;
}): Promise<void> {
  const pinned = await getDb()
    .selectDistinct({ userId: territoryPins.userId })
    .from(territoryPins)
    .where(eq(territoryPins.territoryId, opts.territoryId));

  await insertAll(
    pinned
      .filter((row) => row.userId !== opts.actorId)
      .map((row) => ({
        userId: row.userId,
        type: "territory" as const,
        actorId: opts.actorId,
        targetType: "post" as const,
        targetId: opts.postId,
        targetTitle: opts.postTitle,
        sourceId: opts.postId,
        snippet: opts.territoryLabel,
      })),
  );
}

/**
 * A fork notifies the parent's author. The row points at the FORK — that is
 * the thing worth opening — while the title names what was forked. Private
 * forks notify nobody: the page the row links to would be a 404.
 */
export async function notifyForkPublished(opts: {
  parentOwnerId: string;
  parentTitle: string;
  forkId: string;
  forkVisibility: string;
  actorId: string;
}): Promise<void> {
  if (opts.parentOwnerId === opts.actorId) return;
  if (opts.forkVisibility === "private") return;
  await insertAll([
    {
      userId: opts.parentOwnerId,
      type: "fork",
      actorId: opts.actorId,
      targetType: "pattern",
      targetId: opts.forkId,
      targetTitle: opts.parentTitle,
      sourceId: opts.forkId,
    },
  ]);
}

/**
 * A pattern entering someone's PUBLIC deck notifies the pattern's author —
 * the same act the feed's "in decks" sort counts, told to the person it
 * credits. Unlisted and private decks notify nobody: the deck author chose
 * not to list them, and the notification would hand out the link.
 *
 * Guarded against repeats: flipping a deck's visibility back and forth, or
 * re-publishing its contents, must not re-notify while the first row is
 * still unread.
 */
export async function notifyDeckInclusion(opts: {
  deckId: string;
  deckTitle: string;
  actorId: string;
  patterns: { id: string; title: string; userId: string }[];
}): Promise<void> {
  const db = getDb();
  const seeds: Seed[] = [];
  for (const pattern of opts.patterns) {
    if (pattern.userId === opts.actorId) continue;
    const unread = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, pattern.userId),
          eq(notifications.type, "deck"),
          eq(notifications.targetId, opts.deckId),
          eq(notifications.sourceId, pattern.id),
          isNull(notifications.readAt),
        ),
      )
      .limit(1);
    if (unread.length > 0) continue;
    seeds.push({
      userId: pattern.userId,
      type: "deck",
      actorId: opts.actorId,
      targetType: "deck",
      targetId: opts.deckId,
      targetTitle: opts.deckTitle,
      sourceId: pattern.id,
      snippet: pattern.title,
    });
  }
  await insertAll(seeds);
}

/**
 * A community port landed on the author's pattern — the one notification the
 * whole feature leans on: ports go live without acceptance, so the author has
 * to hear about it to exercise their pick.
 */
export async function notifyPortAdded(opts: {
  patternOwnerId: string;
  patternId: string;
  patternTitle: string;
  portId: string;
  actorId: string;
}): Promise<void> {
  if (opts.patternOwnerId === opts.actorId) return;
  await insertAll([
    {
      userId: opts.patternOwnerId,
      type: "port",
      actorId: opts.actorId,
      targetType: "pattern",
      targetId: opts.patternId,
      targetTitle: opts.patternTitle,
      sourceId: opts.portId,
    },
  ]);
}

/** Somebody published a performance recording for the author's pattern. */
export async function notifyPerformanceAdded(opts: {
  patternOwnerId: string;
  patternId: string;
  patternTitle: string;
  performanceId: string;
  actorId: string;
}): Promise<void> {
  if (opts.patternOwnerId === opts.actorId) return;
  await insertAll([
    {
      userId: opts.patternOwnerId,
      type: "performance",
      actorId: opts.actorId,
      targetType: "pattern",
      targetId: opts.patternId,
      targetTitle: opts.patternTitle,
      sourceId: opts.performanceId,
    },
  ]);
}

/** The author pinned a recording — told to whoever recorded it. */
export async function notifyPerformancePinned(opts: {
  recorderId: string;
  patternId: string;
  patternTitle: string;
  performanceId: string;
  actorId: string;
}): Promise<void> {
  if (opts.recorderId === opts.actorId) return;
  await insertAll([
    {
      userId: opts.recorderId,
      type: "perf-pin",
      actorId: opts.actorId,
      targetType: "pattern",
      targetId: opts.patternId,
      targetTitle: opts.patternTitle,
      sourceId: opts.performanceId,
    },
  ]);
}

/** The author pinned a port — told to the porter whose board earned it. */
export async function notifyPortPinned(opts: {
  porterId: string;
  patternId: string;
  patternTitle: string;
  portId: string;
  actorId: string;
}): Promise<void> {
  if (opts.porterId === opts.actorId) return;
  await insertAll([
    {
      userId: opts.porterId,
      type: "pin",
      actorId: opts.actorId,
      targetType: "pattern",
      targetId: opts.patternId,
      targetTitle: opts.patternTitle,
      sourceId: opts.portId,
    },
  ]);
}

/**
 * Cleanup for content deletion routes. A notification pointing at something
 * gone is noise, so the route that removes a pattern, post, deck or comment
 * calls this with the removed id — it clears rows that point AT the thing
 * and rows triggered BY it.
 */
export async function clearNotificationsFor(opts: {
  targetType?: "pattern" | "post" | "deck";
  targetId?: string;
  sourceId?: string;
}): Promise<void> {
  const db = getDb();
  if (opts.targetType && opts.targetId) {
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.targetType, opts.targetType),
          eq(notifications.targetId, opts.targetId),
        ),
      );
  }
  if (opts.sourceId) {
    await db.delete(notifications).where(eq(notifications.sourceId, opts.sourceId));
  }
}
