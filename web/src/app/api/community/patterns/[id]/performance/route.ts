import { eq } from "drizzle-orm";

import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { notifyPerformanceAdded } from "@/lib/community/notify";
import {
  encodePfst,
  normalizePerformance,
  pfsFilename,
  serializePerformance,
  summarizePerformanceJson,
  validatePerformance,
} from "@/lib/pattern/pfst";
import { resolvePerformance } from "@/lib/community/performances";
import { listPatternPerformances, newId } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { patternPerformances, patterns } from "@/lib/community/schema";
import { cleanDescription } from "@/lib/community/validate";
import { canView } from "@/lib/community/visibility";

// GET  /api/community/patterns/[id]/performance — the pattern's EFFECTIVE
// recording (author's own > author's pin > oldest; lib/community/performances).
// `?format=pfs` answers the packed show table the device's player reads,
// byte-identical to a Director save.
//
// POST — publish a recording for this pattern. Same social shape as firmware
// ports: authoring happens elsewhere (the Director PWA), anyone may publish
// one for a public pattern, it is live immediately, and the author outranks
// or pins. The JSON is validated against the device's PFST limits and stored
// canonically, so what one person uploads is exactly what another downloads.

export async function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleGet(request, context));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePost(request, context));
}

async function loadPattern(id: string) {
  const rows = await getDb()
    .select({
      id: patterns.id,
      title: patterns.title,
      userId: patterns.userId,
      visibility: patterns.visibility,
      pinnedPerformanceId: patterns.pinnedPerformanceId,
    })
    .from(patterns)
    .where(eq(patterns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function handleGet(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not configured." }, { status: 503 });
  }
  const { id } = await context.params;

  const pattern = await loadPattern(id);
  if (!pattern) return Response.json({ error: "No such pattern." }, { status: 404 });

  if (pattern.visibility === "private") {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!canView(pattern.visibility, pattern.userId, session?.user.id ?? null, isAdminSession(session))) {
      // Same body as a missing row — a 403 would confirm the id exists.
      return Response.json({ error: "No such pattern." }, { status: 404 });
    }
  }

  const effective = resolvePerformance(pattern, await listPatternPerformances(id));
  if (!effective) {
    return Response.json({ error: "This pattern has no performance yet." }, { status: 404 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "pfs") {
    const perf = normalizePerformance(JSON.parse(effective.row.performanceJson));
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

  return Response.json({
    id: effective.row.id,
    patternId: pattern.id,
    source: effective.source,
    performanceJson: effective.row.performanceJson,
    summary: summarizePerformanceJson(effective.row.performanceJson),
    recordedBy: effective.row.displayUsername ?? effective.row.username ?? null,
  });
}

async function handlePost(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to publish a performance." }, { status: 401 });
  }

  if (!rateLimit(`performance:${session.user.id}`, 5, 60_000)) {
    return Response.json({ error: "Too many performances — wait a minute and try again." }, { status: 429 });
  }

  const { id } = await context.params;
  const pattern = await loadPattern(id);
  // Private patterns take no recordings from strangers — same 404 as missing.
  if (!pattern || !canView(pattern.visibility, pattern.userId, session.user.id)) {
    return Response.json({ error: "No such pattern." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.performanceJson !== "string" || raw.performanceJson.length === 0) {
    return Response.json({ error: "performanceJson (a Director Save-JSON string) is required." }, { status: 400 });
  }
  if (raw.performanceJson.length > 64 * 1024) {
    return Response.json({ error: "Performance JSON is too large (max 64 KB)." }, { status: 400 });
  }
  const verdict = validatePerformance(raw.performanceJson);
  if (!verdict.ok) {
    return Response.json({ error: `Performance: ${verdict.error}` }, { status: 400 });
  }

  const note = cleanDescription(raw.note);
  if (note === undefined) {
    return Response.json({ error: "Note is too long (max 2000 chars)." }, { status: 400 });
  }

  const performanceId = newId();
  await getDb().insert(patternPerformances).values({
    id: performanceId,
    patternId: pattern.id,
    userId: session.user.id,
    performanceJson: JSON.stringify(serializePerformance(verdict.perf), null, 2),
    note,
    createdAt: new Date(),
  });

  await notifyPerformanceAdded({
    patternOwnerId: pattern.userId,
    patternId: pattern.id,
    patternTitle: pattern.title,
    performanceId,
    actorId: session.user.id,
  });

  return Response.json({ id: performanceId }, { status: 201 });
}
