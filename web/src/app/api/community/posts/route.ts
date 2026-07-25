import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { newId } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { posts } from "@/lib/community/schema";
import { cleanPostBody, cleanTitle } from "@/lib/community/validate";

// POST /api/community/posts — start a board thread (login required).
// Title and body are plain text, escaped by React on output.

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

  const id = newId();
  const now = new Date();
  await getDb().insert(posts).values({
    id,
    userId: session.user.id,
    title,
    body,
    createdAt: now,
    updatedAt: now,
  });

  return Response.json({ ok: true, id }, { status: 201 });
}
