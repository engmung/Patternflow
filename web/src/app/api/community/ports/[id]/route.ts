import { eq } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/server/admin";
import { getAuth } from "@/lib/community/server/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/server/db";
import { clearNotificationsFor, notifyHeaderModerated } from "@/lib/community/server/notify";
import { getPatternStub, getPortStub } from "@/lib/community/server/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { patternHeaders, patterns } from "@/lib/community/server/schema";
import { cleanCpp } from "@/lib/community/validate";

// DELETE /api/community/ports/[id] — the porter withdraws their port, or a
// moderator removes it. The pattern's author does not delete other people's
// ports (same rule as comments on their pattern) — they out-rank them with a
// pin or with their own header instead.
//
// PATCH — a moderator repairs the C++ in place. Moderator-only, and the one
// place in the community where somebody else's upload is edited rather than
// removed: the reasoning is in lib/community/admin.ts. The porter keeps the
// credit and the note, the row records that the code changed hands
// (`moderated_at`), and they are told.
//
// The porter has no edit of their own on purpose: a port is a claim about a
// SPECIFIC version of the JS that their board ran, so revising it quietly
// would make that claim mean nothing. They withdraw and propose again.

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

async function handlePatch(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to edit a port." }, { status: 401 });
  }
  if (!isAdminSession(session)) {
    return Response.json(
      { error: "A port is changed by withdrawing it and proposing the fixed one." },
      { status: 403 },
    );
  }

  if (!rateLimit(`port-fix:${session.user.id}`, 20, 60_000)) {
    return Response.json({ error: "Too many edits — wait a minute and try again." }, { status: 429 });
  }

  const { id } = await context.params;
  const port = await getPortStub(id);
  if (!port) return Response.json({ error: "Port not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const codeCpp = cleanCpp(raw.codeCpp);
  if (codeCpp === null) {
    // An empty edit is a removal wearing the wrong verb — DELETE clears the
    // pin and the notifications with it, and this route would do neither.
    return Response.json({ error: "An empty port is a removal — delete it instead." }, { status: 400 });
  }
  if (codeCpp === undefined) {
    return Response.json(
      { error: "That does not look like a Patternflow header — it must start with `#pragma once` and be under 200KB." },
      { status: 400 },
    );
  }

  // `stale` is deliberately untouched: it records that the pattern's JS moved
  // after this port was made, which no amount of fixing the C++ undoes.
  await getDb()
    .update(patternHeaders)
    .set({ codeCpp, moderatedAt: new Date() })
    .where(eq(patternHeaders.id, id));

  const pattern = await getPatternStub(port.patternId);
  await notifyHeaderModerated({
    recipientId: port.userId,
    patternId: port.patternId,
    patternTitle: pattern?.title ?? "a pattern",
    portId: id,
    reason: typeof raw.reason === "string" ? raw.reason.trim() || null : null,
    actorId: session.user.id,
  });

  return Response.json({ ok: true });
}
