import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import {
  cleanQuestions,
  cleanSpan,
  cleanStageCoord,
  cleanTerritoryCode,
  cleanTerritoryDescription,
  cleanTerritoryTitle,
} from "@/lib/community/workshop";
import { getTerritoryByCode, listTerritoriesForAdmin, newId } from "@/lib/community/queries";
import { territories } from "@/lib/community/schema";

// POST /api/community/territories — draw a new direction on the map.
//
// Moderators only. Territories were seed-script-only at first, which meant
// adding one took an SSH session, a TypeScript edit and a redeploy — and the
// workshop's own empty state told the person running the project that someone
// ought to draw some, with no way to do it. This is that way.

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
  if (!isAdminSession(session)) {
    // Same answer as a missing route, like the report queue.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = payload as Record<string, unknown>;

  const code = cleanTerritoryCode(raw.code);
  if (!code) {
    return Response.json(
      { error: "A code is a letter and a number, like A1 or B3." },
      { status: 400 },
    );
  }
  // The code is the identity: it is in every thread URL under this territory,
  // so a duplicate would quietly attach new threads to the wrong direction.
  if (await getTerritoryByCode(code)) {
    return Response.json({ error: `${code} already exists.` }, { status: 409 });
  }

  const title = cleanTerritoryTitle(raw.title);
  if (!title) {
    return Response.json({ error: "A title is required." }, { status: 400 });
  }
  const description = cleanTerritoryDescription(raw.description);
  if (description === undefined) {
    return Response.json({ error: "That description is too long." }, { status: 400 });
  }
  const questions = cleanQuestions(raw.questions);
  if (questions === undefined) {
    return Response.json({ error: "Questions are one short line each." }, { status: 400 });
  }
  const span = cleanSpan(raw.span ?? 2);
  if (span === undefined) {
    return Response.json({ error: "Width is 2 to 6 columns." }, { status: 400 });
  }
  const x = cleanStageCoord(raw.x ?? 720, "x");
  const y = cleanStageCoord(raw.y ?? 320, "y");
  if (x === undefined || y === undefined) {
    return Response.json({ error: "Bad map position." }, { status: 400 });
  }

  // New directions land at the end of the map rather than the front: the order
  // is somebody's arrangement, and arriving should not disturb it.
  const existing = await listTerritoriesForAdmin();
  const position = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;

  await getDb().insert(territories).values({
    id: newId(),
    code,
    title,
    description,
    span,
    position,
    x,
    y,
    shippingNext: raw.shippingNext === true,
    questions,
    createdAt: new Date(),
  });

  return Response.json({ ok: true, code }, { status: 201 });
}
