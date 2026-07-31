import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { newId } from "./queries";
import { comments, notifications, postComments } from "./schema";

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

export type NotificationType = "comment" | "thread" | "fork" | "deck";

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
