import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

// The header badge and the alerts page read the same rows. The badge was a
// bare COUNT and the page dropped rows after reading them, so on 26 October
// bea's header said "Alerts 1" over an empty page: the pattern she had
// commented on went private, and its owner answered her there. A workshop
// alert left in the table made it "Alerts 2". Driven through the real comment
// and edit routes, with real sessions, on a database of its own.

const ENV_KEYS = ["COMMUNITY_DB_PATH", "COMMUNITY_ENABLED", "BETTER_AUTH_SECRET"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let tmp = "";

let ada: { id: string; cookie: string };
let bea: { id: string; cookie: string };
let comment: (cookie: string, patternId: string, body: string) => Promise<number>;
let edit: (cookie: string, patternId: string, body: Record<string, unknown>) => Promise<number>;
let leaveWorkshopAlert: (userId: string, actorId: string) => Promise<void>;
/** What the header would print, and how many unread rows the page would list. */
let seen: (userId: string, moderator?: boolean) => Promise<{ badge: number; unread: number }>;

beforeAll(async () => {
  // The database is a lazy singleton keyed off these variables, so they are
  // set before anything imports it.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-notifications-"));
  process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
  process.env.COMMUNITY_ENABLED = "1";
  process.env.BETTER_AUTH_SECRET = "notifications-test-secret-not-a-real-one";

  const { eq } = await import("drizzle-orm");
  const { getAuth } = await import("@/lib/community/server/auth");
  const { getDb } = await import("@/lib/community/server/db");
  const schema = await import("@/lib/community/server/schema");
  const { newId } = await import("@/lib/community/server/queries");
  const { countUnreadNotifications, listNotifications } = await import("./notifications");
  const commentRoute = await import("@/app/api/community/patterns/[id]/comments/route");
  const patternRoute = await import("@/app/api/community/patterns/[id]/route");

  const db = getDb();
  const auth = getAuth();

  const enrol = async (username: string) => {
    const response = await auth.api.signUpEmail({
      body: {
        email: `${username}@patternflow.local`,
        password: "notifications-test-password",
        name: username,
        username,
      },
      asResponse: true,
    });
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) throw new Error(`no session cookie for ${username}`);
    const [row] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.username, username))
      .limit(1);
    return { id: row!.id, cookie: setCookie.split(";")[0] };
  };

  ada = await enrol("ada");
  bea = await enrol("bea");

  const now = new Date();
  await db.insert(schema.patterns).values({
    id: "p-tide",
    userId: ada.id,
    title: "Tide",
    code: "function draw() {}",
    license: "CC-BY-SA-4.0",
    visibility: "public",
    createdAt: now,
    updatedAt: now,
  });

  // No Origin header below, which is the same-origin case originBlocked()
  // lets through.
  comment = async (cookie, patternId, body) => {
    const response = await commentRoute.POST(
      new Request(`http://localhost:3000/api/community/patterns/${patternId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ body }),
      }),
      { params: Promise.resolve({ id: patternId }) },
    );
    return response.status;
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

  // Nothing writes these any more. One left over from before 26 October is
  // how a workshop alert reaches the table now.
  leaveWorkshopAlert = async (userId, actorId) => {
    await db.insert(schema.notifications).values({
      id: newId(),
      userId,
      type: "comment",
      actorId,
      targetType: "post",
      targetId: "post-1",
      targetTitle: "Show your build",
      createdAt: new Date(),
    });
  };

  seen = async (userId, moderator = false) => ({
    badge: await countUnreadNotifications(userId, { moderator }),
    unread: (await listNotifications(userId, { moderator })).filter((row) => row.readAt === null)
      .length,
  });
}, 30_000);

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

it("counts a comment on a public pattern, and the page lists it", async () => {
  expect(await comment(bea.cookie, "p-tide", "Lovely swell.")).toBe(201);
  expect(await seen(ada.id)).toEqual({ badge: 1, unread: 1 });
}, 30_000);

it("stops counting an alert once its pattern goes private, as the page stops listing it", async () => {
  expect(await edit(ada.cookie, "p-tide", { visibility: "private" })).toBe(200);
  // Ada can still open her own private pattern, and answers bea under it.
  expect(await comment(ada.cookie, "p-tide", "Thank you!")).toBe(201);

  // Bea's alert points at a page that would 404 for her.
  expect(await seen(bea.id)).toEqual({ badge: 0, unread: 0 });
  // Ada's own alert on her own pattern stays.
  expect(await seen(ada.id)).toEqual({ badge: 1, unread: 1 });
  // A moderator opens every private page, so theirs would stay too.
  expect(await seen(bea.id, true)).toEqual({ badge: 1, unread: 1 });
}, 30_000);

it("does not count a workshop alert, which has nowhere left to link", async () => {
  await leaveWorkshopAlert(bea.id, ada.id);
  expect(await seen(bea.id)).toEqual({ badge: 0, unread: 0 });
  expect(await seen(bea.id, true)).toEqual({ badge: 1, unread: 1 });
}, 30_000);

it("counts the pattern's alerts again once it is public again", async () => {
  expect(await edit(ada.cookie, "p-tide", { visibility: "public" })).toBe(200);
  expect(await seen(bea.id)).toEqual({ badge: 1, unread: 1 });
}, 30_000);
