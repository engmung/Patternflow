import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { MAX_FEED_PAGE_SIZE } from "@/lib/community/feedView";
import { notifyForkPublished } from "@/lib/community/notify";
import {
  countFeed,
  getPatternStub,
  likedPatternIds,
  listFeed,
  newId,
  parseFeedSort,
} from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { patterns } from "@/lib/community/schema";
import { toCardItem } from "@/lib/community/serialize";
import {
  cleanCode,
  cleanCpp,
  cleanDescription,
  cleanMadeHow,
  cleanTitle,
} from "@/lib/community/validate";
import { cleanVisibility, forkBlocked } from "@/lib/community/visibility";
import { buildStoredPatternCode, lineageFrom } from "@/lib/community/license";
import { LICENSE_OPTIONS, forkLicenseAllowed, stripShareWrapping } from "@/lib/sharePattern";

// POST /api/community/patterns — publish (or fork-publish) a pattern.
// GET  /api/community/patterns — one batch of the feed, for infinite scroll.
//
// Reads otherwise happen in server components; this GET is the one exception,
// because "load more as you scroll" is a client act by nature. Same filters
// and ordering as the server-rendered first paint — it reads through the very
// same listFeed, so the visibility rules cannot drift apart.
//
// Callable from the main site's Pattern Lab, which is a different origin, so
// every response carries CORS headers and OPTIONS answers the preflight.

export async function POST(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePost(request));
}

export async function GET(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleGet(request));
}

export const OPTIONS = preflight;

function clampInt(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

async function handleGet(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const sort = parseFeedSort(params.get("sort") ?? undefined);
  const hardwareOnly = params.get("hw") === "1";
  const offset = clampInt(params.get("offset"), 0, 0, 1_000_000);
  const size = clampInt(params.get("size"), 12, 1, MAX_FEED_PAGE_SIZE);

  // The infinite scroll refills through here, so every page needs the same
  // viewer the first paint had: `liked` for the subset itself, and the card
  // hearts on any sort — without it page two would arrive unlit.
  const session = await getAuth().api.getSession({ headers: request.headers });
  const viewerId = session?.user.id ?? null;

  const [items, total] = await Promise.all([
    listFeed({ sort, hardwareOnly, limit: size, offset, viewerId }),
    countFeed(hardwareOnly),
  ]);
  const likedIds = await likedPatternIds(viewerId, items.map((item) => item.id));

  return Response.json({ items: items.map((item) => toCardItem(item, likedIds)), total });
}

async function handlePost(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to share a pattern." }, { status: 401 });
  }

  if (!rateLimit(`publish:${session.user.id}`, 5, 60_000)) {
    return Response.json({ error: "Too many uploads — wait a minute and try again." }, { status: 429 });
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

  const code = cleanCode(raw.code);
  if (!code) return Response.json({ error: "Pattern code is missing or over 100KB." }, { status: 400 });

  // Any licence block the code arrived with belongs to someone else (a lab
  // preset's header, a Gemini stamp, a previously exported file), so drop it
  // before we write our own.
  if (stripShareWrapping(code).length === 0) {
    return Response.json({ error: "Pattern code is empty once the licence header is removed." }, { status: 400 });
  }

  // A pattern may arrive already ported. Pattern Lab's hardware flow converts
  // to a header, then offers to publish — making people publish first and
  // attach the header afterwards would lose the port half the time.
  const codeCpp = cleanCpp(raw.codeCpp);
  if (codeCpp === undefined) {
    return Response.json(
      { error: "That does not look like a Patternflow header — it must start with `#pragma once` and be under 200KB." },
      { status: 400 },
    );
  }

  const madeHow = cleanMadeHow(raw.madeHow);
  if (madeHow === undefined) {
    return Response.json({ error: "Unknown \"made how\" value." }, { status: 400 });
  }

  // Absent means public — the community works because things are shared. The
  // quieter states are a choice made at the picker, not a silent default.
  const visibility = raw.visibility === undefined ? "public" : cleanVisibility(raw.visibility);
  if (!visibility) {
    return Response.json({ error: "Unknown visibility value." }, { status: 400 });
  }

  // New work can only take a currently-offered licence (the retired ones stay
  // readable but are not selectable — see LICENSE_OPTIONS).
  const license =
    LICENSE_OPTIONS.find((option) => option.spdx === raw.license)?.spdx ?? "CC-BY-SA-4.0";

  // Fork lineage: only record parents that actually exist; a dangling or
  // malformed parentId silently degrades to an original post.
  let parentId: string | null = null;
  let parent: Awaited<ReturnType<typeof getPatternStub>> | null = null;
  if (typeof raw.parentId === "string" && raw.parentId.length > 0) {
    parent = await getPatternStub(raw.parentId);
    parentId = parent?.id ?? null;
  }

  // A fork of a private pattern would bake a credit link that 404s for every
  // reader (#255). The author forking their own private work is fine.
  if (parent && forkBlocked(parent, session.user.id)) {
    return Response.json(
      { error: "That pattern is private — it cannot be forked." },
      { status: 400 },
    );
  }

  // A fork is a derivative: it cannot be published under looser terms than the
  // pattern it came from. Without this a CC BY-SA pattern could be forked and
  // re-published as something permissive, with the platform doing the laundering.
  if (parent && !forkLicenseAllowed(parent.license, license)) {
    return Response.json(
      {
        error: `A fork of a ${parent.license} pattern cannot be published as ${license}. Publish it under ${parent.license}.`,
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const id = newId();
  const handle =
    (session.user as { username?: string | null; displayUsername?: string | null }).displayUsername ??
    (session.user as { username?: string | null }).username ??
    null;

  await getDb().insert(patterns).values({
    id,
    userId: session.user.id,
    title,
    description,
    // Licence header + attribution are baked into the stored source, so anyone
    // who copies the code out of the page takes the terms and the credit with
    // it — not just people who download the file. On a fork that includes the
    // upstream credit, which both CC licences require a derivative to keep.
    code: buildStoredPatternCode(code, {
      title,
      license,
      handle,
      date: now,
      basedOn: lineageFrom(parent),
    }),
    codeCpp,
    license,
    madeHow,
    parentId,
    visibility,
    createdAt: now,
    updatedAt: now,
  });

  if (parent) {
    await notifyForkPublished({
      parentOwnerId: parent.userId,
      parentTitle: parent.title,
      forkId: id,
      forkVisibility: visibility,
      actorId: session.user.id,
    });
  }

  return Response.json({ id }, { status: 201 });
}
