import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

// The title is written into the `// Title:` line of the licence header baked
// into the stored source, and a fork writes its parent's title into its own
// `// Based on:` line. On 26 October a title with a line feed and one line of
// JavaScript after it was published with 201, and the stored source ran that
// line. Forked, the fork ran it too, under the forker's name. Driven through
// the real routes with real sessions, on a database of its own.

const ENV_KEYS = ["COMMUNITY_DB_PATH", "COMMUNITY_ENABLED", "BETTER_AUTH_SECRET"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let tmp = "";

/** Signs somebody up and returns their user id and Cookie header. */
let enrol: (username: string) => Promise<{ id: string; cookie: string }>;
/** Puts a pattern straight into the table, as a past publish left it. */
let seed: (row: { id: string; userId: string; title: string; code: string }) => Promise<void>;
let publish: (cookie: string, body: Record<string, unknown>) => Promise<{ status: number; id?: string; error?: string }>;
let edit: (cookie: string, patternId: string, body: Record<string, unknown>) => Promise<number>;
let storedCode: (patternId: string) => Promise<string>;

/** The licence block, from its opening rule to its closing one. */
function header(code: string): string[] {
  const lines = code.split(/\r\n|[\n\r\u2028\u2029]/);
  const start = lines.indexOf("// ===== Patternflow pattern =====");
  const end = lines.findIndex((line, index) => index > start && /^\/\/ =+$/.test(line));
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return lines.slice(start, end + 1);
}

/** Runs the source's top level and returns what it wrote to `ran`. */
function run(code: string): string[] {
  const ran: string[] = [];
  new Function("ran", code)(ran);
  return ran;
}

beforeAll(async () => {
  // The database is a lazy singleton keyed off these variables, so they are
  // set before anything imports it.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-pattern-title-"));
  process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
  process.env.COMMUNITY_ENABLED = "1";
  process.env.BETTER_AUTH_SECRET = "pattern-title-test-secret-not-a-real-one";

  const { eq } = await import("drizzle-orm");
  const { getAuth } = await import("@/lib/community/server/auth");
  const { getDb } = await import("@/lib/community/server/db");
  const schema = await import("@/lib/community/server/schema");
  const listRoute = await import("./route");
  const patternRoute = await import("./[id]/route");

  const db = getDb();
  const auth = getAuth();

  enrol = async (username) => {
    const response = await auth.api.signUpEmail({
      body: {
        email: `${username}@patternflow.local`,
        password: "pattern-title-test-password",
        name: username,
        username,
      },
      asResponse: true,
    });
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) throw new Error(`no session cookie for ${username}`);
    const [author] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.username, username))
      .limit(1);
    return { id: author!.id, cookie: setCookie.split(";")[0] };
  };

  seed = async ({ id, userId, title, code }) => {
    const now = new Date();
    await db.insert(schema.patterns).values({
      id,
      userId,
      title,
      code,
      license: "CC-BY-SA-4.0",
      visibility: "public",
      createdAt: now,
      updatedAt: now,
    });
  };

  // No Origin header below, which is the same-origin case originBlocked()
  // lets through.
  publish = async (cookie, body) => {
    const response = await listRoute.POST(
      new Request("http://localhost:3000/api/community/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify(body),
      }),
    );
    const payload = (await response.json()) as { id?: string; error?: string };
    return { status: response.status, ...payload };
  };

  edit = async (cookie, patternId, body) => {
    const response = await patternRoute.PATCH(
      new Request(`http://localhost:3000/api/community/patterns/${patternId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: patternId }) },
    );
    return response.status;
  };

  storedCode = async (patternId) => {
    const [row] = await db
      .select({ code: schema.patterns.code })
      .from(schema.patterns)
      .where(eq(schema.patterns.id, patternId))
      .limit(1);
    return row!.code;
  };
}, 30_000);

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

it.each([
  ["a line feed", "\n"],
  ["a carriage return", "\r"],
  ["a line separator", "\u2028"],
  ["a paragraph separator", "\u2029"],
])("refuses to publish a title broken by %s", async (_, lineBreak) => {
  const gus = await enrol(`gus_${lineBreak.charCodeAt(0)}`);
  const refused = await publish(gus.cookie, {
    title: `Tide${lineBreak}ran.push("title");`,
    code: "function draw() {}",
  });
  expect(refused).toEqual({
    status: 400,
    error: "Title is required (one line, max 80 chars, no control characters).",
  });
}, 30_000);

it("keeps a title stored before the refusal out of its fork's code", async () => {
  const ada = await enrol("ada");
  const eve = await enrol("eve");
  // What a publish with this title stored before 26 October: the title's
  // second line sits between the comments as a line of code.
  const title = 'Tide\nran.push("parent title");';
  const pastCode = [
    "// ===== Patternflow pattern =====",
    "// Title:    Tide",
    'ran.push("parent title");',
    "// Author:   @ada",
    "// Date:     2026-10-20",
    "// SPDX-License-Identifier: CC-BY-SA-4.0",
    "// ===============================",
    "",
    "function draw() {}",
  ].join("\n");
  await seed({ id: "p-ada", userId: ada.id, title, code: pastCode });
  expect(run(pastCode)).toEqual(["parent title"]);

  // Forking sends the parent's stored source as the new pattern's code.
  const fork = await publish(eve.cookie, { title: "Tide again", code: pastCode, parentId: "p-ada" });
  expect(fork.status).toBe(201);
  const forkCode = await storedCode(fork.id!);
  expect(header(forkCode)).toHaveLength(7);
  expect(header(forkCode).every((line) => line.startsWith("//"))).toBe(true);
  expect(header(forkCode)[3]).toMatch(/^\/\/ Based on: "Tide ran\.push\("parent title"\);" by @ada — /);
  expect(run(forkCode)).toEqual([]);

  // The parent's own source is rebuilt on its author's next edit.
  expect(await edit(ada.cookie, "p-ada", { description: "Low tide." })).toBe(200);
  const healed = await storedCode("p-ada");
  expect(header(healed)).toHaveLength(6);
  expect(header(healed).every((line) => line.startsWith("//"))).toBe(true);
  expect(run(healed)).toEqual([]);
}, 30_000);
