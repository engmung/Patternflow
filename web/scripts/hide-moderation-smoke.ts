/**
 * Take-down smoke test — `npm run check:hidemod`.
 *
 * What this guards: a moderator making somebody else's pattern or deck
 * private, and restoring it (lib/community/server/admin.ts). Like
 * check:headermod it drives the real route handlers with real Better Auth
 * sessions, because what is worth testing is the permission branch, and a
 * helper's unit test passes just as happily with the branch wired backwards.
 *
 * The ways this goes wrong, all of them quiet:
 *   - the moderator's reach leaks past visibility into the work itself
 *   - the author undoes the take-down in one click, so it was only a request
 *   - a moderator publishes something its author chose to keep private
 *   - a moderator can open private work at all, beyond what they took down
 *   - the take-down lands with no mark and no alert, or the reason is lost
 *   - the moderator cannot reach the thread under what they took down, so
 *     "the reason is a comment" works only if they write it first
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The database is a lazy singleton keyed off these variables, so they have to
// be set before anything imports it — hence the dynamic imports below.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-hidemod-"));
process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
process.env.COMMUNITY_ENABLED = "1";
process.env.COMMUNITY_ADMIN_USERNAMES = "themod";
// No Origin header is sent below, which is the "same-origin navigation" case
// originBlocked() lets through — the session check is the real gate.
process.env.BETTER_AUTH_SECRET = "smoke-test-secret-not-a-real-one";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`,
  );
}

const REASON = "Same pattern as one you already posted — update that one instead.";

async function main() {
  const { eq } = await import("drizzle-orm");
  const { getAuth } = await import("../src/lib/community/server/auth");
  const { getDb } = await import("../src/lib/community/server/db");
  const schema = await import("../src/lib/community/server/schema");
  const queries = await import("../src/lib/community/server/queries");
  const patternRoute = await import("../src/app/api/community/patterns/[id]/route");
  const commentRoute = await import("../src/app/api/community/patterns/[id]/comments/route");
  const headerRoute = await import("../src/app/api/community/patterns/[id]/header/route");
  const deckRoute = await import("../src/app/api/community/decks/[id]/route");

  const db = getDb();
  const auth = getAuth();

  /** Signs somebody up and returns the Cookie header their browser would send. */
  const enrol = async (username: string): Promise<string> => {
    const response = await auth.api.signUpEmail({
      body: {
        email: `${username}@patternflow.local`,
        password: "smoke-test-password",
        name: username,
        username,
      },
      asResponse: true,
    });
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) throw new Error(`no session cookie for ${username}`);
    return setCookie.split(";")[0];
  };

  const author = await enrol("theauthor");
  const passerby = await enrol("passerby");
  const mod = await enrol("themod");

  const idOf = async (username: string) => {
    const rows = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.username, username))
      .limit(1);
    return rows[0]!.id;
  };
  const authorId = await idOf("theauthor");
  const passerbyId = await idOf("passerby");
  const modId = await idOf("themod");

  const now = new Date(Date.UTC(2026, 8, 25, 12, 0, 0));
  const pattern = (id: string, title: string, visibility: string) => ({
    id,
    userId: authorId,
    title,
    code: "// js",
    // A header gives the download route something to answer with, so a 404
    // below can only mean "you may not open this".
    codeCpp: "#pragma once // the author's",
    license: "CC-BY-SA-4.0",
    visibility,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.patterns).values([
    pattern("p-dup", "Posted Again", "public"),
    // Private by the author's own choice, from the start.
    pattern("p-own", "Kept To Myself", "private"),
  ]);
  // The passerby had already said something under it, and curates a deck
  // that carries it — both of which a take-down must leave honest.
  await db.insert(schema.comments).values({
    id: "c-early",
    patternId: "p-dup",
    userId: passerbyId,
    body: "nice",
    createdAt: now,
  });
  await db.insert(schema.decks).values([
    {
      id: "d-curated",
      userId: passerbyId,
      title: "Somebody Else's Running Order",
      visibility: "public",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "d-dup",
      userId: authorId,
      title: "Posted Again, As A Deck",
      visibility: "public",
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(schema.deckPatterns).values({
    deckId: "d-curated",
    patternId: "p-dup",
    position: 0,
    titleSnapshot: "Posted Again",
  });

  const patch = (route: typeof patternRoute | typeof deckRoute, kind: string) =>
    (id: string) =>
    (cookie: string, body: unknown) =>
      route.PATCH(
        new Request(`http://localhost:3000/api/community/${kind}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id }) },
      );
  const patchDup = patch(patternRoute, "patterns")("p-dup");
  const patchOwn = patch(patternRoute, "patterns")("p-own");
  const patchDeck = patch(deckRoute, "decks")("d-dup");

  const comment = (cookie: string, body: string) =>
    commentRoute.POST(
      new Request("http://localhost:3000/api/community/patterns/p-dup/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ body }),
      }),
      { params: Promise.resolve({ id: "p-dup" }) },
    );

  const fetchHeader = (cookie: string, id: string) =>
    headerRoute.GET(
      new Request(`http://localhost:3000/api/community/patterns/${id}/header`, {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id }) },
    );

  const patternRow = async (id: string) =>
    (await db.select().from(schema.patterns).where(eq(schema.patterns.id, id)))[0]!;
  const deckRow = async (id: string) =>
    (await db.select().from(schema.decks).where(eq(schema.decks.id, id)))[0]!;
  const commentsBy = async (userId: string) =>
    (await db.select().from(schema.comments).where(eq(schema.comments.userId, userId))).map(
      (row) => row.body,
    );
  const alerts = async (userId: string, types?: string[]) =>
    (await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)))
      .filter((row) => !types || types.includes(row.type))
      .map((row) => ({ type: row.type, target: row.targetId, snippet: row.snippet }));
  const onTheWall = async () => (await queries.listFeed()).map((item) => item.id);

  console.log("\n── taking a pattern off the wall ──");
  check(
    "a passer-by cannot",
    (await patchDup(passerby, { visibility: "private" })).status,
    403,
  );
  check(
    "a moderator cannot retitle it on the way down",
    (await patchDup(mod, { visibility: "private", title: "Renamed" })).status,
    403,
  );
  check(
    "nor touch its source",
    (await patchDup(mod, { visibility: "private", code: "// theirs now" })).status,
    403,
  );
  check(
    "nor post a reason longer than a comment",
    (await patchDup(mod, { visibility: "private", reason: "x".repeat(2001) })).status,
    400,
  );
  check("none of which moved it", (await patternRow("p-dup")).visibility, "public");

  check(
    "a moderator makes it private",
    (await patchDup(mod, { visibility: "private", reason: REASON })).status,
    200,
  );
  const down = await patternRow("p-dup");
  check("it is private", down.visibility, "private");
  check("and marked as a take-down", down.hiddenAt !== null, true);
  check("its work is untouched", [down.title, down.code, down.userId], [
    "Posted Again",
    "// js",
    authorId,
  ]);
  // The one private thing a moderator can open is what a moderator took
  // down — this goes through the real download route, so a route that forgot
  // to load the mark would lock the moderator out and fail here.
  check("the moderator can still open what they took down", (await fetchHeader(mod, "p-dup")).status, 200);
  check("a passer-by cannot", (await fetchHeader(passerby, "p-dup")).status, 404);
  check("it is off the wall", (await onTheWall()).includes("p-dup"), false);
  check("the reason is under it, in the moderator's name", await commentsBy(modId), [REASON]);
  check("the author is told, with the reason", await alerts(authorId), [
    { type: "hidden", target: "p-dup", snippet: REASON },
  ]);
  // One act, one row: the reason-comment must not fan out as a reply too.
  check("and nobody else hears about the comment", await alerts(passerbyId), []);
  check(
    "the deck carrying it says who took it down",
    (await queries.listDeckItems("d-curated", passerbyId)).map((item) => item.gap),
    ["hidden"],
  );
  check(
    "while its author still sees it there",
    (await queries.listDeckItems("d-curated", authorId)).map((item) => item.gap),
    [null],
  );

  console.log("\n── the author cannot put it back ──");
  const refused = await patchDup(author, { visibility: "public" });
  check("making it public is refused", refused.status, 403);
  check(
    "with a reason they can read",
    ((await refused.json()) as { error?: string }).error?.includes("until a moderator restores it"),
    true,
  );
  check("so it stays down", (await patternRow("p-dup")).visibility, "private");
  // The lab's Share sends a visibility with every update — private has to go
  // through, or a take-down would also freeze the author's own edits.
  check(
    "but it is still theirs to edit",
    (await patchDup(author, { title: "Posted Again, Fixed", visibility: "private" })).status,
    200,
  );
  const edited = await patternRow("p-dup");
  check("the edit landed", edited.title, "Posted Again, Fixed");
  check("and the mark stood through it", edited.hiddenAt !== null, true);

  console.log("\n── the thread under it ──");
  check("the moderator can still write there", (await comment(mod, "Happy to talk here.")).status, 201);
  check("a passer-by cannot — it is private", (await comment(passerby, "?")).status, 404);
  check("its author can answer", (await comment(author, "These are different patterns.")).status, 201);
  const modAlerts = (await queries.listNotifications(modId, { moderator: true })).map(
    (row) => `${row.type}:${row.targetId}`,
  );
  check("and the moderator hears the answer", modAlerts, ["thread:p-dup"]);
  check(
    "the passer-by does not, while it is private",
    (await queries.listNotifications(passerbyId)).length,
    0,
  );

  console.log("\n── putting it back ──");
  check(
    "a second take-down is refused",
    (await patchDup(mod, { visibility: "private" })).status,
    409,
  );
  check("a moderator restores it", (await patchDup(mod, { visibility: "public" })).status, 200);
  const back = await patternRow("p-dup");
  check("public again", back.visibility, "public");
  check("the mark is gone", back.hiddenAt, null);
  check("back on the wall", (await onTheWall()).includes("p-dup"), true);
  check(
    "and in its deck",
    (await queries.listDeckItems("d-curated", passerbyId)).map((item) => item.gap),
    [null],
  );
  check(
    "the author hears that too",
    (await alerts(authorId, ["hidden", "restored"])).map((row) => row.type),
    ["hidden", "restored"],
  );
  check(
    "and may take it private themselves again",
    (await patchDup(author, { visibility: "private" })).status,
    200,
  );
  check("which is no take-down", (await patternRow("p-dup")).hiddenAt, null);
  check("so it is closed to the moderator now", (await fetchHeader(mod, "p-dup")).status, 404);
  check("the thread under it too", (await comment(mod, "Still there?")).status, 404);
  check(
    "and so are their alerts about it",
    (await queries.listNotifications(modId, { moderator: true })).map((row) => row.targetId),
    [],
  );
  check(
    "so a moderator cannot publish it",
    (await patchDup(mod, { visibility: "public" })).status,
    403,
  );

  console.log("\n── what its author made private ──");
  check("a moderator cannot open it", (await fetchHeader(mod, "p-own")).status, 404);
  check("while its author can", (await fetchHeader(author, "p-own")).status, 200);
  check(
    "a moderator cannot publish it",
    (await patchOwn(mod, { visibility: "public" })).status,
    403,
  );
  check(
    "nor mark it, locking its author out",
    (await patchOwn(mod, { visibility: "private" })).status,
    409,
  );
  const own = await patternRow("p-own");
  check("it is exactly as its author left it", [own.visibility, own.hiddenAt], ["private", null]);
  check("and theirs to publish", (await patchOwn(author, { visibility: "public" })).status, 200);

  console.log("\n── a deck ──");
  check(
    "a moderator cannot rename it",
    (await patchDeck(mod, { title: "Renamed" })).status,
    403,
  );
  check(
    "a moderator makes it private",
    (await patchDeck(mod, { visibility: "private", reason: "Repeats another deck." })).status,
    200,
  );
  const deckDown = await deckRow("d-dup");
  check("it is private and marked", [deckDown.visibility, deckDown.hiddenAt !== null], [
    "private",
    true,
  ]);
  check("its title is untouched", deckDown.title, "Posted Again, As A Deck");
  check(
    "the author is told, with the reason",
    await alerts(authorId, ["hidden"]).then((rows) => rows.filter((row) => row.target === "d-dup")),
    [{ type: "hidden", target: "d-dup", snippet: "Repeats another deck." }],
  );
  check(
    "the author cannot make it public",
    (await patchDeck(author, { visibility: "public" })).status,
    403,
  );
  check("a moderator restores it", (await patchDeck(mod, { visibility: "public" })).status, 200);
  const deckBack = await deckRow("d-dup");
  check("public again, unmarked", [deckBack.visibility, deckBack.hiddenAt], ["public", null]);
}

main()
  .then(() => {
    console.log(
      failures === 0 ? "\nAll take-down checks passed.\n" : `\n${failures} check(s) FAILED.\n`,
    );
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });
