import { eq } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { clearNotificationsFor } from "@/lib/community/notify";
import { getCommentStub } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { comments, postComments } from "@/lib/community/schema";
import { COMMENT_MAX, cleanComment } from "@/lib/community/validate";

// DELETE /api/community/comments/[id]?on=pattern|post
//
// Comments previously had no removal path at all — not for their author, not
// for anyone. That left "report this comment" with no remedy behind it, so the
// report button and this route ship together.
//
// `on` says which thread the comment belongs to. Pattern comments and post
// comments live in separate tables (see schema.ts), and guessing by trying both
// would make the route's behaviour depend on id collisions.

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleDelete(request, context));
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePatch(request, context));
}

export const OPTIONS = preflight;

// Editing is author-only, with no moderator override. Removing someone's
// comment is moderation; rewriting one and leaving their name on it is putting
// words in their mouth.
async function handlePatch(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to edit a comment." }, { status: 401 });
  }

  if (!rateLimit(`comment-edit:${session.user.id}`, 20, 60_000)) {
    return Response.json({ error: "Too many edits — wait a minute and try again." }, { status: 429 });
  }

  const on = new URL(request.url).searchParams.get("on");
  if (on !== "pattern" && on !== "post") {
    return Response.json({ error: "Unknown comment thread." }, { status: 400 });
  }

  const { id } = await context.params;
  const comment = await getCommentStub(on, id);
  if (!comment) {
    return Response.json({ error: "Comment not found." }, { status: 404 });
  }
  if (comment.userId !== session.user.id) {
    return Response.json({ error: "You can only edit your own comments." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const next = cleanComment((body as Record<string, unknown>).body);
  if (!next) {
    return Response.json(
      { error: `A comment cannot be empty, and must be under ${COMMENT_MAX} characters.` },
      { status: 400 },
    );
  }

  const table = on === "pattern" ? comments : postComments;
  // `editedAt` is stamped so the thread shows the comment changed. Replies sit
  // under it, and a comment that quietly becomes something else makes them read
  // as answers to something never said.
  await getDb()
    .update(table)
    .set({ body: next, editedAt: new Date() })
    .where(eq(table.id, id));

  return Response.json({ ok: true });
}

async function handleDelete(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to delete a comment." }, { status: 401 });
  }

  const on = new URL(request.url).searchParams.get("on");
  if (on !== "pattern" && on !== "post") {
    return Response.json({ error: "Unknown comment thread." }, { status: 400 });
  }

  const { id } = await context.params;
  const comment = await getCommentStub(on, id);
  if (!comment) {
    return Response.json({ error: "Comment not found." }, { status: 404 });
  }
  if (comment.userId !== session.user.id && !isAdminSession(session)) {
    // 403, not 404 — the comment is public, it just isn't theirs to remove.
    return Response.json({ error: "You can only delete your own comments." }, { status: 403 });
  }

  const table = on === "pattern" ? comments : postComments;
  await getDb().delete(table).where(eq(table.id, id));
  // The notifications this comment caused go with it.
  await clearNotificationsFor({ sourceId: id });
  return Response.json({ ok: true });
}
