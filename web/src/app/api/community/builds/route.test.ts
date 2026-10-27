import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// POST /builds read each entry of `patterns` as an object without asking, and
// on 26 October `{"patterns":[null]}` threw a TypeError on `.code`: Next
// answered a 500 with no JSON and no CORS headers. GET
// /builds/<id>/modules?file=__proto__ looked the name up on the unzipped
// entries and found Object.prototype, so it answered 200 with an empty body
// and `Content-Length: undefined`; `constructor`, `toString` and
// `hasOwnProperty` were the same. No test called either GET route. All three
// handlers are driven here with a signed-in session, on a database and an
// artifact directory of their own.

const LAB_ORIGIN = "https://lab.patternflow.test";
const ENV_KEYS = [
  "COMMUNITY_DB_PATH",
  "COMMUNITY_ENABLED",
  "BETTER_AUTH_SECRET",
  "COMMUNITY_ALLOWED_ORIGINS",
  "BUILD_ENABLED",
  "BUILD_ARTIFACT_DIR",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let tmp = "";
let cookie = "";

type Params = { params: Promise<{ id: string }> };
let post: (body: unknown) => Promise<Response>;
let poll: (id: string) => Promise<Response>;
let modules: (id: string, query?: string) => Promise<Response>;

// Passes validateCustomPattern, which is all POST /builds asks of a header
// before queueing it. Nothing here compiles it.
const HEADER = [
  "#pragma once",
  "namespace RouteTest {",
  'const char* NAME = "Route test";',
  'const char* KNOB_LABELS[4] = {"A", "B", "C", "D"};',
  "void setup() {}",
  "void update(float t) {}",
  "void draw() {}",
  "}",
].join("\n");

const PFM = new Uint8Array([0x50, 0x46, 0x4d, 0x31, 1, 2, 3, 4]);
// Built with this realm's Uint8Array: under jsdom, fflate's strToU8 returns
// one zipSync does not take for a file, and it writes a folder per byte.
const JSON_ENTRY = Uint8Array.from('{"name":"Route test"}', (char) => char.charCodeAt(0));
const ZIP = zipSync({ "route_test.pfm": PFM, "route_test.json": JSON_ENTRY });

beforeAll(async () => {
  // The database is a lazy singleton keyed off these variables, so they are
  // set before anything imports it.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-builds-route-"));
  const artifacts = path.join(tmp, "builds");
  fs.mkdirSync(artifacts);
  process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
  process.env.COMMUNITY_ENABLED = "1";
  process.env.BETTER_AUTH_SECRET = "builds-route-test-secret-not-a-real-one";
  process.env.COMMUNITY_ALLOWED_ORIGINS = LAB_ORIGIN;
  process.env.BUILD_ENABLED = "1";
  process.env.BUILD_ARTIFACT_DIR = artifacts;

  const { eq } = await import("drizzle-orm");
  const { getAuth } = await import("@/lib/community/server/auth");
  const { getDb } = await import("@/lib/community/server/db");
  const schema = await import("@/lib/community/server/schema");
  const queueRoute = await import("./route");
  const pollRoute = await import("./[id]/route");
  const modulesRoute = await import("./[id]/modules/route");

  const response = await getAuth().api.signUpEmail({
    body: { email: "ada@patternflow.local", password: "builds-route-test-password", name: "ada", username: "ada" },
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
  const done = {
    userId,
    status: "done",
    format: "pfm",
    kind: "send",
    patterns: JSON.stringify([{ label: "Route test", code: HEADER }]),
    namespaces: JSON.stringify(["RouteTest"]),
    createdAt: now,
    startedAt: now,
    finishedAt: now,
  };
  fs.writeFileSync(path.join(artifacts, "b-done.zip"), ZIP);
  // A file the artifact directory does not hold, for a row that names it.
  fs.writeFileSync(path.join(tmp, "outside.zip"), ZIP);
  await db.insert(schema.builds).values([
    { ...done, id: "b-done", artifact: "b-done.zip", artifactBytes: ZIP.byteLength },
    { ...done, id: "b-escape", artifact: "../outside.zip", artifactBytes: ZIP.byteLength },
    { ...done, id: "b-gone", artifact: "b-gone.zip", artifactBytes: ZIP.byteLength },
    { ...done, id: "b-queued", status: "queued", artifact: null, startedAt: null, finishedAt: null },
  ]);

  post = (body) =>
    (queueRoute.POST as (request: Request) => Promise<Response>)(
      new Request("http://localhost:3000/api/community/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: LAB_ORIGIN, cookie },
        body: JSON.stringify(body),
      }),
    );
  poll = (id) =>
    (pollRoute.GET as (request: Request, context: Params) => Promise<Response>)(
      new Request(`http://localhost:3000/api/community/builds/${id}`),
      { params: Promise.resolve({ id }) },
    );
  modules = (id, query = "") =>
    (modulesRoute.GET as (request: Request, context: Params) => Promise<Response>)(
      new Request(`http://localhost:3000/api/community/builds/${id}/modules${query}`),
      { params: Promise.resolve({ id }) },
    );
}, 30_000);

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe("POST /api/community/builds", () => {
  it.each([
    ["null", [null]],
    ["a number", [0]],
    ["true", [true]],
    ["a string", [HEADER]],
    ["an array", [[HEADER]]],
    ["null after a good one", [{ label: "Route test", code: HEADER }, null]],
  ])("answers a pattern that is %s with a 400 the Lab can read", async (_, patterns) => {
    const response = await post({ format: "pfm", patterns });
    expect(response.status).toBe(400);
    const { error } = (await response.json()) as { error: string };
    expect(error).toMatch(/^Pattern \d+: /);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LAB_ORIGIN);
  });

  it("queues a header it can read, and the poll route finds the build", async () => {
    const response = await post({ format: "pfm", patterns: [{ label: "Route test", code: HEADER }] });
    expect(response.status).toBe(202);
    const queued = (await response.json()) as { id: string; format: string; namespaces: string[] };
    expect(queued.format).toBe("pfm");
    expect(queued.namespaces).toEqual(["RouteTest"]);

    const polled = await poll(queued.id);
    expect(polled.status).toBe(200);
    expect(polled.headers.get("Cache-Control")).toBe("no-store");
    expect(await polled.json()).toMatchObject({
      id: queued.id,
      status: "queued",
      patterns: ["Route test"],
      queuePosition: 1,
      modulesUrl: null,
    });
  });
});

describe("GET /api/community/builds/[id]", () => {
  it("names the modules URL once a build is done", async () => {
    const response = await poll("b-done");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "done",
      namespaces: ["RouteTest"],
      queuePosition: null,
      bytes: ZIP.byteLength,
      modulesUrl: "/api/community/builds/b-done/modules",
    });
  });

  it("answers an id nobody queued with a 404", async () => {
    expect((await poll("0000000000000000")).status).toBe(404);
  });
});

