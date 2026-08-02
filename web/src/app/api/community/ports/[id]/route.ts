import { eq } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { clearNotificationsFor } from "@/lib/community/notify";
import { getPortStub } from "@/lib/community/queries";
import { patternHeaders, patterns } from "@/lib/community/schema";

// DELETE /api/community/ports/[id] — the porter withdraws their port, or a
// moderator removes it. The pattern's author does not delete other people's
// ports (same rule as comments on their pattern) — they out-rank them with a
// pin or with their own header instead.

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
    return Response.json({ error: "Sign in to remove your port." }, { status: 401 });
  }

  const { id } = await context.params;
  const port = await getPortStub(id);
  if (!port) return Response.json({ error: "Port not found." }, { status: 404 });
  if (port.userId !== session.user.id && !isAdminSession(session)) {
    return Response.json({ error: "You can only remove your own ports." }, { status: 403 });
  }

  const db = getDb();
  await db.delete(patternHeaders).where(eq(patternHeaders.id, id));
  // A pin pointing at a deleted port must not dangle — resolution would cope,
  // but the author's stored choice should reflect reality.
  await db
    .update(patterns)
    .set({ pinnedHeaderId: null })
    .where(eq(patterns.pinnedHeaderId, id));
  await clearNotificationsFor({ sourceId: id });

  return Response.json({ ok: true });
}
