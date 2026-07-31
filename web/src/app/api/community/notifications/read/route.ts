import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled } from "@/lib/community/db";
import { markNotificationsRead } from "@/lib/community/queries";

// POST /api/community/notifications/read — the notifications page calls this
// once after it has actually rendered. It is not done during the page render:
// Next prefetches links, and a prefetch that marked everything read would eat
// notifications nobody saw.

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
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  await markNotificationsRead(session.user.id);
  return Response.json({ ok: true });
}
