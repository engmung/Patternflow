// ── Community queries: decks — lists, one deck, its items and previews ──
// One of the files server/queries.ts is assembled from (2026-09). Bodies are
// unchanged from the single 1,364-line file they came out of.

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import { deckPatterns, decks, patterns, user } from "../schema";
import type { FeedItem } from "./patterns";
import { authorFields, deckCount, forkCount, hasCpp, likeCount } from "./shared";

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
 * scale (a handful of public decks per account) a join-and-regroup would be more code
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

/** The deck feed: published decks, newest first. No pager yet — the public
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
 * like (a few public slots per account), so the pattern's own page says who did
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
      performanceJson: decks.performanceJson,
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
