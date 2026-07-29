/**
 * Retention smoke test — `npm run check:retention`.
 *
 * Runs against a throwaway SQLite file, never the real database. The logic here
 * is entirely SQL cutoffs and file deletion, so testing it without a database
 * would only test that the function exists.
 *
 * What this is really guarding: a sweep that deletes too little quietly makes
 * /terms a lie, and a sweep that deletes too much quietly destroys people's
 * work. Both failures are silent, which is why the boundaries are pinned.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The database is a lazy singleton keyed off this variable, so it has to be set
// before anything imports it — hence the dynamic imports below.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-retention-"));
process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
process.env.COMMUNITY_ENABLED = "1";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-07-29T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY);

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
  const { artifactDir } = await import("../src/lib/community/builds");
  const { sweepRetention, SESSION_MAX_AGE_DAYS, BUILD_MAX_AGE_DAYS } = await import(
    "../src/lib/community/retention"
  );
  const schema = await import("../src/lib/community/schema");

  const db = getDb();
  const dir = artifactDir();
  fs.mkdirSync(dir, { recursive: true });

  // ── Seed ───────────────────────────────────────────────────────────────────
  await db.insert(schema.user).values({
    id: "u1",
    name: "tester",
    email: "tester@patternflow.local",
    emailVerified: false,
    createdAt: ago(400),
    updatedAt: ago(400),
    username: "tester",
    displayUsername: "tester",
  });

  await db.insert(schema.session).values([
    // Past its own expiry — goes.
    { id: "s-expired", token: "t1", userId: "u1", createdAt: ago(10), updatedAt: ago(10), expiresAt: ago(1) },
    // Still valid by its token, but older than the 90-day cap — goes anyway.
    { id: "s-ancient", token: "t2", userId: "u1", createdAt: ago(SESSION_MAX_AGE_DAYS + 5), updatedAt: ago(1), expiresAt: ahead(30) },
    // Current — must survive. Deleting this signs a real person out.
    { id: "s-live", token: "t3", userId: "u1", createdAt: ago(2), updatedAt: ago(2), expiresAt: ahead(28) },
  ]);

  await db.insert(schema.verification).values([
    { id: "v-old", identifier: "a", value: "x", expiresAt: ago(1), createdAt: ago(2) },
    { id: "v-live", identifier: "b", value: "y", expiresAt: ahead(1), createdAt: NOW },
  ]);

  await db.insert(schema.builds).values([
    { id: "b-old", userId: "u1", status: "done", format: "pfm", patterns: "[]", artifact: "b-old.zip", artifactBytes: 1000, createdAt: ago(BUILD_MAX_AGE_DAYS + 1) },
    { id: "b-new", userId: "u1", status: "done", format: "pfm", patterns: "[]", artifact: "b-new.zip", artifactBytes: 2000, createdAt: ago(1) },
    // Never finished — no finishedAt. Must still age out, or a crash makes a
    // row immortal.
    { id: "b-stuck", userId: "u1", status: "running", format: "bin", patterns: "[]", createdAt: ago(BUILD_MAX_AGE_DAYS + 2) },
  ]);

  fs.writeFileSync(path.join(dir, "b-old.zip"), "old");
  fs.writeFileSync(path.join(dir, "b-new.zip"), "new");
  // Referenced by nothing, and old enough to be past the grace window.
  fs.writeFileSync(path.join(dir, "orphan.zip"), "orphan");
  fs.utimesSync(path.join(dir, "orphan.zip"), ago(3), ago(3));
  // Also unreferenced, but written moments ago — this is what a build in flight
  // looks like, and deleting it would corrupt a running job.
  fs.writeFileSync(path.join(dir, "inflight.zip"), "inflight");

  // ── Sweep ──────────────────────────────────────────────────────────────────
  const result = await sweepRetention(NOW);

  console.log("\n── sessions ──");
  check("expired session removed", result.expiredSessions, 1);
  check("session over the cap removed", result.oldSessions, 1);
  const sessions = (await db.select({ id: schema.session.id }).from(schema.session)).map((r) => r.id);
  check("the live session survives", sessions, ["s-live"]);

  console.log("\n── verification tokens ──");
  check("expired token removed", result.expiredVerifications, 1);
  const tokens = (await db.select({ id: schema.verification.id }).from(schema.verification)).map((r) => r.id);
  check("the live token survives", tokens, ["v-live"]);

  console.log("\n── builds ──");
  check("two old builds removed", result.oldBuilds, 2);
  const remaining = (await db.select({ id: schema.builds.id }).from(schema.builds)).map((r) => r.id);
  check("the recent build survives", remaining, ["b-new"]);

  console.log("\n── artifact files ──");
  check("old artifact deleted", fs.existsSync(path.join(dir, "b-old.zip")), false);
  check("recent artifact kept", fs.existsSync(path.join(dir, "b-new.zip")), true);
  check("orphan deleted", fs.existsSync(path.join(dir, "orphan.zip")), false);
  check("in-flight file left alone", fs.existsSync(path.join(dir, "inflight.zip")), true);
  check("artifact deletions counted", result.artifactFilesDeleted, 1);
  check("orphan deletions counted", result.orphanFilesDeleted, 1);

  console.log("\n── re-running is safe ──");
  const second = await sweepRetention(NOW);
  check("second pass finds nothing", [second.expiredSessions, second.oldSessions, second.oldBuilds], [0, 0, 0]);
  check("no errors on either pass", [...result.errors, ...second.errors], []);
  check("the live session is still there", (await db.select({ id: schema.session.id }).from(schema.session)).length, 1);
}

main()
  .then(() => {
    console.log(
      failures === 0 ? "\nAll retention checks passed.\n" : `\n${failures} check(s) FAILED.\n`,
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
