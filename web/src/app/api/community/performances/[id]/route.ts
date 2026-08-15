import { eq } from "drizzle-orm";

import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { clearNotificationsFor } from "@/lib/community/notify";
import {
  encodePfst,
  normalizePerformance,
  pfsFilename,
} from "@/lib/community/performance";
import { getPatternStub, getPerformanceStub } from "@/lib/community/queries";
import { patternPerformances, patterns } from "@/lib/community/schema";
import { canView } from "@/lib/community/visibility";

// GET    /api/community/performances/[id] — one specific recording, as the
//        stored canonical JSON, or `?format=pfs` for the packed show table.
//        The pattern page's per-recording download links point here.
// DELETE — the recorder withdraws it, or a moderator removes it. The pattern's
//        author does not delete other people's recordings (same rule as ports)
//        — they out-rank them with a pin or their own recording instead.

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleGet(request, context));
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleDelete(request, context));
}

export const OPTIONS = preflight;

async function handleGet(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const { id } = await context.params;
  const rows = await getDb()
    .select({
      id: patternPerformances.id,
      patternId: patternPerformances.patternId,
      performanceJson: patternPerformances.performanceJson,
    })
    .from(patternPerformances)
    .where(eq(patternPerformances.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return Response.json({ error: "Performance not found." }, { status: 404 });

  // Visible exactly when its pattern is: a recording of a private pattern is
  // part of that pattern's private page, not an unlisted side door.
  const pattern = await getPatternStub(row.patternId);
  if (!pattern) return Response.json({ error: "Performance not found." }, { status: 404 });
  if (pattern.visibility === "private") {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!canView(pattern.visibility, pattern.userId, session?.user.id ?? null, isAdminSession(session))) {
      return Response.json({ error: "Performance not found." }, { status: 404 });
    }
  }

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "pfs") {
    const perf = normalizePerformance(JSON.parse(row.performanceJson));
    const bytes = encodePfst(perf);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${pfsFilename(perf)}"`,
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  }

  return new Response(row.performanceJson, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="performance-${row.id}.json"`,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

async function handleDelete(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to remove your performance." }, { status: 401 });
  }

  const { id } = await context.params;
  const row = await getPerformanceStub(id);
  if (!row) return Response.json({ error: "Performance not found." }, { status: 404 });
  if (row.userId !== session.user.id && !isAdminSession(session)) {
    return Response.json({ error: "You can only remove your own performances." }, { status: 403 });
  }

  const db = getDb();
  await db.delete(patternPerformances).where(eq(patternPerformances.id, id));
  // A pin pointing at a deleted recording must not dangle — resolution would
  // cope, but the author's stored choice should reflect reality.
  await db
    .update(patterns)
    .set({ pinnedPerformanceId: null })
    .where(eq(patterns.pinnedPerformanceId, id));
  await clearNotificationsFor({ sourceId: id });

  return Response.json({ ok: true });
}
