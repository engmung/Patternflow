import { eq } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/server/admin";
import { getAuth } from "@/lib/community/server/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/server/db";
import { reports } from "@/lib/community/server/schema";

// PATCH /api/community/reports/[id] — a moderator closes a report.
//
// Only the status moves. The report itself is never edited: it is somebody's
// account of what they saw, and a record you can rewrite is not a record.

const STATUSES = ["open", "actioned", "dismissed"] as const;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePatch(request, context));
}

export const OPTIONS = preflight;

async function handlePatch(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in." }, { status: 401 });
  }
  if (!isAdminSession(session)) {
    // 404, not 403: whether a report exists is not public information.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const status = (body as Record<string, unknown>).status;
  if (typeof status !== "string" || !STATUSES.includes(status as never)) {
    return Response.json({ error: "Unknown status." }, { status: 400 });
  }

  const { id } = await context.params;
  const rows = await getDb()
    .update(reports)
    .set({ status, resolvedAt: status === "open" ? null : new Date() })
    .where(eq(reports.id, id))
    .returning({ id: reports.id });

  if (rows.length === 0) {
    return Response.json({ error: "Report not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
