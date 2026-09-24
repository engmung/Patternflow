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
  const { getDb } = await import("../src/lib/community/server/db");
  const { artifactDir } = await import("../src/lib/community/server/builds");
  const {
    sweepRetention,
    sweepModuleCache,
    SESSION_MAX_AGE_DAYS,
    BUILD_MAX_AGE_DAYS,
    MODULE_CACHE_MAX_IDLE_DAYS,
    MODULE_CACHE_OLD_TOOLCHAIN_DAYS,
  } = await import("../src/lib/community/server/retention");
  const { sourceSha } = await import("../src/lib/community/server/moduleCache");
  const schema = await import("../src/lib/community/server/schema");

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
    // A bake is an ordinary builds row for this rule: its product lives in
    // module_cache, which has rules of its own below.
    { id: "b-bake-old", userId: "u1", status: "done", format: "pfm", kind: "bake", sourceSha: "x", patterns: "[]", createdAt: ago(BUILD_MAX_AGE_DAYS + 1) },
  ]);

  // ── Module cache ───────────────────────────────────────────────────────────
  // A header is "live" while it is on the site: a pattern's own .h, or a port
  // that has not gone stale. Rows are keyed by the header's hash.
  const LIVE_OWN = "#pragma once // the author's own";
  const LIVE_PORT = "#pragma once // a live port";
  const STALE_PORT = "#pragma once // a port of an older version";
  await db.insert(schema.patterns).values({
    id: "p1", userId: "u1", title: "Live", code: "// js", codeCpp: LIVE_OWN,
    license: "CC-BY-SA-4.0", visibility: "public", createdAt: ago(100), updatedAt: ago(100),
  });
  await db.insert(schema.patternHeaders).values([
    { id: "h-live", patternId: "p1", userId: "u1", codeCpp: LIVE_PORT, createdAt: ago(90) },
    { id: "h-stale", patternId: "p1", userId: "u1", codeCpp: STALE_PORT, stale: true, createdAt: ago(95) },
  ]);

  // With no revision published, nothing counts as an old toolchain.
  const noRev = await sweepModuleCache(NOW, true);
  check("no worker has run: no toolchain is 'old'", noRev.oldToolchain, 0);

  await db.insert(schema.buildMeta).values({ key: "builder_rev", value: "rev-now", updatedAt: ago(20) });
  const moduleRow = (key: string, sha: string, rev: string, usedDaysAgo: number) => ({
    sourceSha: sha,
    builderRev: rev,
    status: "done",
    slug: key,
    namespace: key,
    name: key,
    pfm: Buffer.from(key),
    sidecar: "{}",
    bytes: key.length,
    createdAt: ago(usedDaysAgo + 1),
    usedAt: ago(usedDaysAgo),
  });
  await db.insert(schema.moduleCache).values([
    // Live headers stay however long ago they were last served.
    moduleRow("own-live", sourceSha(LIVE_OWN), "rev-now", MODULE_CACHE_MAX_IDLE_DAYS + 10),
    moduleRow("port-live", sourceSha(LIVE_PORT), "rev-now", MODULE_CACHE_MAX_IDLE_DAYS + 10),
    // A stale port is not what the pattern ships any more.
    moduleRow("port-stale", sourceSha(STALE_PORT), "rev-now", MODULE_CACHE_MAX_IDLE_DAYS + 1),
    // A header that left the site (edited, withdrawn, deleted) — goes 30
    // days after it was last served…
    moduleRow("gone-old", sourceSha("#pragma once // removed long ago"), "rev-now", MODULE_CACHE_MAX_IDLE_DAYS + 1),
    // …and not a day sooner.
    moduleRow("gone-recent", sourceSha("#pragma once // removed last week"), "rev-now", MODULE_CACHE_MAX_IDLE_DAYS - 1),
    // An older toolchain: a week without use and it goes, live or not…
    moduleRow("old-rev", sourceSha(LIVE_OWN), "rev-before", MODULE_CACHE_OLD_TOOLCHAIN_DAYS + 1),
    // …but not while a rollback could still want it.
    moduleRow("old-rev-recent", sourceSha(LIVE_OWN), "rev-before-2", MODULE_CACHE_OLD_TOOLCHAIN_DAYS - 2),
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
  check("three old builds removed, the bake among them", result.oldBuilds, 3);
  const remaining = (await db.select({ id: schema.builds.id }).from(schema.builds)).map((r) => r.id);
  check("the recent build survives", remaining, ["b-new"]);

  console.log("\n── artifact files ──");
  check("old artifact deleted", fs.existsSync(path.join(dir, "b-old.zip")), false);
  check("recent artifact kept", fs.existsSync(path.join(dir, "b-new.zip")), true);
  check("orphan deleted", fs.existsSync(path.join(dir, "orphan.zip")), false);
  check("in-flight file left alone", fs.existsSync(path.join(dir, "inflight.zip")), true);
  check("artifact deletions counted", result.artifactFilesDeleted, 1);
  check("orphan deletions counted", result.orphanFilesDeleted, 1);

  console.log("\n── compiled module cache ──");
  const modules = (await db.select({ slug: schema.moduleCache.slug }).from(schema.moduleCache))
    .map((row) => row.slug)
    .sort();
  check("live headers keep their modules; the rest go on schedule", modules, [
    "gone-recent",
    "old-rev-recent",
    "own-live",
    "port-live",
  ]);
  check("old-toolchain rows counted", result.oldToolchainModules, 1);
  check("no-longer-published rows counted (stale port included)", result.unpublishedModules, 2);

  console.log("\n── re-running is safe ──");
  const second = await sweepRetention(NOW);
  check(
    "second pass finds nothing",
    [second.expiredSessions, second.oldSessions, second.oldBuilds, second.oldToolchainModules, second.unpublishedModules],
    [0, 0, 0, 0, 0],
  );
  check("no errors on either pass", [...result.errors, ...second.errors], []);
  check("the live session is still there", (await db.select({ id: schema.session.id }).from(schema.session)).length, 1);
}

// Clean up BEFORE exiting — process.exit() ends the process there and then, so
// a .finally() after it never ran and every run left its database behind.
// The database is closed first: Windows will not delete an open SQLite file.
main()
  .catch((error: unknown) => {
    console.error(error);
    failures += 1;
  })
  .finally(async () => {
    try {
      const { getDb } = await import("../src/lib/community/server/db");
      getDb().$client.close();
    } catch {
      // never opened
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(
      failures === 0 ? "\nAll retention checks passed.\n" : `\n${failures} check(s) FAILED.\n`,
    );
    process.exit(failures === 0 ? 0 : 1);
  });
