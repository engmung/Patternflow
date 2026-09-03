import { eq } from "drizzle-orm";

import { isAdminSession } from "@/lib/community/server/admin";
import { getAuth } from "@/lib/community/server/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/server/db";
import { notifyPortAdded } from "@/lib/community/server/notify";
import { resolveHeader } from "@/lib/community/ports";
import { listPatternPorts, newId } from "@/lib/community/server/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { patternHeaders, patterns } from "@/lib/community/server/schema";
import { cleanCpp, cleanDescription } from "@/lib/community/validate";
import { canView } from "@/lib/community/visibility";

// GET  /api/community/patterns/[id]/header — the pattern's EFFECTIVE firmware
// header: the author's own, or the winning community port (see
// lib/community/ports.ts). Feed cards and deck copies read this, so they get
// exactly what the pattern page shows.
//
// POST — propose a port: a hand-verified .h for somebody else's pattern. Live
// immediately; an acceptance queue would rot on authors who moved on. The
// author hears about it (notification) and can pin or out-rank it with their
// own header at any time.

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
      codeCpp: patterns.codeCpp,
      pinnedHeaderId: patterns.pinnedHeaderId,
      userId: patterns.userId,
      visibility: patterns.visibility,
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

  const effective = resolveHeader(pattern, await listPatternPorts(id));
  if (!effective) {
    return Response.json({ error: "This pattern has no firmware header." }, { status: 404 });
  }

  return Response.json({
    id: pattern.id,
    title: pattern.title,
    codeCpp: effective.codeCpp,
    portedBy: effective.source === "port" ? effective.handle : null,
  });
}

async function handlePost(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to propose a port." }, { status: 401 });
  }

  if (!rateLimit(`port:${session.user.id}`, 5, 60_000)) {
    return Response.json({ error: "Too many ports — wait a minute and try again." }, { status: 429 });
  }

  const { id } = await context.params;
  const pattern = await loadPattern(id);
  // Private patterns take no ports from strangers — same 404 as a missing row.
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

  const codeCpp = cleanCpp(raw.codeCpp);
  if (!codeCpp) {
    return Response.json(
      { error: "That does not look like a Patternflow header — it must start with `#pragma once` and be under 200KB." },
      { status: 400 },
    );
  }

  const note = cleanDescription(raw.note);
  if (note === undefined) {
    return Response.json({ error: "Note is too long (max 2000 chars)." }, { status: 400 });
  }

  const portId = newId();
  await getDb().insert(patternHeaders).values({
    id: portId,
    patternId: pattern.id,
    userId: session.user.id,
    codeCpp,
    note,
    createdAt: new Date(),
  });

  await notifyPortAdded({
    patternOwnerId: pattern.userId,
    patternId: pattern.id,
    patternTitle: pattern.title,
    portId,
    actorId: session.user.id,
  });

  return Response.json({ id: portId }, { status: 201 });
}