describe("GET /api/community/builds/[id]/modules", () => {
  it("serves the whole zip with no query", async () => {
    const response = await modules("b-done");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Length")).toBe(String(ZIP.byteLength));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(ZIP);
  });

  it("lists the zip's entries", async () => {
    const response = await modules("b-done", "?list=1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ files: ["route_test.json", "route_test.pfm"] });
  });

  it.each([
    ["route_test.pfm", PFM, "application/octet-stream"],
    ["route_test.json", JSON_ENTRY, "application/json"],
  ])("serves the entry %s", async (name, bytes, type) => {
    const response = await modules("b-done", `?file=${name}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(type);
    expect(response.headers.get("Content-Length")).toBe(String(bytes.byteLength));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it.each(["missing.pfm", "__proto__", "constructor", "toString", "hasOwnProperty"])(
    "answers ?file=%s, which the zip does not hold, with a 404",
    async (name) => {
      const response = await modules("b-done", `?file=${name}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("No such file in this build.");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    },
  );

  it("will not read an artifact outside the artifact directory", async () => {
    const response = await modules("b-escape");
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid artifact path.");
  });

  it("says when a finished build's zip is gone from disk", async () => {
    expect((await modules("b-gone")).status).toBe(410);
  });

  it.each(["b-queued", "0000000000000000"])("has no modules for %s", async (id) => {
    expect((await modules(id, "?list=1")).status).toBe(404);
  });
});
