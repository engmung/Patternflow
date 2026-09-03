import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled } from "@/lib/community/server/db";
import { getAuth } from "@/lib/community/server/auth";

// Better Auth catch-all (sign-up, sign-in, session, sign-out, …).
// Lazy so that deployments without COMMUNITY_ENABLED never open the database.
//
// Sessions belong to this deployment, but the sign-in modal can be opened from
// the main site (Pattern Lab), so these responses need CORS too. Better Auth
// separately checks the Origin header against `trustedOrigins` — both lists
// come from COMMUNITY_ALLOWED_ORIGINS.

async function handler(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }
  return getAuth().handler(request);
}

async function corsHandler(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handler(request));
}

export { corsHandler as GET, corsHandler as POST, preflight as OPTIONS };
