import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

// `null` is valid JSON, so it got past the `catch` around every write route's
// `request.json()` and threw a TypeError on the first field read. Next.js
// answered that with a bare 500: no JSON saying why, and no CORS headers, so a
// Pattern Lab on another origin could not read even the status. Every route
// below is driven with a signed-in moderator and the Lab's Origin, on a
// database of its own, with something for each id in the path to find.

const LAB_ORIGIN = "https://lab.patternflow.test";
const ENV_KEYS = [
  "COMMUNITY_DB_PATH",
  "COMMUNITY_ENABLED",
  "BETTER_AUTH_SECRET",
  "COMMUNITY_ADMIN_USERNAMES",
  "COMMUNITY_ALLOWED_ORIGINS",
  "BUILD_ENABLED",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let tmp = "";
let cookie = "";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
type RouteModule = Record<string, unknown>;

// [method, path, module loader, path params]
const ROUTES: [string, string, () => Promise<RouteModule>, Record<string, string>][] = [
  ["POST", "atlas", () => import("./atlas/route"), {}],
  ["DELETE", "atlas", () => import("./atlas/route"), {}],
  ["POST", "builds", () => import("./builds/route"), {}],
  ["PATCH", "comments/c1?on=pattern", () => import("./comments/[id]/route"), { id: "c1" }],
  ["POST", "decks", () => import("./decks/route"), {}],
  ["PATCH", "decks/d1", () => import("./decks/[id]/route"), { id: "d1" }],
  ["PUT", "featured", () => import("./featured/route"), {}],
  ["POST", "patterns", () => import("./patterns/route"), {}],
  ["PATCH", "patterns/p1", () => import("./patterns/[id]/route"), { id: "p1" }],
  ["POST", "patterns/p1/comments", () => import("./patterns/[id]/comments/route"), { id: "p1" }],
  ["POST", "patterns/p1/header", () => import("./patterns/[id]/header/route"), { id: "p1" }],
  ["POST", "patterns/p1/performance", () => import("./patterns/[id]/performance/route"), { id: "p1" }],
  ["PATCH", "ports/h1", () => import("./ports/[id]/route"), { id: "h1" }],
  ["POST", "reports", () => import("./reports/route"), {}],
  ["PATCH", "reports/r1", () => import("./reports/[id]/route"), { id: "r1" }],
];

beforeAll(async () => {
  // The database is a lazy singleton keyed off these variables, so they are
  // set before anything imports it.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-null-body-"));
  process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
  process.env.COMMUNITY_ENABLED = "1";
  process.env.BETTER_AUTH_SECRET = "null-body-test-secret-not-a-real-one";
  process.env.COMMUNITY_ADMIN_USERNAMES = "ada";
  process.env.COMMUNITY_ALLOWED_ORIGINS = LAB_ORIGIN;
  process.env.BUILD_ENABLED = "1";

  const { eq } = await import("drizzle-orm");
  const { getAuth } = await import("@/lib/community/server/auth");
  const { getDb } = await import("@/lib/community/server/db");
  const schema = await import("@/lib/community/server/schema");

  const response = await getAuth().api.signUpEmail({
    body: { email: "ada@patternflow.local", password: "null-body-test-password", name: "ada", username: "ada" },
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
  const userId = ada!.id;
  const now = new Date();
  await db.insert(schema.patterns).values({
    id: "p1", userId, title: "ada's pattern", code: "// js", visibility: "public", createdAt: now, updatedAt: now,
  });
  await db.insert(schema.decks).values({ id: "d1", userId, title: "ada's deck", createdAt: now, updatedAt: now });
  await db.insert(schema.comments).values({ id: "c1", patternId: "p1", userId, body: "first", createdAt: now });
  await db.insert(schema.patternHeaders).values({
    id: "h1", patternId: "p1", userId, codeCpp: "#pragma once\n", createdAt: now,
  });
  await db.insert(schema.reports).values({
    id: "r1", targetType: "pattern", targetId: "p1", reporterId: userId, reason: "other", createdAt: now,
  });
}, 30_000);

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

it.each(ROUTES)("%s /api/community/%s answers a null body with a 400 the Lab can read", async (
  method,
  route,
  load,
  params,
) => {
  const handler = (await load())[method] as Handler;
  const response = await handler(
    new Request(`http://localhost:3000/api/community/${route}`, {
      method,
      headers: { "Content-Type": "application/json", Origin: LAB_ORIGIN, cookie },
      body: "null",
    }),
    { params: Promise.resolve(params) },
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Expected a JSON object." });
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LAB_ORIGIN);
});
