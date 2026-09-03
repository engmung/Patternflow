/**
 * Community-port smoke test — `npm run check:ports`.
 *
 * What this guards: which .h a pattern ships is a three-step resolution
 * (author's own > author's pin > oldest live port), the feed's "hardware
 * ready" chip and filter follow it, and a port of code that has since changed
 * stops resolving. Any of these failing silently ships the wrong C++ to
 * somebody's board.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The database is a lazy singleton keyed off this variable, so it has to be set
// before anything imports it — hence the dynamic imports below.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ports-"));
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
  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("../src/lib/community/server/db");
  const schema = await import("../src/lib/community/server/schema");
  const queries = await import("../src/lib/community/server/queries");
  const { resolveHeader } = await import("../src/lib/community/ports");

  const db = getDb();

  // ── The pure resolution order ──────────────────────────────────────────────
  const port = (id: string, day: number, stale = false) => ({
    id,
    userId: `u-${id}`,
    codeCpp: `#pragma once // ${id}`,
    note: null,
    stale,
    createdAt: at(day),
    username: id,
    displayUsername: id,
  });

  console.log("\n── which header ships ──");
  check("no header, no ports → nothing", resolveHeader({ codeCpp: null, pinnedHeaderId: null }, []), null);
  check(
    "the author's own header always wins",
    resolveHeader({ codeCpp: "#pragma once // own", pinnedHeaderId: "b" }, [port("a", 1), port("b", 2)])?.source,
    "author",
  );
  check(
    "without a pin, first come first served",
    (() => {
      const r = resolveHeader({ codeCpp: null, pinnedHeaderId: null }, [port("a", 1), port("b", 2)]);
      return r?.source === "port" ? r.portId : null;
    })(),
    "a",
  );
  check(
    "the author's pin overrides arrival order",
    (() => {
      const r = resolveHeader({ codeCpp: null, pinnedHeaderId: "b" }, [port("a", 1), port("b", 2)]);
      return r?.source === "port" ? r.portId : null;
    })(),
    "b",
  );
  check(
    "a stale port never resolves, even pinned",
    (() => {
      const r = resolveHeader({ codeCpp: null, pinnedHeaderId: "b" }, [port("a", 1), port("b", 2, true)]);
      return r?.source === "port" ? r.portId : null;
    })(),
    "a",
  );
  check(
    "a pin pointing at nothing falls back",
    (() => {
      const r = resolveHeader({ codeCpp: null, pinnedHeaderId: "gone" }, [port("a", 1)]);
      return r?.source === "port" ? r.portId : null;
    })(),
    "a",
  );
  check(
    "only stale ports → nothing ships",
    resolveHeader({ codeCpp: null, pinnedHeaderId: null }, [port("a", 1, true)]),
    null,
  );
  check(
    "the porter's handle rides along",
    (() => {
      const r = resolveHeader({ codeCpp: null, pinnedHeaderId: null }, [port("a", 1)]);
      return r?.source === "port" ? r.handle : null;
    })(),
    "a",
  );

  // ── The feed follows the same answer ───────────────────────────────────────
  const person = (id: string) => ({
    id,
    name: id,
    email: `${id}@patternflow.local`,
    emailVerified: false,
    createdAt: at(1),
    updatedAt: at(1),
    username: id,
    displayUsername: id,
  });
  await db.insert(schema.user).values([person("author"), person("porter")]);
  await db.insert(schema.patterns).values([
    {
      id: "p-ported",
      userId: "author",
      title: "Ported",
      code: "// js",
      license: "CC-BY-SA-4.0",
      visibility: "public",
      createdAt: at(2),
      updatedAt: at(2),
    },
    {
      id: "p-bare",
      userId: "author",
      title: "Bare",
      code: "// js",
      license: "CC-BY-SA-4.0",
      visibility: "public",
      createdAt: at(3),
      updatedAt: at(3),
    },
  ]);
  await db.insert(schema.patternHeaders).values({
    id: "port-1",
    patternId: "p-ported",
    userId: "porter",
    codeCpp: "#pragma once // port-1",
    createdAt: at(4),
  });

  console.log("\n── the feed's chip and filter follow it ──");
  const feed = await queries.listFeed();
  check(
    "a live port makes the pattern hardware ready",
    feed.find((item) => item.id === "p-ported")?.hasCpp,
    true,
  );
  check("a bare pattern stays bare", feed.find((item) => item.id === "p-bare")?.hasCpp, false);
  check(
    "the hardware filter agrees",
    (await queries.listFeed({ hardwareOnly: true })).map((item) => item.id),
    ["p-ported"],
  );
  check("and so does its count", await queries.countFeed(true), 1);

  console.log("\n── going stale takes it back out ──");
  await db
    .update(schema.patternHeaders)
    .set({ stale: true })
    .where(eq(schema.patternHeaders.id, "port-1"));
  check(
    "a stale-only pattern is no longer hardware ready",
    (await queries.listFeed()).find((item) => item.id === "p-ported")?.hasCpp,
    false,
  );
  check("the filter shows nothing", await queries.countFeed(true), 0);
  check(
    "but the port stays listed, marked",
    (await queries.listPatternPorts("p-ported")).map((row) => row.stale),
    [true],
  );

  console.log("\n── a moderator's repair is on the record ──");
  // A moderator may rewrite the C++ of a port that does not build, but the row
  // still carries the porter's name — so the page has to be able to say the
  // code changed hands. If this column stops travelling, the credit silently
  // becomes a lie (lib/community/admin.ts).
  check(
    "an untouched port carries no mark",
    (await queries.listPatternPorts("p-ported")).map((row) => row.moderatedAt),
    [null],
  );
  await db
    .update(schema.patternHeaders)
    .set({ codeCpp: "#pragma once // repaired", moderatedAt: at(9) })
    .where(eq(schema.patternHeaders.id, "port-1"));
  check(
    "a repaired one carries the date",
    (await queries.listPatternPorts("p-ported")).map((row) => row.moderatedAt?.toISOString() ?? null),
    [at(9).toISOString()],
  );
  check(
    "repairing does not un-stale it — the JS still moved",
    (await queries.listPatternPorts("p-ported")).map((row) => row.stale),
    [true],
  );
}

main()
  .then(() => {
    console.log(failures === 0 ? "\nAll port checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });
