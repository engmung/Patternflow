import { eq } from "drizzle-orm";

import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { patterns } from "@/lib/community/schema";
import { canView } from "@/lib/community/visibility";

// GET /api/community/patterns/[id]/header — the pattern's firmware header.
//
// Feed cards can add a pattern to the deck, and the deck holds the .h,
// not the JavaScript. Shipping every header in the feed payload would mean
// carrying up to 200 KB per card for something most visitors never click, so
// the card fetches just this one when the button is pressed.
//
// Auth only when the pattern is private (the owner adding their own private
// pattern to their deck). Public and unlisted stay session-free — the header
// is rendered in full on any page the visitor can already open.

export async function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleGet(request, context));
}

async function handleGet(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not configured." }, { status: 503 });
  }
  const { id } = await context.params;

  const rows = await getDb()
    .select({
      id: patterns.id,
      title: patterns.title,
      codeCpp: patterns.codeCpp,
      userId: patterns.userId,
      visibility: patterns.visibility,
    })
    .from(patterns)
    .where(eq(patterns.id, id))
    .limit(1);

  const pattern = rows[0];
  if (!pattern) return Response.json({ error: "No such pattern." }, { status: 404 });

  if (pattern.visibility === "private") {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!canView(pattern.visibility, pattern.userId, session?.user.id ?? null, isAdminSession(session))) {
      // Same body as a missing row — a 403 would confirm the id exists.
      return Response.json({ error: "No such pattern." }, { status: 404 });
    }
  }

  if (!pattern.codeCpp) {
    return Response.json({ error: "This pattern has no firmware header." }, { status: 404 });
  }

  return Response.json({ id: pattern.id, title: pattern.title, codeCpp: pattern.codeCpp });
}
