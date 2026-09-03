import { eq, isNotNull } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/server/admin";
import { getAuth } from "@/lib/community/server/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/server/db";
import { getPostStub } from "@/lib/community/server/queries";
import { posts } from "@/lib/community/server/schema";

// POST /api/community/posts/[id]/pin — moderators set (or clear) THE notice.
//
// Not part of the post PATCH on purpose: pinning is curation, not editing, and
// the edit route is author-only by a rule worth keeping intact. One slot:
// pinning a post un-pins whatever held the spot before.

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
  if (!session || !isAdminSession(session)) {
    // 404, not 403 — the pin control is moderator furniture; everyone else
    // has no reason to learn the endpoint exists.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { id } = await context.params;
  const post = await getPostStub(id);
  if (!post) return Response.json({ error: "Post not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const pinned = (body as Record<string, unknown>).pinned;
  if (typeof pinned !== "boolean") {
    return Response.json({ error: "Expected { pinned: true | false }." }, { status: 400 });
  }

  const db = getDb();
  if (pinned) {
    await db.update(posts).set({ pinnedAt: null }).where(isNotNull(posts.pinnedAt));
    await db.update(posts).set({ pinnedAt: new Date() }).where(eq(posts.id, id));
  } else {
    await db.update(posts).set({ pinnedAt: null }).where(eq(posts.id, id));
  }

  return Response.json({ ok: true });
}
