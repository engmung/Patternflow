import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { enqueueBuild, getBuild } from "./builds";
import { getDb } from "./db";
import { deckPatterns, decks, patterns as patternsTable } from "./schema";

// A deck's downloadable pack.
//
// "Send to my board" already builds a deck into modules, but it builds them
// into YOUR build queue, behind a sign-in, and the result is a URL nobody
// else can use. A deck is a thing you hand to people — so it also gets a
// stable address that serves a `.zip` of `.pfm` + `.json` + `catalog.txt`,
// the exact shape the device's /patterns page unpacks. Drop that link in
// Discord and anyone with a Patternflow is two clicks from your set.
//
// Cached by FINGERPRINT rather than by time: the fingerprint is the running
// order the pack was built from, so reordering or swapping a pattern
// invalidates it and nothing else does. A deck nobody edits is compiled once,
// ever.
//
// The compile is charged to the deck's OWNER, not to whoever downloads it —
// a visitor must not be able to queue work by pasting a URL, and the owner is
// the one who chose to publish.

/** Only patterns with a usable header can become a module. */
export type DeckZipPattern = { id: string; title: string; code: string };

/**
 * The running order as a single string. Pattern ids in deck order plus a
 * digest of the header each was built from: a pattern whose author fixes its
 * `.h` must invalidate the pack too, or downloads keep serving the broken
 * build. Digest rather than length — an edit that happens to keep the same
 * character count is exactly the sort of near-miss a cache key must not wave
 * through.
 *
 * SHA-1 because this is a cache key, not a security boundary: nobody is
 * trying to forge a collision here, and the alternative is dragging a
 * dependency in for the same 40 characters.
 */
export function fingerprintDeck(items: { patternId: string; codeCpp: string | null }[]): string {
  return items
    .map((item) => {
      const code = item.codeCpp ?? "";
      const digest = code
        ? createHash("sha1").update(code).digest("hex").slice(0, 16)
        : "none";
      return `${item.patternId}:${digest}`;
    })
    .join("|");
}

/**
 * The deck's patterns in running order, with the C++ header each will be
 * compiled from. Slots whose pattern is gone (or has no header) are dropped —
 * a pack is what CAN be installed, and the deck page is where the gap is
 * explained.
 */
export async function deckBuildInputs(deckId: string) {
  const rows = await getDb()
    .select({
      position: deckPatterns.position,
      patternId: deckPatterns.patternId,
      title: patternsTable.title,
      codeCpp: patternsTable.codeCpp,
      visibility: patternsTable.visibility,
    })
    .from(deckPatterns)
    .leftJoin(patternsTable, eq(patternsTable.id, deckPatterns.patternId))
    .where(eq(deckPatterns.deckId, deckId))
    .orderBy(deckPatterns.position);

  const usable = rows.filter(
    (row) => row.codeCpp && row.codeCpp.length > 0 && row.visibility === "public",
  );
  return {
    all: rows,
    usable,
    fingerprint: fingerprintDeck(
      rows.map((row) => ({ patternId: row.patternId, codeCpp: row.codeCpp })),
    ),
  };
}

export type DeckZipState =
  | { state: "empty" }
  | { state: "building"; buildId: string }
  | { state: "failed"; buildId: string; error: string }
  | { state: "ready"; buildId: string; artifact: string; bytes: number };

/**
 * What the deck's pack is doing right now, enqueueing a build when there
 * isn't a current one. Safe to call on every request: it only queues when the
 * fingerprint has actually moved.
 */
export async function ensureDeckZip(deckId: string): Promise<DeckZipState> {
  const db = getDb();
  const deckRows = await db
    .select({
      id: decks.id,
      userId: decks.userId,
      zipBuildId: decks.zipBuildId,
      zipFingerprint: decks.zipFingerprint,
    })
    .from(decks)
    .where(eq(decks.id, deckId))
    .limit(1);
  const deck = deckRows[0];
  if (!deck) return { state: "empty" };

  const { usable, fingerprint } = await deckBuildInputs(deckId);
  if (usable.length === 0) return { state: "empty" };

  if (deck.zipBuildId && deck.zipFingerprint === fingerprint) {
    const build = await getBuild(deck.zipBuildId);
    if (build) {
      if (build.status === "done" && build.artifact) {
        return {
          state: "ready",
          buildId: build.id,
          artifact: build.artifact,
          bytes: build.artifactBytes ?? 0,
        };
      }
      if (build.status === "error") {
        return { state: "failed", buildId: build.id, error: build.error ?? "build failed" };
      }
      return { state: "building", buildId: build.id };
    }
    // Row vanished (retention sweep) — fall through and rebuild.
  }

  const buildId = await enqueueBuild(
    deck.userId,
    usable.map((row) => ({ label: row.title ?? "pattern", code: row.codeCpp as string })),
    "pfm",
  );
  await db
    .update(decks)
    .set({ zipBuildId: buildId, zipFingerprint: fingerprint })
    .where(eq(decks.id, deckId));
  return { state: "building", buildId };
}

/** Drop the cached pack so the next request rebuilds. */
export async function invalidateDeckZip(deckId: string): Promise<void> {
  await getDb()
    .update(decks)
    .set({ zipBuildId: null, zipFingerprint: null })
    .where(eq(decks.id, deckId));
}

/** `patternflow-deck-my-set.zip` — a filename that says what it is. */
export function deckZipFilename(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "deck";
  return `patternflow-deck-${slug}.zip`;
}
