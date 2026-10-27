import { isAdminSession } from "@/lib/community/server/admin";
import { getAuth } from "@/lib/community/server/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled } from "@/lib/community/server/db";
import { listAtlasPins } from "@/lib/community/server/queries";

// GET    /api/community/atlas — every pattern pinned on the atlas.
// POST, DELETE — refused with a 405. The atlas is an archive since 26 October
//          2026: the pins stay where their authors left them. Until then POST
//          placed or moved a pin ({ patternId, x, y, entryId?, kind? }) and
//          DELETE took one off the map ({ patternId }).

export async function GET(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleGet(request));
}

export async function POST(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, refuseWrite());
}

export async function DELETE(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, refuseWrite());
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

function refuseWrite() {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }
  return Response.json(
    { error: "The atlas is an archive now, and its pins stay where they are." },
    { status: 405, headers: { Allow: "GET, OPTIONS" } },
  );
}
