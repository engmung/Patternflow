import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

// Every card, comment and licence header prints `displayUsername` after the @,
// and Better Auth took any string for it, at sign-up and on /update-user. On
// 26 October eve set hers to "ada": her cards read @ada, and the code she
// published next carried "// Author:   @ada". Driven through the real
// /api/auth route, the way a browser would send it, on a database of its own.

const LAB_ORIGIN = "https://lab.patternflow.test";
const PASSWORD = "display-name-test-password";
const ENV_KEYS = [
  "COMMUNITY_DB_PATH",
  "COMMUNITY_ENABLED",
  "BETTER_AUTH_SECRET",
  "COMMUNITY_ALLOWED_ORIGINS",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let tmp = "";
let route: typeof import("@/app/api/auth/[...all]/route");
let eve = "";
let shownAs: (username: string) => Promise<string | null | undefined>;

function post(pathname: string, body: unknown, cookie?: string) {
  return route.POST(
    new Request(`http://localhost:3000/api/auth/${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: LAB_ORIGIN, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

function signUp(username: string, extra: Record<string, unknown> = {}) {
  return post("sign-up/email", {
    email: `${username}@patternflow.local`,
    password: PASSWORD,
    name: username,
    username,
    ...extra,
  });
}

beforeAll(async () => {
  // The database is a lazy singleton keyed off these variables, so they are
  // set before anything imports it.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-display-name-"));
  process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
  process.env.COMMUNITY_ENABLED = "1";
  process.env.BETTER_AUTH_SECRET = "display-name-test-secret-not-a-real-one";
  process.env.COMMUNITY_ALLOWED_ORIGINS = LAB_ORIGIN;

  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("@/lib/community/server/db");
  const schema = await import("@/lib/community/server/schema");
  route = await import("@/app/api/auth/[...all]/route");

  expect((await signUp("ada")).status).toBe(200);
  const response = await signUp("eve");
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("no session cookie for eve");
  eve = setCookie.split(";")[0];

  shownAs = async (username) => {
    const [row] = await getDb()
      .select({ displayUsername: schema.user.displayUsername })
      .from(schema.user)
      .where(eq(schema.user.username, username))
      .limit(1);
    return row?.displayUsername;
  };
}, 30_000);

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

it.each(["ada", "Ada", "ADA (moderator)", "eve\n// Author: @ada", "eve ", "", null])(
  "eve cannot show as %j",
  async (displayUsername) => {
    const response = await post("update-user", { displayUsername }, eve);
    expect(response.status).toBe(400);
    expect(await shownAs("eve")).toBe("eve");
  },
);

it("eve can change the capitals of her own name", async () => {
  expect((await post("update-user", { displayUsername: "EVE" }, eve)).status).toBe(200);
  expect(await shownAs("eve")).toBe("EVE");
  expect((await post("update-user", { displayUsername: "eve" }, eve)).status).toBe(200);
  expect(await shownAs("eve")).toBe("eve");
});

it("sign-up refuses a display name that is someone else's", async () => {
  expect((await signUp("gus", { displayUsername: "ada" })).status).toBe(400);
  expect(await shownAs("gus")).toBeUndefined();
});

it("sign-up keeps the capitals someone types for their own name", async () => {
  expect((await signUp("hal", { displayUsername: "HAL" })).status).toBe(200);
  expect(await shownAs("hal")).toBe("HAL");
});

it("a new username takes the display name with it", async () => {
  expect((await post("update-user", { displayUsername: "EVE" }, eve)).status).toBe(200);
  expect((await post("update-user", { username: "eve" }, eve)).status).toBe(200);
  expect(await shownAs("eve")).toBe("EVE");
  // Left behind, the old name would stay on eve's cards while "eve" is free
  // for the next person to sign up as.
  expect((await post("update-user", { username: "eve_two" }, eve)).status).toBe(200);
  expect(await shownAs("eve_two")).toBe("eve_two");
  expect((await post("update-user", { username: "eve_three", displayUsername: "ada" }, eve)).status).toBe(400);
  expect(await shownAs("eve_two")).toBe("eve_two");
});
