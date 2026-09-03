import { getAuth } from "@/lib/community/server/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/server/db";
import { notifyCommentAdded } from "@/lib/community/server/notify";
import { getPatternStub, newId } from "@/lib/community/server/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { comments } from "@/lib/community/server/schema";
import { cleanComment } from "@/lib/community/validate";
import { canView } from "@/lib/community/visibility";

// POST /api/community/patterns/[id]/comments — add a comment (login required).
// Comments are stored as plain text and escaped on output by React.

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePost(request, context));
}

export const OPTIONS = preflight;

async function handlePost(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to comment." }, { status: 401 });
  }

  if (!rateLimit(`comment:${session.user.id}`, 10, 60_000)) {
    return Response.json({ error: "Too many comments — wait a minute and try again." }, { status: 429 });
  }

  const { id: patternId } = await context.params;
  const pattern = await getPatternStub(patternId);
  // Private patterns take no drive-by interaction — same 404 as a missing row.
  if (!pattern || !canView(pattern.visibility, pattern.userId, session.user.id)) {
    return Response.json({ error: "Pattern not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = cleanComment((body as Record<string, unknown>).body);
  if (!text) {
    return Response.json({ error: "Comment is empty or over 2000 chars." }, { status: 400 });
  }

  // Fan-out reads the thread as it was BEFORE this insert, so the id is fixed
  // first and the notify call comes after the row exists.
  const commentId = newId();
  await getDb().insert(comments).values({
    id: commentId,
    patternId,
    userId: session.user.id,
    body: text,
    createdAt: new Date(),
  });

  await notifyCommentAdded({
    on: "pattern",
    targetId: patternId,
    targetTitle: pattern.title,
    ownerId: pattern.userId,
    actorId: session.user.id,
    commentId,
    body: text,
  });

  return Response.json({ ok: true }, { status: 201 });
}
