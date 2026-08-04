// Rules for sharing a deck — pure functions, so the API routes and the smoke
// test run the same code. Database access stays in queries.ts.

import { DECK_MAX } from "./deck";
import type { Visibility } from "./visibility";

/**
 * The submitted running order: 1 to DECK_MAX pattern ids, no duplicates.
 * Returns null when the shape is wrong — the caller answers 400.
 */
export function cleanPatternIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0 || raw.length > DECK_MAX) return null;
  const ids: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > 64) return null;
    ids.push(entry);
  }
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

export type DeckPatternCheck =
  | { ok: true; title: string }
  /** Missing — or somebody else's private pattern, which must answer exactly
   *  like missing so a deck submission cannot probe ids. */
  | { ok: false; reason: "unavailable" }
  /** The owner's own private pattern in a deck that would be visible to others. */
  | { ok: false; reason: "private"; title: string };

/**
 * May this pattern sit in a deck with this visibility?
 *
 * A shared deck may carry public patterns only. It may not carry private ones,
 * which would either leak them or render as holes the author never chose to
 * publish. A private deck may carry anything of its owner's — nobody else is
 * looking at it.
 */
export function checkDeckPattern(
  pattern: { title: string; userId: string; visibility: string } | undefined,
  deckVisibility: Visibility,
  ownerId: string,
): DeckPatternCheck {
  if (!pattern) return { ok: false, reason: "unavailable" };
  if (pattern.visibility === "private") {
    if (pattern.userId !== ownerId) return { ok: false, reason: "unavailable" };
    if (deckVisibility !== "private") {
      return { ok: false, reason: "private", title: pattern.title };
    }
  }
  return { ok: true, title: pattern.title };
}
