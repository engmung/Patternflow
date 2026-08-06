import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  STATUS_MAX,
  cleanStageCoord,
  cleanStatus,
} from "@/lib/community/workshop";
import { countUnmoved, listPresence } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { presence } from "@/lib/community/schema";

// GET  /api/community/presence — everyone standing on the constellation,
//      plus how many accounts are still parked at the core.
// POST — move your own square, or say something.
//
// This is presence, not pins. A pin subscribes you to a territory's threads;
// your square just stands somewhere. The two never touch each other's tables,
// so walking around can never change what you get notified about.

export async function GET(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleGet());
}

export async function POST(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePost(request));
}

export const OPTIONS = preflight;

async function handleGet() {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }
  const [people, unmoved] = await Promise.all([listPresence(), countUnmoved()]);
  return Response.json({
    people: people.map((person) => ({
      userId: person.userId,
      username: person.username,
      displayUsername: person.displayUsername,
      x: person.x,
      y: person.y,
      status: person.status,
      updatedAt: person.updatedAt.toISOString(),
    })),
    unmoved,
  });
}

async function handlePost(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to stand on the map." }, { status: 401 });
  }

  // Movement saves are debounced client-side to one per pause, so a normal
  // walk is a handful a minute; the limit only exists for a stuck key.
  if (!rateLimit(`presence:${session.user.id}`, 60, 60_000)) {
    return Response.json({ error: "Too many moves — stand still a moment." }, { status: 429 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const hasPosition = payload.x !== undefined || payload.y !== undefined;
  const hasStatus = payload.status !== undefined;
  if (!hasPosition && !hasStatus) {
    return Response.json({ error: "Nothing to change." }, { status: 400 });
  }

  let x: number | undefined;
  let y: number | undefined;
  if (hasPosition) {
    // One coordinate without the other is a client bug, not a save.
    x = cleanStageCoord(payload.x, "x");
    y = cleanStageCoord(payload.y, "y");
    if (x === undefined || y === undefined) {
      return Response.json({ error: "Bad position." }, { status: 400 });
    }
  }

  const status = hasStatus ? cleanStatus(payload.status) : undefined;
  if (hasStatus && status === undefined) {
    return Response.json(
      { error: `A status fits in ${STATUS_MAX} characters — it stands beside your square.` },
      { status: 400 },
    );
  }

  // Upsert: first write births the square (a status-only save spawns it at the
  // core, which is where the person visibly already was).
  const now = new Date();
  await getDb()
    .insert(presence)
    .values({
      userId: session.user.id,
      x: x ?? Math.round(STAGE_WIDTH / 2),
      y: y ?? Math.round(STAGE_HEIGHT / 2),
      status: status ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: presence.userId,
      set: {
        ...(hasPosition ? { x, y } : {}),
        ...(hasStatus ? { status } : {}),
        updatedAt: now,
      },
    });

  return Response.json({ ok: true });
}
