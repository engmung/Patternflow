import { and, eq } from "drizzle-orm";
import { getAuth } from "@/lib/community/auth";
import { communityEnabled, getDb } from "@/lib/community/db";
import { countLikes, getPatternStub, hasLiked } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { likes } from "@/lib/community/schema";

// POST /api/community/patterns/[id]/like — toggle the viewer's like.
// Reading like counts is free; liking is a save, so it needs a session.

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to like a pattern." }, { status: 401 });
  }

  if (!rateLimit(`like:${session.user.id}`, 60, 60_000)) {
    return Response.json({ error: "Too many likes — slow down a moment." }, { status: 429 });
  }

  const { id: patternId } = await context.params;
  const pattern = await getPatternStub(patternId);
  if (!pattern) {
    return Response.json({ error: "Pattern not found." }, { status: 404 });
  }

  const db = getDb();
  const liked = await hasLiked(session.user.id, patternId);

  if (liked) {
    await db
      .delete(likes)
      .where(and(eq(likes.userId, session.user.id), eq(likes.patternId, patternId)));
  } else {
    // The composite primary key is what actually prevents duplicates; the
    // conflict clause just makes a double-submit a no-op instead of a 500.
    await db
      .insert(likes)
      .values({ userId: session.user.id, patternId, createdAt: new Date() })
      .onConflictDoNothing();
  }

  return Response.json({ liked: !liked, count: await countLikes(patternId) });
}
