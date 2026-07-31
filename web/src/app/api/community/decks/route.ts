import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { PUBLIC_DECKS_MAX } from "@/lib/community/deck";
import { checkDeckPattern, cleanPatternIds } from "@/lib/community/deckShare";
import { notifyDeckInclusion } from "@/lib/community/notify";
import { countPublicDecksByUser, getPatternsForDeck, newId } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { deckPatterns, decks } from "@/lib/community/schema";
import { cleanDescription, cleanTitle } from "@/lib/community/validate";
import { cleanVisibility } from "@/lib/community/visibility";

// POST /api/community/decks — share the working deck as a deck other people
// can open. The localStorage deck stays the scratch list; this is the explicit
// act of publishing a snapshot of it (#256).
//
// Two rules with teeth:
//   - at most PUBLIC_DECKS_MAX public decks per account — the curation cap
//   - no private patterns in a deck others can see

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
    return Response.json({ error: "Sign in to share a deck." }, { status: 401 });
  }

  if (!rateLimit(`deck:${session.user.id}`, 5, 60_000)) {
    return Response.json({ error: "Too many deck updates — wait a minute and try again." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const title = cleanTitle(raw.title);
  if (!title) return Response.json({ error: "Title is required (max 80 chars)." }, { status: 400 });

  const description = cleanDescription(raw.description);
  if (description === undefined) {
    return Response.json({ error: "Description is too long (max 2000 chars)." }, { status: 400 });
  }

  // Absent means private — the deliberate act here is making it visible, so
  // that one is never a fallback.
  const visibility = raw.visibility === undefined ? "private" : cleanVisibility(raw.visibility);
  if (!visibility) {
    return Response.json({ error: "Unknown visibility value." }, { status: 400 });
  }

  const patternIds = cleanPatternIds(raw.patternIds);
  if (!patternIds) {
    return Response.json(
      { error: "A deck is 1 to 10 patterns, in order, with no duplicates." },
      { status: 400 },
    );
  }

  const rows = await getPatternsForDeck(patternIds);
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const patternId of patternIds) {
    const check = checkDeckPattern(byId.get(patternId), visibility, session.user.id);
    if (!check.ok) {
      return check.reason === "private"
        ? Response.json(
            {
              error: `"${check.title}" is private — make it public or unlisted before putting it in a shared deck.`,
            },
            { status: 400 },
          )
        : Response.json(
            { error: "A pattern in this deck is no longer available." },
            { status: 400 },
          );
    }
  }

  if (
    visibility === "public" &&
    (await countPublicDecksByUser(session.user.id)) >= PUBLIC_DECKS_MAX
  ) {
    return Response.json(
      {
        error: `You already have ${PUBLIC_DECKS_MAX} public decks — that is the shelf. Make one of them unlisted or private to free a slot.`,
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const id = newId();
  const db = getDb();

  await db.insert(decks).values({
    id,
    userId: session.user.id,
    title,
    description,
    visibility,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(deckPatterns).values(
    patternIds.map((patternId, position) => ({
      deckId: id,
      patternId,
      position,
      // Snapshotted so a deleted pattern still leaves a named gap in the set.
      titleSnapshot: byId.get(patternId)?.title ?? "",
    })),
  );

  // Tell each pattern's author their work made someone's public shelf — the
  // same act the feed's "in decks" sort counts. Quieter decks tell nobody.
  if (visibility === "public") {
    await notifyDeckInclusion({
      deckId: id,
      deckTitle: title,
      actorId: session.user.id,
      patterns: rows,
    });
  }

  return Response.json({ id }, { status: 201 });
}
