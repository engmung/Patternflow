import { eq } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { PUBLIC_DECKS_MAX } from "@/lib/community/deck";
import { checkDeckPattern, cleanPatternIds } from "@/lib/community/deckShare";
import { clearNotificationsFor, notifyDeckInclusion } from "@/lib/community/notify";
import { countPublicDecksByUser, getDeckStub, getPatternsForDeck } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { deckPatterns, decks } from "@/lib/community/schema";
import { cleanDescription, cleanTitle } from "@/lib/community/validate";
import { cleanVisibility, type Visibility } from "@/lib/community/visibility";

// PATCH /api/community/decks/[id] — the owner edits their deck: details,
// visibility, or the whole running order (replaced in one move, the same way
// the working deck thinks about it).
//
// DELETE — the owner, or a moderator. Editing stays owner-only: same rule as
// patterns, removing content is moderation, rewriting it is not.

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePatch(request, context));
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleDelete(request, context));
}

export const OPTIONS = preflight;

async function handleDelete(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to delete your deck." }, { status: 401 });
  }

  const { id } = await context.params;
  const deck = await getDeckStub(id);
  if (!deck) return Response.json({ error: "Deck not found." }, { status: 404 });
  if (deck.userId !== session.user.id && !isAdminSession(session)) {
    return Response.json({ error: "You can only delete your own decks." }, { status: 403 });
  }

  // The join rows cascade; the patterns inside belong to their authors and
  // are untouched.
  await getDb().delete(decks).where(eq(decks.id, id));
  await clearNotificationsFor({ targetType: "deck", targetId: id });
  return Response.json({ ok: true });
}

async function handlePatch(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to edit your deck." }, { status: 401 });
  }

  if (!rateLimit(`deck:${session.user.id}`, 5, 60_000)) {
    return Response.json({ error: "Too many deck updates — wait a minute and try again." }, { status: 429 });
  }

  const { id } = await context.params;
  const deck = await getDeckStub(id);
  if (!deck) return Response.json({ error: "Deck not found." }, { status: 404 });
  if (deck.userId !== session.user.id) {
    return Response.json({ error: "You can only edit your own decks." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  let title = deck.title;
  if (raw.title !== undefined) {
    const next = cleanTitle(raw.title);
    if (!next) return Response.json({ error: "Title is required (max 80 chars)." }, { status: 400 });
    title = next;
  }

  let description: string | null | undefined;
  if (raw.description !== undefined) {
    description = cleanDescription(raw.description);
    if (description === undefined) {
      return Response.json({ error: "Description is too long (max 2000 chars)." }, { status: 400 });
    }
  }

  let visibility = deck.visibility as Visibility;
  if (raw.visibility !== undefined) {
    const next = cleanVisibility(raw.visibility);
    if (!next) return Response.json({ error: "Unknown visibility value." }, { status: 400 });
    visibility = next;
  }

  // The slot check runs whenever the result is public — countPublicDecksByUser
  // excludes this deck, so an already-public deck editing its title passes.
  if (
    visibility === "public" &&
    (await countPublicDecksByUser(session.user.id, id)) >= PUBLIC_DECKS_MAX
  ) {
    return Response.json(
      {
        error: `You already have ${PUBLIC_DECKS_MAX} public decks — that is the shelf. Make one of them unlisted or private to free a slot.`,
      },
      { status: 400 },
    );
  }

  let patternIds: string[] | null = null;
  if (raw.patternIds !== undefined) {
    patternIds = cleanPatternIds(raw.patternIds);
    if (!patternIds) {
      return Response.json(
        { error: "A deck is 1 to 10 patterns, in order, with no duplicates." },
        { status: 400 },
      );
    }
  }

  const db = getDb();

  // The list as it stands — the fallback when no replacement came, and the
  // baseline for "which patterns are NEW here" when one did.
  const currentIds = (
    await db
      .select({ patternId: deckPatterns.patternId })
      .from(deckPatterns)
      .where(eq(deckPatterns.deckId, id))
  ).map((row) => row.patternId);

  // Whatever list the deck ends up with has to be allowed at the visibility it
  // ends up at. A replaced list is checked strictly; for a visibility-only
  // change the rows that still exist are checked and gaps stay gaps — a deck
  // is not held hostage by a pattern its author already deleted.
  const effectiveIds = patternIds ?? currentIds;
  const rows = await getPatternsForDeck(effectiveIds);
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const patternId of effectiveIds) {
    const pattern = byId.get(patternId);
    if (!pattern && patternIds === null) continue; // existing gap
    const check = checkDeckPattern(pattern, visibility, session.user.id);
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

  await db
    .update(decks)
    .set({
      title,
      ...(description !== undefined ? { description } : {}),
      visibility,
      updatedAt: new Date(),
    })
    .where(eq(decks.id, id));

  if (patternIds) {
    await db.delete(deckPatterns).where(eq(deckPatterns.deckId, id));
    await db.insert(deckPatterns).values(
      patternIds.map((patternId, position) => ({
        deckId: id,
        patternId,
        position,
        titleSnapshot: byId.get(patternId)?.title ?? "",
      })),
    );
  }

  // A deck that just became public announces its whole running order to the
  // pattern authors; one already public announces only what was added. A
  // title edit announces nothing, and notifyDeckInclusion's unread guard
  // absorbs visibility flip-flopping.
  if (visibility === "public") {
    const wasPublic = deck.visibility === "public";
    const announceIds = !wasPublic
      ? effectiveIds
      : patternIds
        ? patternIds.filter((patternId) => !currentIds.includes(patternId))
        : [];
    const announce = announceIds
      .map((patternId) => byId.get(patternId))
      .filter((pattern): pattern is NonNullable<typeof pattern> => Boolean(pattern));
    if (announce.length > 0) {
      await notifyDeckInclusion({
        deckId: id,
        deckTitle: title,
        actorId: session.user.id,
        patterns: announce,
      });
    }
  }

  return Response.json({ ok: true });
}
