import { eq } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { clearNotificationsFor } from "@/lib/community/notify";
import { getPostStub } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { posts } from "@/lib/community/schema";
import { cleanPostBody, cleanTitle } from "@/lib/community/validate";

// PATCH / DELETE /api/community/posts/[id] — the author edits or removes their
// own thread. Deleting takes its comments with it (they cascade).

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePatch(request, context));
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleDelete(request, context));
}

export const OPTIONS = preflight;

/** Shared gate: enabled, signed in, post exists, and it belongs to the caller. */
async function authorize(request: Request, id: string, verb: string) {
  if (!communityEnabled()) {
    return {
      error: Response.json(
        { error: "Community is not enabled on this deployment." },
        { status: 503 },
      ),
    };
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return { error: Response.json({ error: `Sign in to ${verb} your post.` }, { status: 401 }) };
  }

  const post = await getPostStub(id);
  if (!post) {
    return { error: Response.json({ error: "Post not found." }, { status: 404 }) };
  }
  // Moderators can take a post down, but not rewrite it: removing someone's
  // post is a moderation act, editing it in their name is not.
  const allowed =
    post.userId === session.user.id || (verb === "delete" && isAdminSession(session));
  if (!allowed) {
    // 403, not 404 — the post is public, it just isn't theirs to change.
    return {
      error: Response.json({ error: `You can only ${verb} your own posts.` }, { status: 403 }),
    };
  }

  return { session };
}

async function handleDelete(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gate = await authorize(request, id, "delete");
  if (gate.error) return gate.error;

  await getDb().delete(posts).where(eq(posts.id, id));
  await clearNotificationsFor({ targetType: "post", targetId: id });
  return Response.json({ ok: true });
}

async function handlePatch(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gate = await authorize(request, id, "edit");
  if (gate.error) return gate.error;

  if (!rateLimit(`postpatch:${gate.session.user.id}`, 20, 60_000)) {
    return Response.json({ error: "Too many edits — wait a minute and try again." }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = payload as Record<string, unknown>;

  // Partial update: only the fields present in the body change.
  const patch: { title?: string; body?: string; updatedAt: Date } = { updatedAt: new Date() };

  if (raw.title !== undefined) {
    const title = cleanTitle(raw.title);
    if (!title) return Response.json({ error: "Title is empty or too long." }, { status: 400 });
    patch.title = title;
  }
  if (raw.body !== undefined) {
    const body = cleanPostBody(raw.body);
    if (!body) return Response.json({ error: "Body is empty or too long." }, { status: 400 });
    patch.body = body;
  }
  if (patch.title === undefined && patch.body === undefined) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }

  await getDb().update(posts).set(patch).where(eq(posts.id, id));
  return Response.json({ ok: true });
}
