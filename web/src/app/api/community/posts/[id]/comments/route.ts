import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { notifyCommentAdded } from "@/lib/community/notify";
import { getPostStub, newId } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { postComments } from "@/lib/community/schema";
import { cleanComment } from "@/lib/community/validate";

// POST /api/community/posts/[id]/comments — reply to a discussion thread (login
// required). Same rules as pattern comments: plain text in, React escapes out.

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

  // Shares the pattern-comment budget on purpose: it is one person's comment
  // rate, not a per-surface allowance.
  if (!rateLimit(`comment:${session.user.id}`, 10, 60_000)) {
    return Response.json({ error: "Too many comments — wait a minute and try again." }, { status: 429 });
  }

  const { id: postId } = await context.params;
  const post = await getPostStub(postId);
  if (!post) {
    return Response.json({ error: "Post not found." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = cleanComment((payload as Record<string, unknown>).body);
  if (!text) {
    return Response.json({ error: "Comment is empty or over 2000 chars." }, { status: 400 });
  }

  const commentId = newId();
  await getDb().insert(postComments).values({
    id: commentId,
    postId,
    userId: session.user.id,
    body: text,
    createdAt: new Date(),
  });

  await notifyCommentAdded({
    on: "post",
    targetId: postId,
    targetTitle: post.title,
    ownerId: post.userId,
    actorId: session.user.id,
    commentId,
    body: text,
  });

  // The id goes back because attachments are a second request: the reply
  // composer uploads its files against this comment right after this returns.
  return Response.json({ ok: true, id: commentId }, { status: 201 });
}
