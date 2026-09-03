import { and, eq } from "drizzle-orm";
import { getAuth } from "@/lib/community/server/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/server/db";
import { cleanPinNote, cleanTerritoryCode } from "@/lib/community/workshop";
import { getTerritoryByCode, listTerritoryPins, newId } from "@/lib/community/server/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { territoryPins } from "@/lib/community/server/schema";

// POST /api/community/territories/[code]/pin — "I'm working here."
// DELETE — take it back.
//
// The cheapest contribution the site accepts: one click, no artifact. That is
// the point — a direction with three names on it reads completely differently
// from the same direction with none, and asking for a write-up first would mean
// most directions stay at zero forever.
//
// Not a toggle on one verb. Pinning carries a note ("steel front") that the
// pinner can rewrite without unpinning, and unpinning throws away the "since"
// date, so the two need to be separately addressable.

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, context: Context) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePin(request, context));
}

export async function DELETE(request: Request, context: Context) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleUnpin(request, context));
}

export const OPTIONS = preflight;

/** Everything both verbs need, or the response that says why not. */
type Resolved =
  | { error: Response }
  | { error?: undefined; userId: string; territory: { id: string; code: string } };

async function resolve(request: Request, context: Context): Promise<Resolved> {
  if (!communityEnabled()) {
    return {
      error: Response.json(
        { error: "Community is not enabled on this deployment." },
        { status: 503 },
      ),
    };
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return { error: Response.json({ error: "Sign in to pin yourself." }, { status: 401 }) };
  }

  if (!rateLimit(`pin:${session.user.id}`, 30, 60_000)) {
    return {
      error: Response.json({ error: "Too many changes — slow down a moment." }, { status: 429 }),
    };
  }

  const { code: rawCode } = await context.params;
  const code = cleanTerritoryCode(rawCode);
  const territory = code ? await getTerritoryByCode(code) : null;
  if (!territory) {
    return { error: Response.json({ error: "Territory not found." }, { status: 404 }) };
  }

  return { userId: session.user.id, territory };
}

async function handlePin(request: Request, context: Context) {
  const resolved = await resolve(request, context);
  if (resolved.error) return resolved.error;
  const { userId, territory } = resolved;

  let note: string | null | undefined = null;
  // A note is optional, and so is the body carrying it.
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    note = cleanPinNote(payload.note);
  } catch {
    note = null;
  }
  if (note === undefined) {
    return Response.json({ error: "That note is too long." }, { status: 400 });
  }

  const db = getDb();
  // Re-pinning is how the note gets edited, so an existing row is updated in
  // place — and keeps its original createdAt, because "since" is the part of a
  // pin that means anything.
  await db
    .insert(territoryPins)
    .values({
      id: newId(),
      territoryId: territory.id,
      userId,
      note,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [territoryPins.territoryId, territoryPins.userId],
      set: { note },
    });

  return Response.json({ pinned: true, pins: await listTerritoryPins(territory.id) });
}

async function handleUnpin(request: Request, context: Context) {
  const resolved = await resolve(request, context);
  if (resolved.error) return resolved.error;
  const { userId, territory } = resolved;

  await getDb()
    .delete(territoryPins)
    .where(
      and(
        eq(territoryPins.territoryId, territory.id),
        eq(territoryPins.userId, userId),
      ),
    );

  return Response.json({ pinned: false, pins: await listTerritoryPins(territory.id) });
}
