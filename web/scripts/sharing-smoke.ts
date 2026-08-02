/**
 * Sharing smoke test — `npm run check:sharing`.
 *
 * Pattern visibility (#255) and shared decks (#256), against a throwaway
 * SQLite file. What this really guards: the feed and profile queries all read
 * the same `patterns` table that now holds unlisted and private rows, so one
 * missed filter is a leak — and the deck rules (two public slots, no private
 * patterns in a shared deck, gaps instead of silent shortening) are the whole
 * design, so they are pinned here rather than hoped for.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The database is a lazy singleton keyed off this variable, so it has to be set
// before anything imports it — hence the dynamic imports below.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-sharing-"));
process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
process.env.COMMUNITY_ENABLED = "1";

const at = (day: number) => new Date(Date.UTC(2026, 6, day, 12, 0, 0));

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`,
  );
}

async function main() {
  const { getDb } = await import("../src/lib/community/db");
  const schema = await import("../src/lib/community/schema");
  const queries = await import("../src/lib/community/queries");
  const { canView, forkBlocked } = await import("../src/lib/community/visibility");
  const { checkDeckPattern, cleanPatternIds } = await import("../src/lib/community/deckShare");
  const { PUBLIC_DECKS_MAX } = await import("../src/lib/community/deck");

  const db = getDb();

  // ── Seed: two authors, one bystander ──────────────────────────────────────
  const person = (id: string, n: number) => ({
    id,
    name: id,
    email: `${id}@patternflow.local`,
    emailVerified: false,
    createdAt: at(n),
    updatedAt: at(n),
    username: id,
    displayUsername: id,
  });
  await db.insert(schema.user).values([person("alice", 1), person("bob", 1), person("cara", 1)]);

  const pattern = (
    id: string,
    userId: string,
    visibility: string,
    day: number,
    codeCpp: string | null = null,
  ) => ({
    id,
    userId,
    title: `Pattern ${id}`,
    code: `// ${id}`,
    codeCpp,
    license: "CC-BY-SA-4.0",
    visibility,
    createdAt: at(day),
    updatedAt: at(day),
  });
  await db.insert(schema.patterns).values([
    pattern("p-pub", "alice", "public", 2, "#pragma once"),
    pattern("p-unl", "alice", "unlisted", 3),
    pattern("p-priv", "alice", "private", 4),
    pattern("p-bob", "bob", "public", 5),
    pattern("p-g1", "alice", "public", 6),
    pattern("p-g2", "alice", "unlisted", 7),
  ]);

  console.log("\n── the feed shows public only ──");
  const feed = await queries.listFeed();
  check(
    "unlisted and private are not in the feed",
    feed.map((item) => item.id).sort(),
    ["p-bob", "p-g1", "p-pub"],
  );
  check("the count agrees with the list", await queries.countFeed(), 3);
  check(
    "the hardware filter stays inside the visible set",
    (await queries.listFeed({ hardwareOnly: true })).map((item) => item.id),
    ["p-pub"],
  );

  console.log("\n── a profile is the whole archive only to its owner ──");
  check(
    "the owner sees all three states",
    (await queries.listPatternsByUser("alice", "alice")).map((i) => i.id).sort(),
    ["p-g1", "p-g2", "p-priv", "p-pub", "p-unl"].sort(),
  );
  check(
    "a visitor sees public only",
    (await queries.listPatternsByUser("alice", "bob")).map((i) => i.id).sort(),
    ["p-g1", "p-pub"],
  );
  check(
    "signed-out sees public only",
    (await queries.listPatternsByUser("alice", null)).map((i) => i.id).sort(),
    ["p-g1", "p-pub"],
  );

  console.log("\n── who may open what ──");
  check("public opens for anyone", canView("public", "alice", null), true);
  check("unlisted opens by link for anyone", canView("unlisted", "alice", null), true);
  check("private is a 404 to a stranger", canView("private", "alice", "bob"), false);
  check("private opens for its author", canView("private", "alice", "alice"), true);
  check("a moderator keeps sight of everything", canView("private", "alice", "mod", true), true);

  console.log("\n── forking respects visibility ──");
  const priv = { visibility: "private", userId: "alice" };
  check("nobody forks someone else's private work", forkBlocked(priv, "bob"), true);
  check("the author may fork their own", forkBlocked(priv, "alice"), false);
  check("unlisted is forkable — its credit link resolves", forkBlocked({ visibility: "unlisted", userId: "alice" }, "bob"), false);

  console.log("\n── what a deck submission accepts ──");
  check("no patterns is not a deck", cleanPatternIds([]), null);
  check("eleven patterns is not a deck", cleanPatternIds(Array.from({ length: 11 }, (_, i) => `p${i}`)), null);
  check("duplicates are refused", cleanPatternIds(["a", "a"]), null);
  check("a real list passes through", cleanPatternIds(["a", "b"]), ["a", "b"]);

  const stub = (visibility: string, userId: string) => ({ title: "T", userId, visibility });
  check("a missing pattern is unavailable", checkDeckPattern(undefined, "public", "alice").ok, false);
  check(
    "someone else's private answers exactly like missing",
    checkDeckPattern(stub("private", "alice"), "public", "bob"),
    { ok: false, reason: "unavailable" },
  );
  check(
    "your own private cannot enter a shared deck",
    checkDeckPattern(stub("private", "alice"), "public", "alice"),
    { ok: false, reason: "private", title: "T" },
  );
  check(
    "…but sits fine in a private deck",
    checkDeckPattern(stub("private", "alice"), "private", "alice").ok,
    true,
  );
  check(
    "unlisted in a public deck is the intended path",
    checkDeckPattern(stub("unlisted", "alice"), "public", "bob").ok,
    true,
  );

  // ── Seed decks ─────────────────────────────────────────────────────────────
  const deck = (id: string, userId: string, visibility: string, day: number) => ({
    id,
    userId,
    title: `Deck ${id}`,
    visibility,
    createdAt: at(day),
    updatedAt: at(day),
  });
  await db.insert(schema.decks).values([
    deck("d-alice", "alice", "public", 10),
    deck("d-alice-priv", "alice", "private", 11),
    deck("d-bob-1", "bob", "public", 12),
    deck("d-bob-2", "bob", "public", 13),
    deck("d-cara-unl", "cara", "unlisted", 14),
    deck("d-gap", "alice", "public", 15),
  ]);
  const slot = (deckId: string, patternId: string, position: number) => ({
    deckId,
    patternId,
    position,
    titleSnapshot: `Pattern ${patternId}`,
  });
  await db.insert(schema.deckPatterns).values([
    slot("d-alice", "p-pub", 0),
    slot("d-alice", "p-unl", 1),
    slot("d-bob-1", "p-pub", 0),
    slot("d-bob-2", "p-pub", 0),
    slot("d-cara-unl", "p-pub", 0),
    slot("d-gap", "p-g1", 0),
    slot("d-gap", "p-g2", 1),
  ]);

  console.log("\n── deck listings follow the same visibility rules ──");
  check(
    "the deck feed is public decks only",
    (await queries.listPublicDecks()).map((d) => d.id).sort(),
    ["d-alice", "d-bob-1", "d-bob-2", "d-gap"],
  );
  check(
    "a profile shows its owner everything",
    (await queries.listDecksByUser("alice", "alice")).map((d) => d.id).sort(),
    ["d-alice", "d-alice-priv", "d-gap"],
  );
  check(
    "and a visitor the public ones",
    (await queries.listDecksByUser("alice", "bob")).map((d) => d.id).sort(),
    ["d-alice", "d-gap"],
  );
  const dAlice = (await queries.listPublicDecks()).find((d) => d.id === "d-alice");
  check("pattern count rides along", dAlice?.patternCount, 2);
  check(
    "the preview strip keeps running order",
    dAlice?.preview.map((p) => p.id),
    ["p-pub", "p-unl"],
  );

  console.log("\n── the two-slot arithmetic ──");
  check("bob has spent both public slots", await queries.countPublicDecksByUser("bob"), PUBLIC_DECKS_MAX);
  check(
    "editing an already-public deck does not count itself",
    await queries.countPublicDecksByUser("bob", "d-bob-1"),
    PUBLIC_DECKS_MAX - 1,
  );
  check("private decks cost nothing", await queries.countPublicDecksByUser("alice"), 2);

  console.log("\n── a deck shows the gap, not a shorter set ──");
  const before = await queries.listDeckItems("d-gap", null);
  check("both slots present before anything happens", before.map((i) => i.gap), [null, null]);

  // p-g2's author withdraws it from view…
  await db
    .update(schema.patterns)
    .set({ visibility: "private" })
    .where((await import("drizzle-orm")).eq(schema.patterns.id, "p-g2"));
  const afterPrivate = await queries.listDeckItems("d-gap", null);
  check("…and its slot becomes a private gap", afterPrivate[1]?.gap, "private");
  check("the gap keeps the position", afterPrivate[1]?.position, 1);
  check("and the name it had", afterPrivate[1]?.titleSnapshot, "Pattern p-g2");
  check(
    "the pattern's own author still sees it in place",
    (await queries.listDeckItems("d-gap", "alice"))[1]?.gap,
    null,
  );

  // …and p-g1's author deletes it outright.
  await db.delete(schema.patterns).where((await import("drizzle-orm")).eq(schema.patterns.id, "p-g1"));
  const afterDelete = await queries.listDeckItems("d-gap", null);
  check("a deleted pattern leaves a deleted gap", afterDelete[0]?.gap, "deleted");
  check("its snapshot title survives the row", afterDelete[0]?.titleSnapshot, "Pattern p-g1");
  check("the set is still two slots long", afterDelete.length, 2);

  console.log("\n── the deck signal on feed cards ──");
  // p-pub sits in alice's own deck (does not count), two decks by bob (one
  // person, counts once), and cara's unlisted deck (not public, does not
  // count) → 1. Shown on the card as DCK; not a sort while decks are few.
  const feedNow = await queries.listFeed();
  const pPub = feedNow.find((item) => item.id === "p-pub");
  check("own decks and unlisted decks do not count, one person counts once", pPub?.deckCount, 1);
  check(
    "everything else sits at zero",
    feedNow.filter((i) => i.id !== "p-pub").map((i) => i.deckCount),
    [0],
  );
}

main()
  .then(() => {
    console.log(failures === 0 ? "\nAll sharing checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });
