import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { newId, reportTarget } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { reports } from "@/lib/community/schema";
import { REPORT_REASONS, cleanReportDetail, isReportTargetType } from "@/lib/community/validate";

// POST /api/community/reports — flag a pattern, post or comment for review.
//
// Signing in is required, which is the whole anti-spam design: reports are
// cheap to file and expensive to read, so they have to cost an account. People
// who are not members — a rights holder sending a takedown, say — use the
// address published in the terms instead.

export async function POST(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePost(request));
}

export const OPTIONS = preflight;

async function handlePost(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to report something." }, { status: 401 });
  }

  if (!rateLimit(`report:${session.user.id}`, 5, 60_000)) {
    return Response.json({ error: "Too many reports — wait a minute and try again." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  if (!isReportTargetType(raw.targetType)) {
    return Response.json({ error: "Unknown report target." }, { status: 400 });
  }
  if (typeof raw.targetId !== "string" || raw.targetId.length === 0) {
    return Response.json({ error: "Missing report target." }, { status: 400 });
  }
  if (typeof raw.reason !== "string" || !REPORT_REASONS.includes(raw.reason as never)) {
    return Response.json({ error: "Pick a reason." }, { status: 400 });
  }

  const detail = cleanReportDetail(raw.detail);
  if (detail === undefined) {
    return Response.json({ error: "Details are too long (max 2000 chars)." }, { status: 400 });
  }

  // Resolve the target now so the report keeps a readable snapshot of what was
  // flagged even after the content is removed.
  const target = await reportTarget(raw.targetType, raw.targetId);
  if (!target) {
    return Response.json({ error: "That content no longer exists." }, { status: 404 });
  }

  await getDb().insert(reports).values({
    id: newId(),
    targetType: raw.targetType,
    targetId: raw.targetId,
    targetTitle: target.title,
    targetUserId: target.userId,
    reporterId: session.user.id,
    reason: raw.reason,
    detail,
    status: "open",
    createdAt: new Date(),
  });

  return Response.json({ ok: true }, { status: 201 });
}
