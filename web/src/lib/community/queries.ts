import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { comments, patterns, user } from "./schema";

// Server-side read helpers for the community pages. Pages query the SQLite
// file directly through these — no GET API layer for a single-process app.

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

const authorFields = {
  username: user.username,
  displayUsername: user.displayUsername,
};

export type FeedItem = {
  id: string;
  title: string;
  code: string;
  parentId: string | null;
  createdAt: Date;
  username: string | null;
  displayUsername: string | null;
};

export async function listFeed(limit = 60): Promise<FeedItem[]> {
  const db = getDb();
  return db
    .select({
      id: patterns.id,
      title: patterns.title,
      code: patterns.code,
      parentId: patterns.parentId,
      createdAt: patterns.createdAt,
      ...authorFields,
    })
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .orderBy(desc(patterns.createdAt))
    .limit(limit);
}

export async function getPattern(id: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: patterns.id,
      title: patterns.title,
      description: patterns.description,
      code: patterns.code,
      license: patterns.license,
      parentId: patterns.parentId,
      createdAt: patterns.createdAt,
      ...authorFields,
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
    .select({ id: patterns.id, title: patterns.title })
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
  return db
    .select({
      id: patterns.id,
      title: patterns.title,
      code: patterns.code,
      parentId: patterns.parentId,
      createdAt: patterns.createdAt,
      ...authorFields,
    })
    .from(patterns)
    .innerJoin(user, eq(patterns.userId, user.id))
    .where(eq(patterns.userId, userId))
    .orderBy(desc(patterns.createdAt));
}
