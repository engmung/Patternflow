import { eq } from "drizzle-orm";

import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { patterns } from "@/lib/community/schema";

// GET /api/community/patterns/[id]/header — the pattern's firmware header.
//
// Feed cards can add a pattern to the module cart, and the cart holds the .h,
// not the JavaScript. Shipping every header in the feed payload would mean
// carrying up to 200 KB per card for something most visitors never click, so
// the card fetches just this one when the button is pressed.
//
// No auth: the header is already public on the detail page, which renders it
// in full. This only saves a round trip through the HTML.

export async function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleGet(context));
}

async function handleGet(context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not configured." }, { status: 503 });
  }
  const { id } = await context.params;

  const rows = await getDb()
    .select({ id: patterns.id, title: patterns.title, codeCpp: patterns.codeCpp })
    .from(patterns)
    .where(eq(patterns.id, id))
    .limit(1);

  const pattern = rows[0];
  if (!pattern) return Response.json({ error: "No such pattern." }, { status: 404 });
  if (!pattern.codeCpp) {
    return Response.json({ error: "This pattern has no firmware header." }, { status: 404 });
  }

  return Response.json({ id: pattern.id, title: pattern.title, codeCpp: pattern.codeCpp });
}
