import { eq } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { getCommentStub } from "@/lib/community/queries";
import { comments, postComments } from "@/lib/community/schema";

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

export const OPTIONS = preflight;

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
  return Response.json({ ok: true });
}
