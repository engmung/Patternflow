/**
 * Header-moderation smoke test — `npm run check:headermod`.
 *
 * What this guards: the one place in the community where a moderator EDITS
 * somebody else's upload instead of removing it (lib/community/admin.ts). It
 * drives the real route handlers with real Better Auth sessions, because the
 * thing worth testing is the permission branch, and a unit test of the helper
 * would pass just as happily with the branch wired up backwards.
 *
 * Three ways this could go wrong, all of them silent:
 *   - the moderator's reach leaks past the .h into the pattern itself
 *   - the porter or a passer-by gets the moderator's verb
 *   - the edit lands with no mark and no alert, so somebody's name ends up on
 *     code they never wrote
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The database is a lazy singleton keyed off these variables, so they have to
// be set before anything imports it — hence the dynamic imports below.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-headermod-"));
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

const HEADER = "#pragma once // the author's own";
const FIXED = "#pragma once // repaired by the moderator";

async function main() {
  const { eq } = await import("drizzle-orm");
  const { getAuth } = await import("../src/lib/community/auth");
  const { getDb } = await import("../src/lib/community/db");
  const schema = await import("../src/lib/community/schema");
  const patternRoute = await import("../src/app/api/community/patterns/[id]/route");
  const portRoute = await import("../src/app/api/community/ports/[id]/route");

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
    // One cookie, and only its name=value pair travels back up.
    return setCookie.split(";")[0];
  };

  const author = await enrol("theauthor");
  const porter = await enrol("theporter");
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
  const porterId = await idOf("theporter");

  const now = new Date(Date.UTC(2026, 7, 24, 12, 0, 0));
  await db.insert(schema.patterns).values({
    id: "p-1",
    userId: authorId,
    title: "Broken Port",
    code: "// js",
    codeCpp: HEADER,
    license: "CC-BY-SA-4.0",
    visibility: "public",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.patternHeaders).values({
    id: "port-1",
    patternId: "p-1",
    userId: porterId,
    codeCpp: "#pragma once // the porter's",
    note: "tested on v2.1",
    createdAt: now,
  });

  const patchPattern = (cookie: string, body: unknown) =>
    patternRoute.PATCH(
      new Request("http://localhost:3000/api/community/patterns/p-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "p-1" }) },
    );

  const patchPort = (cookie: string, body: unknown) =>
    portRoute.PATCH(
      new Request("http://localhost:3000/api/community/ports/port-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "port-1" }) },
    );

  const pattern = async () => {
    const rows = await db.select().from(schema.patterns).where(eq(schema.patterns.id, "p-1"));
    return rows[0]!;
  };
  const port = async () => {
    const rows = await db
      .select()
      .from(schema.patternHeaders)
      .where(eq(schema.patternHeaders.id, "port-1"));
    return rows[0]!;
  };
  const alerts = async (userId: string) =>
    (await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)))
      .map((row) => ({ type: row.type, snippet: row.snippet }));

  console.log("\n── the author's own .h ──");
  check("a stranger cannot touch it", (await patchPattern(porter, { codeCpp: FIXED })).status, 403);
  check("and it is untouched", (await pattern()).codeCpp, HEADER);

  check(
    "a moderator cannot retitle the pattern",
    (await patchPattern(mod, { title: "Renamed" })).status,
    403,
  );
  check(
    "nor rewrite its JavaScript alongside the header",
    (await patchPattern(mod, { codeCpp: FIXED, code: "// theirs now" })).status,
    403,
  );
  check(
    "nor take it private",
    (await patchPattern(mod, { codeCpp: FIXED, visibility: "private" })).status,
    403,
  );
  const untouched = await pattern();
  check("none of which changed anything", [untouched.title, untouched.codeCpp, untouched.code], [
    "Broken Port",
    HEADER,
    "// js",
  ]);

  check(
    "a moderator repairs the header",
    (await patchPattern(mod, { codeCpp: FIXED, reason: "did not compile" })).status,
    200,
  );
  const repaired = await pattern();
  check("the C++ is theirs now", repaired.codeCpp, FIXED);
  check("the pattern is still the author's", repaired.userId, authorId);
  check("and the JavaScript never moved", repaired.code, untouched.code);
  check("the row records the fix", repaired.cppModeratedAt !== null, true);
  check("the author is told, with the reason", await alerts(authorId), [
    { type: "header-fix", snippet: "did not compile" },
  ]);

  console.log("\n── the author takes their header back ──");
  check(
    "the author may still edit their own",
    (await patchPattern(author, { codeCpp: HEADER })).status,
    200,
  );
  check("and the moderator's mark clears", (await pattern()).cppModeratedAt, null);

  console.log("\n── dropping a header that cannot be saved ──");
  check("a moderator may remove it", (await patchPattern(mod, { codeCpp: "" })).status, 200);
  const dropped = await pattern();
  check("the .h is gone", dropped.codeCpp, null);
  check("with no mark left behind", dropped.cppModeratedAt, null);
  check("the pattern itself survives", dropped.title, "Broken Port");
  check(
    "and the author hears about that too",
    (await alerts(authorId)).map((row) => row.type),
    ["header-fix", "header-drop"],
  );
  // With the author's header gone, writing one back would not be a repair —
  // it would out-rank every community port and be credited to the author.
  check(
    "a moderator cannot attach one where there was none",
    (await patchPattern(mod, { codeCpp: FIXED })).status,
    403,
  );
  check("so the pattern stays bare", (await pattern()).codeCpp, null);

  console.log("\n── a community port ──");
  check("the porter cannot edit their own in place", (await patchPort(porter, { codeCpp: FIXED })).status, 403);
  check("a moderator cannot paste JavaScript into it", (await patchPort(mod, { codeCpp: "// js" })).status, 400);
  check("nor empty it — that is a delete", (await patchPort(mod, { codeCpp: "" })).status, 400);
  check("the port is still the porter's own", (await port()).codeCpp, "#pragma once // the porter's");

  check(
    "a moderator repairs it",
    (await patchPort(mod, { codeCpp: FIXED, reason: "missing include" })).status,
    200,
  );
  const fixedPort = await port();
  check("the C++ changed", fixedPort.codeCpp, FIXED);
  check("the credit did not", fixedPort.userId, porterId);
  check("the porter's note stands", fixedPort.note, "tested on v2.1");
  check("the row records the fix", fixedPort.moderatedAt !== null, true);
  check("and the porter is told", await alerts(porterId), [
    { type: "header-fix", snippet: "missing include" },
  ]);
}

main()
  .then(() => {
    console.log(
      failures === 0 ? "\nAll header-moderation checks passed.\n" : `\n${failures} check(s) FAILED.\n`,
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
