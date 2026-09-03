// ── Community queries: the pieces every query file leans on: ids, the author join, the counted sub-selects ──
// One of the files server/queries.ts is assembled from (2026-09). Bodies are
// unchanged from the single 1,364-line file they came out of.

import { sql } from "drizzle-orm";
import { deckPatterns, decks, likes, patternHeaders, patterns, user } from "../schema";

export const authorFields = {
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
export const likeCount = sql<number>`(SELECT COUNT(*) FROM ${likes} AS lk WHERE lk.pattern_id = ${patterns}.id)`;

export const forkCount = sql<number>`(SELECT COUNT(*) FROM ${patterns} AS child WHERE child.parent_id = ${patterns}.id)`;

// "Hardware ready" means an EFFECTIVE header exists: the author's own, or a
// live community port (see lib/community/ports.ts). Which one wins is the
// page's business; the feed only cares that a build has something to compile.
export const hasCpp = sql<number>`(${patterns.codeCpp} IS NOT NULL OR EXISTS (
  SELECT 1 FROM ${patternHeaders} AS ph
  WHERE ph.pattern_id = ${patterns}.id AND ph.stale = 0
))`;

// How many *other people* put this pattern in a public deck. Distinct owners,
// not rows, and never the pattern's own author: a like costs a click, but this
// costs one of somebody's few public deck slots spent on someone else's work —
// which is why it ranks better than likes (#256).
export const deckCount = sql<number>`(
  SELECT COUNT(DISTINCT d.user_id) FROM ${deckPatterns} AS dp
  JOIN ${decks} AS d ON d.id = dp.deck_id
  WHERE dp.pattern_id = ${patterns}.id
    AND d.visibility = 'public'
    AND d.user_id != ${patterns}.user_id
)`;
