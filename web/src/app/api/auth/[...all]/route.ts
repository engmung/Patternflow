import { communityEnabled } from "@/lib/community/db";
import { getAuth } from "@/lib/community/auth";

// Better Auth catch-all (sign-up, sign-in, session, sign-out, …).
// Lazy so that deployments without COMMUNITY_ENABLED never open the database.

async function handler(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }
  return getAuth().handler(request);
}

export { handler as GET, handler as POST };
