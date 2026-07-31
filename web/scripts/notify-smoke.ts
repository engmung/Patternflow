/**
 * Notification smoke test — `npm run check:notify`.
 *
 * Against a throwaway SQLite file. What this guards: fan-out picks exactly the
 * right recipients (never the actor, never twice per event), cleanup means a
 * notification never outlives its subject, the read path drops rows whose
 * target went private, and the sweep keeps the 90-day promise in /terms.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The database is a lazy singleton keyed off this variable, so it has to be set
// before anything imports it — hence the dynamic imports below.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-notify-"));
process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
process.env.COMMUNITY_ENABLED = "1";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-01T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`,
  );
}

async function main() {
  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("../src/lib/community/db");
  const schema = await import("../src/lib/community/schema");
  const queries = await import("../src/lib/community/queries");
  const notify = await import("../src/lib/community/notify");
  const { sweepRetention } = await import("../src/lib/community/retention");

  const db = getDb();

  // ── Seed ───────────────────────────────────────────────────────────────────
  const person = (id: string) => ({
    id,
    name: id,
    email: `${id}@patternflow.local`,
    emailVerified: false,
    createdAt: ago(30),
    updatedAt: ago(30),
    username: id,
    displayUsername: id,
  });
  await db.insert(schema.user).values([person("alice"), person("bob"), person("cara")]);

  await db.insert(schema.patterns).values([
    {
      id: "p1",
      userId: "alice",
      title: "Alice One",
      code: "// p1",
      license: "CC-BY-SA-4.0",
      visibility: "public",
      createdAt: ago(10),
      updatedAt: ago(10),
    },
    {
      id: "p-bob",
      userId: "bob",
      title: "Bob Own",
      code: "// pb",
      license: "CC-BY-SA-4.0",
      visibility: "public",
      createdAt: ago(10),
      updatedAt: ago(10),
    },
  ]);
  await db.insert(schema.posts).values({
    id: "t1",
    userId: "alice",
    title: "Alice Thread",
    body: "hello",
    createdAt: ago(10),
    updatedAt: ago(10),
  });

  // Mirrors the route: insert the comment, then fan out.
  const comment = async (id: string, actor: string, body: string) => {
    await db.insert(schema.comments).values({
      id,
      patternId: "p1",
      userId: actor,
      body,
      createdAt: NOW,
    });
    await notify.notifyCommentAdded({
      on: "pattern",
      targetId: "p1",
      targetTitle: "Alice One",
      ownerId: "alice",
      actorId: actor,
      commentId: id,
      body,
    });
  };

  console.log("\n── comment fan-out on a flat thread ──");
  await comment("c1", "bob", "first!");
  check("the owner hears about the first comment", await queries.countUnreadNotifications("alice"), 1);
  check("the actor hears nothing", await queries.countUnreadNotifications("bob"), 0);

  await comment("c2", "cara", "second");
  check("the owner hears again", await queries.countUnreadNotifications("alice"), 2);
  check("the earlier commenter hears the thread moved", await queries.countUnreadNotifications("bob"), 1);

  await comment("c3", "alice", "thanks both");
  check("the owner never hears about their own comment", await queries.countUnreadNotifications("alice"), 2);
  check("both earlier commenters hear it", [
    await queries.countUnreadNotifications("bob"),
    await queries.countUnreadNotifications("cara"),
  ], [2, 1]);

  const bobRows = await queries.listNotifications("bob");
  check("thread rows say so", bobRows.map((row) => row.type), ["thread", "thread"]);
  check("and carry the snippet", bobRows[0]?.snippet, "thanks both");

  console.log("\n── post comments use the same path ──");
  await db.insert(schema.postComments).values({
    id: "pc1",
    postId: "t1",
    userId: "bob",
    body: "post reply",
    createdAt: NOW,
  });
  await notify.notifyCommentAdded({
    on: "post",
    targetId: "t1",
    targetTitle: "Alice Thread",
    ownerId: "alice",
    actorId: "bob",
    commentId: "pc1",
    body: "post reply",
  });
  check("the post's author hears it", await queries.countUnreadNotifications("alice"), 3);
  check(
    "the row points at the post",
    (await queries.listNotifications("alice"))[0]?.targetType,
    "post",
  );

  console.log("\n── forks ──");
  // The route inserts the fork before notifying, so the row's target exists —
  // the read path drops rows whose target is missing, and that guard is
  // exercised separately below.
  await db.insert(schema.patterns).values({
    id: "p-fork",
    userId: "bob",
    title: "Alice One remix",
    code: "// fork",
    license: "CC-BY-SA-4.0",
    visibility: "public",
    parentId: "p1",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await notify.notifyForkPublished({
    parentOwnerId: "alice",
    parentTitle: "Alice One",
    forkId: "p-fork",
    forkVisibility: "public",
    actorId: "bob",
  });
  check("a public fork tells the parent's author", await queries.countUnreadNotifications("alice"), 4);
  await notify.notifyForkPublished({
    parentOwnerId: "alice",
    parentTitle: "Alice One",
    forkId: "p-fork2",
    forkVisibility: "private",
    actorId: "bob",
  });
  check("a private fork tells nobody — its page would 404", await queries.countUnreadNotifications("alice"), 4);
  await notify.notifyForkPublished({
    parentOwnerId: "alice",
    parentTitle: "Alice One",
    forkId: "p-fork3",
    forkVisibility: "public",
    actorId: "alice",
  });
  check("forking your own work tells nobody", await queries.countUnreadNotifications("alice"), 4);

  console.log("\n── deck inclusion ──");
  await db.insert(schema.decks).values({
    id: "d1",
    userId: "bob",
    title: "Bob's Shelf",
    visibility: "public",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const deckPatterns = [
    { id: "p1", title: "Alice One", userId: "alice" },
    { id: "p-bob", title: "Bob Own", userId: "bob" },
  ];
  await notify.notifyDeckInclusion({
    deckId: "d1",
    deckTitle: "Bob's Shelf",
    actorId: "bob",
    patterns: deckPatterns,
  });
  check("the pattern's author hears it", await queries.countUnreadNotifications("alice"), 5);
  check("the deck owner's own pattern tells nobody", await queries.countUnreadNotifications("bob"), 2);
  await notify.notifyDeckInclusion({
    deckId: "d1",
    deckTitle: "Bob's Shelf",
    actorId: "bob",
    patterns: deckPatterns,
  });
  check("repeating the event while unread is absorbed", await queries.countUnreadNotifications("alice"), 5);

  console.log("\n── reading ──");
  await queries.markNotificationsRead("alice");
  check("opening the page reads everything", await queries.countUnreadNotifications("alice"), 0);
  check("the rows themselves stay", (await queries.listNotifications("alice")).length, 5);

  console.log("\n── the read path respects visibility ──");
  await db.update(schema.patterns).set({ visibility: "private" }).where(eq(schema.patterns.id, "p1"));
  check(
    "rows about a now-private pattern vanish for others",
    (await queries.listNotifications("cara")).length,
    0,
  );
  check(
    "but its own author keeps theirs",
    (await queries.listNotifications("alice")).some((row) => row.targetId === "p1"),
    true,
  );
  await db.update(schema.patterns).set({ visibility: "public" }).where(eq(schema.patterns.id, "p1"));
  check("and they return when it does", (await queries.listNotifications("cara")).length, 1);

  await db.update(schema.decks).set({ visibility: "private" }).where(eq(schema.decks.id, "d1"));
  check(
    "a deck gone private hides its inclusion row",
    (await queries.listNotifications("alice")).some((row) => row.targetType === "deck"),
    false,
  );
  await db.update(schema.decks).set({ visibility: "public" }).where(eq(schema.decks.id, "d1"));

  console.log("\n── cleanup — a notification never outlives its subject ──");
  await notify.clearNotificationsFor({ sourceId: "c3" });
  check(
    "deleting a comment takes its rows (bob's thread ping)",
    (await queries.listNotifications("bob")).map((row) => row.snippet),
    ["second"],
  );
  await notify.clearNotificationsFor({ targetType: "deck", targetId: "d1" });
  check(
    "deleting the deck takes the inclusion row",
    (await queries.listNotifications("alice")).some((row) => row.targetType === "deck"),
    false,
  );
  await notify.clearNotificationsFor({ targetType: "pattern", targetId: "p1", sourceId: "p1" });
  check(
    "deleting the pattern takes everything that pointed at it",
    (await queries.listNotifications("cara")).length,
    0,
  );

  console.log("\n── the sweep keeps the 90-day promise ──");
  await db.insert(schema.notifications).values([
    {
      id: "n-old",
      userId: "alice",
      type: "comment",
      actorId: "bob",
      targetType: "post",
      targetId: "t1",
      targetTitle: "Alice Thread",
      createdAt: ago(91),
    },
    {
      id: "n-new",
      userId: "alice",
      type: "comment",
      actorId: "bob",
      targetType: "post",
      targetId: "t1",
      targetTitle: "Alice Thread",
      createdAt: ago(1),
    },
  ]);
  const swept = await sweepRetention(NOW);
  check("ninety-one days is over the line", swept.oldNotifications, 1);
  const left = await db.select({ id: schema.notifications.id }).from(schema.notifications);
  check("yesterday's survives", left.some((row) => row.id === "n-new"), true);
  check("no sweep errors", swept.errors, []);
}

main()
  .then(() => {
    console.log(failures === 0 ? "\nAll notify checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });
