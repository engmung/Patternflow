/**
 * Workshop smoke test — `npm run check:workshop`.
 *
 * Against a throwaway SQLite file. What this guards: a pin is a subscription
 * (new thread notifies exactly the pinned, never the author), re-pinning edits
 * the note without restarting "since", the filename sanitiser stops traversal
 * and header injection, the byte sniffer only ever says "image" about real
 * raster images, and a deleted thread's attachment bytes actually leave the
 * disk once the sweep runs.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The database is a lazy singleton keyed off this variable, so it has to be set
// before anything imports it — hence the dynamic imports below.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-workshop-"));
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
  const workshop = await import("../src/lib/community/workshop");
  const { attachmentDir, attachmentPath, sniffImage } = await import(
    "../src/lib/community/attachments"
  );
  const { sweepOrphanAttachments } = await import("../src/lib/community/retention");

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
  await db.insert(schema.territories).values({
    id: "z1",
    code: "A1",
    title: "Wired control",
    createdAt: ago(20),
  });
  await db.insert(schema.territoryPins).values([
    { id: "pin-a", territoryId: "z1", userId: "alice", note: "OSC bridge", createdAt: ago(5) },
    { id: "pin-b", territoryId: "z1", userId: "bob", note: null, createdAt: ago(3) },
  ]);

  // ── Pin = subscription ────────────────────────────────────────────────────
  await db.insert(schema.posts).values({
    id: "t1",
    territoryId: "z1",
    userId: "alice",
    title: "First bytes over the wire",
    body: "hello",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await notify.notifyNewThread({
    territoryId: "z1",
    territoryLabel: "A1 · Wired control",
    postId: "t1",
    postTitle: "First bytes over the wire",
    actorId: "alice",
  });

  const rows = await db.select().from(schema.notifications);
  check("new thread notifies exactly the other pinned person", rows.length, 1);
  check("…and it is bob", rows[0]?.userId, "bob");
  check("…as a territory row", rows[0]?.type, "territory");
  check("…carrying where", rows[0]?.snippet, "A1 · Wired control");
  check("…pointing at the thread", [rows[0]?.targetType, rows[0]?.targetId], ["post", "t1"]);

  // Unpinned bystanders hear nothing; the author never hears about themselves.
  check(
    "cara (not pinned) got nothing",
    rows.some((row) => row.userId === "cara"),
    false,
  );

  // ── Correlated counts ─────────────────────────────────────────────────────
  // These shipped as zero once: drizzle renders `${table.column}` unqualified,
  // and SQLite bound the bare `id` to the INNER table's own id column. The
  // node counts are the workshop's entire face, so they get asserted against
  // known contents.
  const zones = await queries.listTerritories();
  check("territory counts see the pins", zones[0]?.pinCount, 2);
  check("…and the thread", zones[0]?.threadCount, 1);
  const drawerThreads = await queries.listPosts({ territoryId: "z1", limit: 6 });
  check("reply count starts at zero, not undefined", drawerThreads[0]?.commentCount, 0);
  await db.insert(schema.postComments).values({
    id: "c1",
    postId: "t1",
    userId: "bob",
    body: "tried it — works at 115200",
    createdAt: NOW,
  });
  const withReply = await queries.listPosts({ territoryId: "z1", limit: 6 });
  check("…and counts the reply", withReply[0]?.commentCount, 1);
  const recent = await queries.listRecentThreads();
  check("the latest strip carries where", recent[0]?.territoryCode, "A1");

  // ── Re-pin edits the note, keeps "since" ──────────────────────────────────
  await db
    .insert(schema.territoryPins)
    .values({ id: "pin-a2", territoryId: "z1", userId: "alice", note: "MIDI too", createdAt: NOW })
    .onConflictDoUpdate({
      target: [schema.territoryPins.territoryId, schema.territoryPins.userId],
      set: { note: "MIDI too" },
    });
  const alicePin = (
    await db
      .select()
      .from(schema.territoryPins)
      .where(eq(schema.territoryPins.userId, "alice"))
  )[0];
  check("re-pin updates the note", alicePin?.note, "MIDI too");
  check("…without restarting since", alicePin?.createdAt.getTime(), ago(5).getTime());

  // ── Filename sanitiser ────────────────────────────────────────────────────
  check("traversal keeps only the basename", workshop.cleanFilename("..\\..\\front.dxf"), "front.dxf");
  check("unix traversal too", workshop.cleanFilename("../../etc/passwd"), "passwd");
  check("leading dots come off", workshop.cleanFilename("...hidden.png"), "hidden.png");
  check(
    "quotes and controls come out",
    workshop.cleanFilename('to\u0000ler"an\u001fces.md'),
    "tolerances.md",
  );
  check("nothing left means null", workshop.cleanFilename('"\u0001.'), null);
  check("allowlist takes dxf", workshop.attachmentAllowed("front.dxf"), true);
  check("allowlist takes uppercase PNG", workshop.attachmentAllowed("shot.PNG"), true);
  check("allowlist refuses exe", workshop.attachmentAllowed("run.exe"), false);
  check("svg is a file, not an image", workshop.isImageFilename("logo.svg"), false);
  check("jpeg is an image", workshop.isImageFilename("bench.JPG"), true);

  // ── Territory validators ──────────────────────────────────────────────────
  // The admin editor is the only way to draw the map now, so its cleaners are
  // the only thing between a typo and a broken front page.
  check("code accepts A1", workshop.cleanTerritoryCode("a1"), "A1");
  check("code accepts two digits", workshop.cleanTerritoryCode("B12"), "B12");
  check("code refuses a word", workshop.cleanTerritoryCode("hardware"), null);
  check("code refuses a bare letter", workshop.cleanTerritoryCode("A"), null);
  check("title collapses whitespace", workshop.cleanTerritoryTitle("  Wired   control "), "Wired control");
  check("empty title is refused", workshop.cleanTerritoryTitle("   "), undefined);
  check("blank description is null", workshop.cleanTerritoryDescription("  "), null);
  check("span 2 is fine", workshop.cleanSpan("2"), 2);
  check("span 7 is not", workshop.cleanSpan(7), undefined);
  check("span 1 is not", workshop.cleanSpan(1), undefined);
  check("coords clamp rather than refuse", workshop.cleanStageCoord(99999, "x"), 1440);
  check("…on both ends", workshop.cleanStageCoord(-40, "y"), 0);
  check("coords refuse nonsense", workshop.cleanStageCoord("over there", "x"), undefined);
  check(
    "questions keep at most four lines",
    workshop.cleanQuestions("a\nb\n\nc\nd\ne"),
    "a\nb\nc\nd",
  );
  check("no questions is null", workshop.cleanQuestions(""), null);

  // A question three characters over the cap used to 400 the whole save — the
  // description edit in the same body went with it, and the reason landed in a
  // banner at the top of a list you had scrolled past. The cap is still a cap;
  // what changed is that the editor knows it, and can say which line.
  const long = "x".repeat(workshop.QUESTION_MAX + 1);
  check("a question at the cap is fine", workshop.cleanQuestions("x".repeat(workshop.QUESTION_MAX)) !== undefined, true);
  check("one over is refused", workshop.cleanQuestions(long), undefined);
  check("…and names the line", workshop.overlongQuestion(`ok\n${long}`), long);
  check("nothing over means nothing to name", workshop.overlongQuestion("ok\nfine"), null);
  check(
    "a long fifth line is dropped, not fatal",
    workshop.cleanQuestions(`a\nb\nc\nd\n${long}`),
    "a\nb\nc\nd",
  );
  check("the editor's cap is the route's cap", workshop.QUESTION_MAX, 60);

  // ── Presence ──────────────────────────────────────────────────────────────
  // The map's people layer. Presence is not a pin — walking somewhere must
  // never touch subscriptions — so it gets its own table and its own checks.
  await db.insert(schema.presence).values({
    userId: "alice",
    x: 900,
    y: 200,
    status: "soldering",
    updatedAt: NOW,
  });
  const standing = await queries.listPresence();
  check("presence carries the handle", standing[0]?.username, "alice");
  check("…and the spot", [standing[0]?.x, standing[0]?.y], [900, 200]);
  check("…and the words", standing[0]?.status, "soldering");
  check("the unmoved are everyone else", await queries.countUnmoved(), 2);

  // Moving again is an update, not a second body.
  await db
    .insert(schema.presence)
    .values({ userId: "alice", x: 300, y: 500, status: null, updatedAt: NOW })
    .onConflictDoUpdate({
      target: schema.presence.userId,
      set: { x: 300, y: 500, updatedAt: NOW },
    });
  const walked = await queries.listPresence();
  check("walking moves the one square", walked.length, 1);
  check("…to the new spot", [walked[0]?.x, walked[0]?.y], [300, 500]);
  check("…without dropping the words", walked[0]?.status, "soldering");

  check("status collapses whitespace", workshop.cleanStatus("  taking   a walk "), "taking a walk");
  check("empty status clears to null", workshop.cleanStatus("   "), null);
  check("a long status is refused", workshop.cleanStatus("x".repeat(61)), undefined);
  check("at the cap it fits", workshop.cleanStatus("x".repeat(60)), "x".repeat(60));

  // ── Markdown links ────────────────────────────────────────────────────────
  // Posts render as markdown now, so every href in one was typed by a member.
  // react-markdown has its own urlTransform; this is ours, and it is the one
  // PostBody actually calls.
  const { safeHref } = await import("../src/lib/community/markdown");
  check("https passes through", safeHref("https://example.com/a"), "https://example.com/a");
  check("http too", safeHref("http://example.com"), "http://example.com");
  check("javascript: is refused", safeHref("javascript:alert(1)"), null);
  check("…with padding", safeHref("  JaVaScRiPt:alert(1)"), null);
  check("…and with a tab inside the scheme", safeHref("java\tscript:alert(1)"), null);
  check("…and with a NUL inside it", safeHref("java\u0000script:alert(1)"), null);
  check("data: is refused", safeHref("data:text/html;base64,PHNjcmlwdD4="), null);
  check("vbscript: is refused", safeHref("vbscript:msgbox"), null);
  check("file: is refused", safeHref("file:///etc/passwd"), null);
  check("protocol-relative is refused, not upgraded", safeHref("//evil.example/x"), null);
  check("a relative path is fine", safeHref("/community/patterns"), "/community/patterns");
  check("an anchor is fine", safeHref("#results"), "#results");
  check("a colon after a slash is a path, not a scheme", safeHref("notes/a:b"), "notes/a:b");
  check("empty is nothing", safeHref(""), null);
  check("undefined is nothing", safeHref(undefined), null);

  // ── Byte sniffing ─────────────────────────────────────────────────────────
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16),
  ]);
  check("png magic sniffs as png", sniffImage(png), "image/png");
  check("text never sniffs as an image", sniffImage(Buffer.from("<svg onload=alert(1)>")), null);
  check("short buffers are nothing", sniffImage(Buffer.from([0x89, 0x50])), null);

  // ── Cascade + orphan sweep ────────────────────────────────────────────────
  const fileId = "aaaaaaaaaaaaaaaa";
  const orphanId = "bbbbbbbbbbbbbbbb";
  fs.mkdirSync(attachmentDir(), { recursive: true });
  fs.writeFileSync(attachmentPath(fileId), png);
  fs.writeFileSync(attachmentPath(orphanId), Buffer.from("leftover"));
  await db.insert(schema.postAttachments).values({
    id: fileId,
    postId: "t1",
    commentId: null,
    userId: "alice",
    filename: "shot.png",
    bytes: png.length,
    createdAt: NOW,
  });

  // Deleting the thread takes its attachment ROW with it (foreign keys)…
  await db.delete(schema.posts).where(eq(schema.posts.id, "t1"));
  const remainingRows = await db.select().from(schema.postAttachments);
  check("deleting the thread cascades the attachment row", remainingRows.length, 0);

  // …and the sweep takes the BYTES, once they are past the grace window.
  // The files' mtimes are pinned to the fixture clock — the real clock is
  // days ahead of NOW, and the grace check compares against mtime.
  fs.utimesSync(attachmentPath(fileId), NOW, NOW);
  fs.utimesSync(attachmentPath(orphanId), NOW, NOW);
  const early = await sweepOrphanAttachments(NOW);
  check("inside the grace window nothing is touched", early.deleted, 0);
  fs.utimesSync(attachmentPath(fileId), ago(2), ago(2));
  fs.utimesSync(attachmentPath(orphanId), ago(2), ago(2));
  const late = await sweepOrphanAttachments(NOW);
  check("past it, both orphans go", late.deleted, 2);
  check("…and the directory is actually empty", fs.readdirSync(attachmentDir()).length, 0);
  check("…with no errors", late.errors, []);

  console.log(failures === 0 ? "\nAll workshop checks passed." : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
