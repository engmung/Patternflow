import { inArray } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { featuredPatterns, patterns } from "@/lib/community/schema";

// PUT /api/community/featured — set the marquee, in order.
//
// Moderators only. The whole list is replaced in one call rather than exposing
// add/remove/move: the marquee is four or five things and its ORDER is most of
// what makes it a choice, so "here is the list" is the honest shape and there
// is no way for two half-applied edits to leave it inconsistent.

/** Panels across the top of /community. Five is the design's width. */
export const MARQUEE_MAX = 5;

export async function PUT(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePut(request));
}

export const OPTIONS = preflight;

async function handlePut(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!isAdminSession(session)) {
    // Same answer as a missing route: whether a moderation surface exists is
    // not something an ordinary visitor needs to learn.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = (payload as { patternIds?: unknown }).patternIds;
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string")) {
    return Response.json({ error: "Expected patternIds: string[]." }, { status: 400 });
  }
  // De-duplicate rather than reject: the same pattern twice is a slip, not an
  // attack, and the second one has no meaning anyway.
  const ids = [...new Set(raw as string[])].slice(0, MARQUEE_MAX);

  const db = getDb();

  if (ids.length > 0) {
    // Only patterns that actually exist and are public. The marquee is the
    // front page: a private or deleted row would be a hole in it.
    const found = await db
      .select({ id: patterns.id, visibility: patterns.visibility })
      .from(patterns)
      .where(inArray(patterns.id, ids));
    const usable = new Set(
      found.filter((row) => row.visibility === "public").map((row) => row.id),
    );
    const rejected = ids.filter((id) => !usable.has(id));
    if (rejected.length > 0) {
      return Response.json(
        { error: `Not public, or gone: ${rejected.join(", ")}` },
        { status: 400 },
      );
    }
  }

  const now = new Date();
  // Replace wholesale. The table is at most five rows, so there is nothing to
  // be clever about, and a clear-then-insert cannot leave a stale position
  // behind the way a diff can.
  await db.delete(featuredPatterns);
  if (ids.length > 0) {
    await db.insert(featuredPatterns).values(
      ids.map((patternId, position) => ({
        patternId,
        position,
        userId: session!.user.id,
        createdAt: now,
      })),
    );
  }

  return Response.json({ ok: true, patternIds: ids });
}
