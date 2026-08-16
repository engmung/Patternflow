import { eq } from "drizzle-orm";
import { ENTRY_BY_ID } from "@/lib/atlas/data";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { listAtlasPins } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { atlasPins, patterns } from "@/lib/community/schema";

// GET    /api/community/atlas — every pattern pinned on the atlas.
// POST   — place or move a pin: { patternId, x, y, entryId?, kind? } in the
//          atlas's 0..100 data space. Only the pattern's author (or a
//          moderator) may. kind "pin" (default) is an exemplar tile on the
//          shared map; kind "research" files the pattern against an entry as a
//          field note — failures stay on record where they happened, without
//          occupying the map.
// DELETE — take a pin off the map: { patternId }. Same permission.
//
// A pin says "this work lives at this spot of pattern space". One per
// pattern; placing again just moves it (and can change its kind).

export async function GET(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleGet(request));
}

export async function POST(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleWrite(request, "place"));
}

export async function DELETE(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleWrite(request, "remove"));
}

export const OPTIONS = preflight;

async function handleGet(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  const pins = await listAtlasPins(
    session ? { id: session.user.id, isAdmin: isAdminSession(session) } : null,
  );
  return Response.json({
    pins: pins.map((pin) => ({
      patternId: pin.patternId,
      x: pin.x,
      y: pin.y,
      entryId: pin.entryId,
      kind: pin.kind,
      title: pin.title,
      userId: pin.userId,
      username: pin.username,
      displayUsername: pin.displayUsername,
    })),
  });
}

function cleanCoord(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 100) return undefined;
  return rounded;
}

async function handleWrite(request: Request, mode: "place" | "remove") {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to place work on the atlas." }, { status: 401 });
  }

  if (!rateLimit(`atlas:${session.user.id}`, 60, 60_000)) {
    return Response.json({ error: "Too many moves — let the pin settle a moment." }, { status: 429 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patternId = typeof payload.patternId === "string" ? payload.patternId : "";
  if (!patternId) {
    return Response.json({ error: "Which pattern?" }, { status: 400 });
  }

  const [pattern] = await getDb()
    .select({ id: patterns.id, userId: patterns.userId, visibility: patterns.visibility })
    .from(patterns)
    .where(eq(patterns.id, patternId))
    .limit(1);
  if (!pattern) {
    return Response.json({ error: "No such pattern." }, { status: 404 });
  }

  // The author decides where their work sits; moderators can tidy the map.
  if (pattern.userId !== session.user.id && !isAdminSession(session)) {
    return Response.json({ error: "Only the pattern's author can place it." }, { status: 403 });
  }

  if (mode === "remove") {
    await getDb().delete(atlasPins).where(eq(atlasPins.patternId, patternId));
    return Response.json({ ok: true });
  }

  const kind = payload.kind === undefined ? "pin" : payload.kind;
  if (kind !== "pin" && kind !== "research") {
    return Response.json({ error: "Unknown pin kind." }, { status: 400 });
  }

  // A map pin is a tile everyone sees, so it must be public. A research row is
  // a field note — private failures are allowed, because the read path already
  // shows those only to their author and moderators.
  if (kind === "pin" && pattern.visibility !== "public") {
    return Response.json(
      { error: "Only public patterns can sit on the shared map." },
      { status: 400 },
    );
  }

  const x = cleanCoord(payload.x);
  const y = cleanCoord(payload.y);
  if (x === undefined || y === undefined) {
    return Response.json({ error: "Bad position." }, { status: 400 });
  }

  // Lineage is a deliberate, human act: the author links a pattern to the
  // prompt point it came from (or to none). Nothing is inferred from code.
  let entryId: string | null;
  if (payload.entryId === undefined || payload.entryId === null || payload.entryId === "") {
    entryId = null;
  } else if (typeof payload.entryId === "string" && ENTRY_BY_ID.has(payload.entryId)) {
    entryId = payload.entryId;
  } else {
    return Response.json({ error: "No such point on the map." }, { status: 400 });
  }

  // A research row exists to remember where an attempt happened — unmoored
  // from any entry it would be invisible everywhere, so refuse the no-op.
  if (kind === "research" && entryId === null) {
    return Response.json(
      { error: "Research notes attach to a point — drop it closer to one." },
      { status: 400 },
    );
  }

  const now = new Date();
  await getDb()
    .insert(atlasPins)
    .values({ patternId, x, y, entryId, kind, updatedAt: now })
    .onConflictDoUpdate({
      target: atlasPins.patternId,
      set: { x, y, entryId, kind, updatedAt: now },
    });

  return Response.json({ ok: true });
}
