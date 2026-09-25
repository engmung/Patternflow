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
// The feed route asks Better Auth for a session (there is none here), and
// Better Auth is built with a secret — the same stand-in check:headermod uses.
process.env.BETTER_AUTH_SECRET ??= "smoke-test-secret-not-a-real-one";

const at = (day: number) => new Date(Date.UTC(2026, 6, day, 12, 0, 0));

let failures = 0;

/** Closes the SQLite handle, set once main has opened it. */
let closeDb: (() => void) | null = null;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`,
  );
}

async function main() {
  const { getDb } = await import("../src/lib/community/server/db");
  const schema = await import("../src/lib/community/server/schema");
  const queries = await import("../src/lib/community/server/queries");
  const { canView, forkBlocked } = await import("../src/lib/community/visibility");
  const { checkDeckPattern, cleanPatternIds } = await import("../src/lib/community/deckShare");
  const { DECK_MAX, PUBLIC_DECKS_MAX } = await import("../src/lib/community/deck");

  const db = getDb();
  closeDb = () => db.$client.close();

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
  // Written against DECK_MAX rather than a literal: these assertions used to
  // spell the cap out ("eleven patterns"), so raising it turned a passing
  // suite red and said nothing about what had actually broken.
  check("no patterns is not a deck", cleanPatternIds([]), null);
  check(
    "a full deck is accepted",
    cleanPatternIds(Array.from({ length: DECK_MAX }, (_, i) => `p${i}`))?.length,
    DECK_MAX,
  );
  check(
    "one past the cap is not a deck",
    cleanPatternIds(Array.from({ length: DECK_MAX + 1 }, (_, i) => `p${i}`)),
    null,
  );
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

  console.log("\n── the public-slot arithmetic ──");
  // These counted against PUBLIC_DECKS_MAX itself, which only held while the
  // cap happened to equal the two decks bob is seeded with — raising it broke
  // both. What is actually being tested is the counting, so count.
  check("bob's public decks are counted", await queries.countPublicDecksByUser("bob"), 2);
  check(
    "editing an already-public deck does not count itself",
    await queries.countPublicDecksByUser("bob", "d-bob-1"),
    1,
  );
  check(
    "a spent shelf is what blocks publishing, not the count alone",
    (await queries.countPublicDecksByUser("bob")) >= PUBLIC_DECKS_MAX,
    false,
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

  console.log("\n── the wall's and the marquee picker's search and oldest-first ──");
  // What stands now: p-pub (alice, day 2) and p-bob (bob, day 5) are public;
  // p-g1 is deleted and p-g2 went private above. Seed the rows the search
  // has to get right: wildcard characters in titles, a handle that differs
  // from its display form, and private/unlisted titles that match everything.
  await db.insert(schema.user).values({ ...person("dora_x", 1), displayUsername: "Dora_X" });
  const titled = (id: string, userId: string, visibility: string, day: number, title: string) => ({
    ...pattern(id, userId, visibility, day),
    title,
  });
  await db.insert(schema.patterns).values([
    titled("s-pct", "bob", "public", 20, "100% Static"),
    titled("s-100", "bob", "public", 21, "1000 Static"),
    titled("s-under", "dora_x", "public", 22, "Tide_Pool"),
    titled("s-under2", "dora_x", "public", 23, "Tide Pool"),
    titled("s-priv", "alice", "private", 24, "Static Tide 100% Pattern!"),
    titled("s-unl", "alice", "unlisted", 25, "Static Tide 100% Pattern!"),
  ]);
  const ids = async (options: Parameters<typeof queries.listFeed>[0]) =>
    (await queries.listFeed(options)).map((item) => item.id);

  check(
    "no search is the plain newest-first wall",
    await ids({}),
    ["s-under2", "s-under", "s-100", "s-pct", "p-bob", "p-pub"],
  );
  check("…and its count", await queries.countFeed(), 6);
  check("a blank search is no search", await ids({ q: "   " }), await ids({}));
  check("a lone @ is no search", await ids({ q: "@" }), await ids({}));
  check(
    "a title match — the private and unlisted rows that match are never in it",
    await ids({ q: "static" }),
    ["s-100", "s-pct"],
  );
  check("the plain search matches handles too", (await ids({ q: "dora" })).sort(), [
    "s-under",
    "s-under2",
  ]);
  check("@name searches handles only", await ids({ q: "@bob" }), ["s-100", "s-pct", "p-bob"]);
  check("…including the display form", (await ids({ q: "@Dora_X" })).length, 2);
  check("@ does not fall back to titles", await ids({ q: "@static" }), []);
  check("% is a literal percent, not a wildcard", await ids({ q: "100%" }), ["s-pct"]);
  check("_ is a literal underscore, not any character", await ids({ q: "Tide_" }), ["s-under"]);
  check("! (the escape character) is literal too", await ids({ q: "Pattern!" }), []);
  check("the count agrees with a search", await queries.countFeed(false, { q: "static" }), 2);
  check(
    "…and with an @ search",
    await queries.countFeed(false, { q: "@bob" }),
    (await ids({ q: "@bob", limit: 100 })).length,
  );
  check("…and with a search that matches nothing", await queries.countFeed(false, { q: "zzz" }), 0);
  check(
    "a search stays inside the hardware filter",
    await ids({ q: "pattern", hardwareOnly: true }),
    ["p-pub"],
  );
  check("…and so does its count", await queries.countFeed(true, { q: "pattern" }), 1);
  const oldestFirst = ["p-pub", "p-bob", "s-pct", "s-100", "s-under", "s-under2"];
  check("sort old is oldest first", await ids({ sort: "old" }), oldestFirst);
  check(
    "oldest first pages without repeats",
    [
      ...(await ids({ sort: "old", limit: 4 })),
      ...(await ids({ sort: "old", limit: 4, offset: 4 })),
    ],
    oldestFirst,
  );
  check("sort old combines with a search", await ids({ q: "static", sort: "old" }), [
    "s-pct",
    "s-100",
  ]);
  check("…and with the hardware filter", await ids({ sort: "old", hardwareOnly: true }), ["p-pub"]);
  check("the parser knows it", queries.parseFeedSort("old"), "old");
  check("…and anything else is still newest", queries.parseFeedSort("oldest"), "new");

  // Two rows on the same instant, older than everything: the id decides, so
  // paging one row at a time can neither show one twice nor skip one.
  await db.insert(schema.patterns).values([
    titled("s-tie-b", "cara", "public", 1, "Tie B"),
    titled("s-tie-a", "cara", "public", 1, "Tie A"),
  ]);
  check(
    "equal timestamps page in id order, one at a time",
    [
      ...(await ids({ sort: "old", limit: 1 })),
      ...(await ids({ sort: "old", limit: 1, offset: 1 })),
    ],
    ["s-tie-a", "s-tie-b"],
  );

  console.log("\n── the same through GET /api/community/patterns ──");
  // The wall's infinite scroll and the marquee picker both page through the
  // route, not listFeed, so the parameters have to survive the trip.
  const feedRoute = await import("../src/app/api/community/patterns/route");
  const get = async (query: string, cookie?: string) => {
    const response = await feedRoute.GET(
      new Request(`http://localhost:3000/api/community/patterns${query}`, {
        headers: cookie ? { cookie } : {},
      }),
    );
    const body = (await response.json()) as { items: { id: string }[]; total: number };
    return { status: response.status, ids: body.items.map((item) => item.id), total: body.total };
  };
  const everyone = ["s-tie-a", "s-tie-b", ...oldestFirst];
  check("no size means the default page, not one pattern", (await get("")).ids.length, everyone.length);
  check("…and an empty size too", (await get("?size=")).ids.length, everyone.length);
  check("an explicit size is still honoured", (await get("?size=3")).ids.length, 3);
  check("?sort=old is oldest first", (await get("?sort=old")).ids, everyone);
  check(
    "…and pages without repeats",
    [...(await get("?sort=old&size=5")).ids, ...(await get("?sort=old&size=5&offset=5")).ids],
    everyone,
  );
  check("?q= narrows the page", await get("?q=static"), {
    status: 200,
    ids: ["s-100", "s-pct"],
    total: 2,
  });
  check("…and its total is the search's, not the wall's", (await get("?q=%40bob")).total, 3);
  check("?q= combines with ?sort=old", (await get("?q=static&sort=old")).ids, ["s-pct", "s-100"]);
  check("…and with ?hw=1", await get("?q=pattern&hw=1"), { status: 200, ids: ["p-pub"], total: 1 });
  check("without a search the total is the whole wall", (await get("?size=1")).total, everyone.length);
  check(
    "the retired order=asc flag does nothing",
    (await get("?order=asc")).ids,
    (await get("")).ids,
  );

  console.log("\n── the Liked tab counts the viewer's likes, not the wall ──");
  // The wall scrolls until it holds `total`. With the whole wall's count as
  // the liked list's total, the scroll never ended; with the first batch's
  // length (the page's old stand-in), it ended after one batch.
  const { getAuth } = await import("../src/lib/community/server/auth");
  const { eq } = await import("drizzle-orm");
  const signUp = await getAuth().api.signUpEmail({
    body: { email: "liker@patternflow.local", password: "smoke-test-password", name: "liker", username: "liker" },
    asResponse: true,
  });
  const likerCookie = signUp.headers.get("set-cookie")!.split(";")[0];
  const likerId = (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.username, "liker")))[0].id;
  await db.insert(schema.likes).values(
    // Two that are not public: a like is not a standing right to read.
    ["p-pub", "s-pct", "s-100", "s-priv", "p-unl"].map((patternId) => ({
      userId: likerId,
      patternId,
      createdAt: at(30),
    })),
  );
  const liked = { sort: "liked" as const, viewerId: likerId };
  check("the liked list is the viewer's public likes", (await ids({ ...liked, limit: 100 })).sort(), ["p-pub", "s-100", "s-pct"]);
  check("…and its count is theirs, not the wall's", await queries.countFeed(false, liked), 3);
  check("…under a search", await queries.countFeed(false, { ...liked, q: "static" }), 2);
  check("…and under the hardware filter", await queries.countFeed(true, liked), 1);
  check("signed out, the liked count is 0 like the list", await queries.countFeed(false, { sort: "liked" }), 0);
  check("the route's liked total is the viewer's, page after page", await get("?sort=liked&size=1", likerCookie), {
    status: 200,
    ids: ["s-100"],
    total: 3,
  });
  check("…with its search", (await get("?sort=liked&q=static", likerCookie)).total, 2);
  check("…and signed out it is 0, not the wall", await get("?sort=liked"), { status: 200, ids: [], total: 0 });
}

// The temp directory goes BEFORE process.exit — a .finally() chained after an
// exit never runs, so every run used to leave a pf-sharing-* folder behind.
function cleanup() {
  try {
    // Windows will not delete a database file that is still open.
    closeDb?.();
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    // Best effort — a leftover temp folder is not a test failure.
  }
}

main()
  .then(() => {
    console.log(failures === 0 ? "\nAll sharing checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
    cleanup();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error);
    cleanup();
    process.exit(1);
  });
