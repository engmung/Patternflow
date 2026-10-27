import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

// The atlas has been an archive since 26 October 2026. Its pins stay where
// their authors left them, so the route still reads them and refuses the
// writes that used to place, move and remove one, even from a moderator who
// could do all three until then. Driven through the real route with a real
// session and the Lab's Origin, on a database of its own.

const LAB_ORIGIN = "https://lab.patternflow.test";
const ENV_KEYS = [
  "COMMUNITY_DB_PATH",
  "COMMUNITY_ENABLED",
  "BETTER_AUTH_SECRET",
  "COMMUNITY_ADMIN_USERNAMES",
  "COMMUNITY_ALLOWED_ORIGINS",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let tmp = "";
let cookie = "";
let route: typeof import("./route");
let pinRows: () => Promise<{ patternId: string; x: number; y: number; entryId: string | null }[]>;

beforeAll(async () => {
  // The database is a lazy singleton keyed off these variables, so they are
  // set before anything imports it.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-atlas-archive-"));
  process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
  process.env.COMMUNITY_ENABLED = "1";
  process.env.BETTER_AUTH_SECRET = "atlas-archive-test-secret-not-a-real-one";
  process.env.COMMUNITY_ADMIN_USERNAMES = "ada";
  process.env.COMMUNITY_ALLOWED_ORIGINS = LAB_ORIGIN;

  const { eq } = await import("drizzle-orm");
  const { getAuth } = await import("@/lib/community/server/auth");
  const { getDb } = await import("@/lib/community/server/db");
  const schema = await import("@/lib/community/server/schema");
  route = await import("./route");

  const response = await getAuth().api.signUpEmail({
    body: { email: "ada@patternflow.local", password: "atlas-archive-test-password", name: "ada", username: "ada" },
    asResponse: true,
  });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("no session cookie for ada");
  cookie = setCookie.split(";")[0];

  const db = getDb();
  const [ada] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.username, "ada"))
    .limit(1);
  const now = new Date();
  for (const id of ["p1", "p2"]) {
    await db.insert(schema.patterns).values({
      id, userId: ada!.id, title: `ada's ${id}`, code: "// js", visibility: "public", createdAt: now, updatedAt: now,
    });
  }
  await db.insert(schema.atlasPins).values({ patternId: "p1", x: 40, y: 60, entryId: null, kind: "pin", updatedAt: now });

  pinRows = () =>
    db
      .select({
        patternId: schema.atlasPins.patternId,
        x: schema.atlasPins.x,
        y: schema.atlasPins.y,
        entryId: schema.atlasPins.entryId,
      })
      .from(schema.atlasPins);
}, 30_000);

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

const call = (method: "GET" | "POST" | "DELETE", body?: Record<string, unknown>) =>
  new Request("http://localhost:3000/api/community/atlas", {
    method,
    headers: { "Content-Type": "application/json", Origin: LAB_ORIGIN, cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

it.each([
  ["moving a pin", "POST", { patternId: "p1", x: 10, y: 10, entryId: null, kind: "pin" }],
  ["placing a new one", "POST", { patternId: "p2", x: 70, y: 20, entryId: null, kind: "pin" }],
  ["removing one", "DELETE", { patternId: "p1" }],
] as const)("refuses %s with a 405 the Lab can read", async (_, method, body) => {
  const response = await route[method](call(method, body));
  expect(response.status).toBe(405);
  expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LAB_ORIGIN);
  expect(await response.json()).toEqual({ error: "The atlas is an archive now, and its pins stay where they are." });
  expect(await pinRows()).toEqual([{ patternId: "p1", x: 40, y: 60, entryId: null }]);
});

it("still reads the pins", async () => {
  const response = await route.GET(call("GET"));
  expect(response.status).toBe(200);
  const { pins } = (await response.json()) as { pins: { patternId: string; x: number; y: number }[] };
  expect(pins.map(({ patternId, x, y }) => ({ patternId, x, y }))).toEqual([{ patternId: "p1", x: 40, y: 60 }]);
});
