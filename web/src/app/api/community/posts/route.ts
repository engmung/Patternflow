import { getAuth } from "@/lib/community/server/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/server/db";
import { cleanPinNote, cleanTerritoryCode } from "@/lib/community/workshop";
import { notifyNewThread } from "@/lib/community/server/notify";
import { getTerritoryByCode, newId } from "@/lib/community/server/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { posts, territoryPins } from "@/lib/community/server/schema";
import { cleanPostBody, cleanTitle } from "@/lib/community/validate";

// POST /api/community/posts — start a thread inside a territory (login
// required). Title and body are plain text, escaped by React on output.
//
// A thread always belongs to a direction on the map: there is no general list
// any more, because a question about a direction belongs beside that
// direction. The caller names the territory by its map code ("A3").
//
// `pin` piggybacks on the same request — the new-thread modal has "also pin
// me: I'm working here" checked by default, and starting a thread about
// something IS the strongest evidence you are working on it. Pinning is
// idempotent, so a second thread in the same territory changes nothing.

export async function POST(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePost(request));
}

export const OPTIONS = preflight;

async function handlePost(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to post." }, { status: 401 });
  }

  // Tighter than comments: a post is a thread, not a reply.
  if (!rateLimit(`post:${session.user.id}`, 5, 60_000)) {
    return Response.json({ error: "Too many posts — wait a minute and try again." }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = payload as Record<string, unknown>;
  const title = cleanTitle(raw.title);
  if (!title) {
    return Response.json({ error: "Title is empty or too long." }, { status: 400 });
  }
  const body = cleanPostBody(raw.body);
  if (!body) {
    return Response.json({ error: "Body is empty or too long." }, { status: 400 });
  }

  const code = cleanTerritoryCode(raw.territoryCode);
  if (!code) {
    return Response.json({ error: "Pick a place on the map for this." }, { status: 400 });
  }
  const territory = await getTerritoryByCode(code);
  if (!territory) {
    return Response.json({ error: "That territory does not exist." }, { status: 404 });
  }

  const note = cleanPinNote(raw.pinNote);
  if (note === undefined) {
    return Response.json({ error: "That note is too long." }, { status: 400 });
  }

  const id = newId();
  const now = new Date();
  const db = getDb();
  await db.insert(posts).values({
    id,
    territoryId: territory.id,
    userId: session.user.id,
    title,
    body,
    createdAt: now,
    updatedAt: now,
  });

  if (raw.pin === true) {
    // Already pinned there? Leave the original "since" alone — the date is the
    // point of the pin, and a new thread does not restart it.
    await db
      .insert(territoryPins)
      .values({
        id: newId(),
        territoryId: territory.id,
        userId: session.user.id,
        note,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  // The pin-as-subscription payoff: everyone working in this territory hears
  // that something started in it. After the author's own pin above, so a
  // brand-new pin does not change who gets told about THIS thread (the actor
  // is excluded either way) — but ordering it here keeps that true by
  // construction rather than by coincidence.
  await notifyNewThread({
    territoryId: territory.id,
    territoryLabel: `${territory.code} · ${territory.title}`,
    postId: id,
    postTitle: title,
    actorId: session.user.id,
  });

  return Response.json({ ok: true, id, territoryCode: territory.code }, { status: 201 });
}
