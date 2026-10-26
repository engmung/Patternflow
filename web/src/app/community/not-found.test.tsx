import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import CommunityNotFound, { metadata } from "./not-found";

// A deleted pattern's old address, a deck or profile that never existed, and
// somebody else's private work all 404. They used to land on the site's root
// 404: "404", a link to the landing page, no community header, and a tab that
// still read "Community / Patternflow". This file now draws them inside the
// community layout, and each page's metadata 404s with it, so a gone row takes
// this file's title instead of the layout's.

// The pages' client halves run pattern code in sandboxes; metadata never
// reaches them.
vi.mock("./p/[id]/PatternDetailClient", () => ({ default: () => null }));
vi.mock("./d/[id]/DeckDetailClient", () => ({ default: () => null }));
vi.mock("@/components/community/DeckCard", () => ({ default: () => null }));
vi.mock("@/components/community/PatternCard", () => ({ default: () => null }));
vi.mock("@/components/community/SignOutLink", () => ({ default: () => null }));

const ENV_KEYS = ["COMMUNITY_DB_PATH", "COMMUNITY_ENABLED", "BETTER_AUTH_SECRET"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let tmp = "";

beforeAll(async () => {
  // The database is a lazy singleton keyed off these variables, so they are
  // set before anything imports it.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-not-found-"));
  process.env.COMMUNITY_DB_PATH = path.join(tmp, "test.db");
  process.env.COMMUNITY_ENABLED = "1";
  process.env.BETTER_AUTH_SECRET = "not-found-test-secret-not-a-real-one";

  const { eq } = await import("drizzle-orm");
  const { getAuth } = await import("@/lib/community/server/auth");
  const { getDb } = await import("@/lib/community/server/db");
  const schema = await import("@/lib/community/server/schema");

  await getAuth().api.signUpEmail({
    body: { email: "ada@patternflow.local", password: "not-found-test-password", name: "ada", username: "ada" },
  });
  const db = getDb();
  const [ada] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.username, "ada"))
    .limit(1);
  const userId = ada!.id;
  const now = new Date();
  await db.insert(schema.patterns).values({
    id: "private1", userId, title: "Night bus window", code: "// js", visibility: "private", createdAt: now, updatedAt: now,
  });
  await db.insert(schema.decks).values({
    id: "private2", userId, title: "Late set", visibility: "private", createdAt: now, updatedAt: now,
  });
}, 30_000);

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe("the community's 404", () => {
  it("says why the page is gone and links to the wall, not the landing page", () => {
    render(<CommunityNotFound />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nothing at this address.");
    expect(screen.getByText(/deleted, or its owner made it private/)).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/community/patterns"]);
    expect(links[0]).toHaveTextContent("Browse patterns");
  });

  it("names itself in the tab", () => {
    expect(metadata.title).toBe("Not found / Patternflow Community");
  });
});

// notFound() throws an error whose digest names the status.
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

describe("a gone row's metadata", () => {
  it("404s for a pattern that is not there", async () => {
    const { generateMetadata } = await import("./p/[id]/page");
    const props = { params: Promise.resolve({ id: "0000000000000000" }), searchParams: Promise.resolve({}) };
    await expect(generateMetadata(props)).rejects.toMatchObject(NOT_FOUND);
  });

  it("404s for a deck that is not there", async () => {
    const { generateMetadata } = await import("./d/[id]/page");
    await expect(generateMetadata({ params: Promise.resolve({ id: "0000000000000000" }) })).rejects.toMatchObject(
      NOT_FOUND,
    );
  });

  it("404s for a profile that is not there", async () => {
    const { generateMetadata } = await import("./u/[username]/page");
    await expect(generateMetadata({ params: Promise.resolve({ username: "nobody404" }) })).rejects.toMatchObject(
      NOT_FOUND,
    );
  });

  // Metadata cannot tell the owner from a visitor, and the owner opens these.
  it("stays generic for a private pattern or deck, which its owner can still open", async () => {
    const pattern = await import("./p/[id]/page");
    const deck = await import("./d/[id]/page");
    await expect(
      pattern.generateMetadata({ params: Promise.resolve({ id: "private1" }), searchParams: Promise.resolve({}) }),
    ).resolves.toEqual({});
    await expect(deck.generateMetadata({ params: Promise.resolve({ id: "private2" }) })).resolves.toEqual({});
  });

  it("still names a profile that is there", async () => {
    const { generateMetadata } = await import("./u/[username]/page");
    await expect(generateMetadata({ params: Promise.resolve({ username: "ada" }) })).resolves.toMatchObject({
      title: "@ada / Patternflow Community",
    });
  });
});
