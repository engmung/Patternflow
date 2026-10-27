import { and, eq, gte } from "drizzle-orm";
import { getAuth } from "@/lib/community/server/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { readJsonObject } from "@/lib/community/jsonBody";
import { communityEnabled, getDb } from "@/lib/community/server/db";
import { MAX_FEED_PAGE_SIZE } from "@/lib/community/feedView";
import { notifyForkPublished } from "@/lib/community/server/notify";
import { bakePatternHeader } from "@/lib/community/server/moduleCache";
import {
  countFeed,
  getPatternStub,
  likedPatternIds,
  listFeed,
  newId,
  parseFeedSort,
} from "@/lib/community/server/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { patterns } from "@/lib/community/server/schema";
import { toCardItem } from "@/lib/community/server/serialize";
import {
  CODE_MAX,
  TITLE_ERROR,
  cleanCode,
  cleanCpp,
  cleanDescription,
  cleanMadeHow,
  cleanTitle,
} from "@/lib/community/validate";
import { cleanVisibility, forkBlocked } from "@/lib/community/visibility";
import { buildStoredPatternCode, lineageFrom } from "@/lib/community/license";
import { LICENSE_OPTIONS, forkLicenseAllowed, stripShareWrapping } from "@/lib/pattern/share";

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

// ── The same submission twice (#455) ──
// A double-click, a mouse switch that bounces, or a retry after a response
// that never arrived sends the identical publish twice — and each used to
// become its own post: the same pattern side by side on the wall, created in
// the same second. So an identical submission from the same account inside
// this window is answered with the post it already made.
//
// "Identical" is every field the author sent: title, description, the code
// with its licence wrapping off (the header is rebuilt per request and
// carries a date), the header, licence, "made how", visibility and parent.
// Change any one of them and it is a new post, however quickly it follows.
// A minute is long enough for a retry and too short for anything anybody
// would mean as a second post of the same thing.
const DUPLICATE_WINDOW_MS = 60_000;

function clampInt(raw: string | null, fallback: number, min: number, max: number) {
  // Absent is not zero. Number(null) and Number("") are both 0, a finite
  // number, so a request without ?size= used to clamp up to the minimum and
  // get one pattern back instead of the default page.
  if (raw === null || raw.trim() === "") return fallback;
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
  // The wall's search box and the marquee picker both send ?q=. Optional and
  // absent by default; listFeed trims and caps the text, and it only ever
  // narrows the public set. Oldest-first is a sort (?sort=old), not a flag.
  const q = params.get("q");

  // The infinite scroll refills through here, so every page needs the same
  // viewer the first paint had: `liked` for the subset itself, and the card
  // hearts on any sort — without it page two would arrive unlit.
  const session = await getAuth().api.getSession({ headers: request.headers });
  const viewerId = session?.user.id ?? null;

  const [items, total] = await Promise.all([
    listFeed({ sort, hardwareOnly, limit: size, offset, viewerId, q }),
    // The same view listFeed pages through — for "liked" that is the
    // viewer's likes, not the whole wall.
    countFeed(hardwareOnly, { q, sort, viewerId }),
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

  const raw = await readJsonObject(request);
  if (raw instanceof Response) return raw;

  const title = cleanTitle(raw.title);
  if (!title) return Response.json({ error: TITLE_ERROR }, { status: 400 });

  const description = cleanDescription(raw.description);
  if (description === undefined) {
    return Response.json({ error: "Description is too long (max 2000 chars)." }, { status: 400 });
  }

  // Measured with the licence wrapping off: that is what gets stored, and a
  // pattern accepted just under the cap came back from a download or a fork
  // a few hundred characters over it, unchanged and refused.
  const code = cleanCode(
    typeof raw.code === "string" && raw.code.length <= CODE_MAX * 2 ? stripShareWrapping(raw.code) : raw.code,
  );
  if (!code) return Response.json({ error: "Pattern code is missing or over 100KB." }, { status: 400 });

  // Any licence block the code arrived with belongs to someone else (a lab
  // preset's header, the Lab's old AI gallery stamp, a previously exported
  // file), so drop it before we write our own.
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
  const handle =
    (session.user as { username?: string | null; displayUsername?: string | null }).displayUsername ??
    (session.user as { username?: string | null }).username ??
    null;
  // Licence header + attribution are baked into the stored source, so anyone
  // who copies the code out of the page takes the terms and the credit with
  // it — not just people who download the file. On a fork that includes the
  // upstream credit, which both CC licences require a derivative to keep.
  const storedCode = buildStoredPatternCode(code, {
    title,
    license,
    handle,
    date: now,
    basedOn: lineageFrom(parent),
  });
  const bareCode = stripShareWrapping(storedCode);

  // Looking for the twin and inserting are one synchronous IMMEDIATE
  // transaction. With an await between them, two requests arriving together
  // would each look, each find nothing and each insert — the very race this
  // guards against. Synchronous, nothing else in this process runs in
  // between; IMMEDIATE takes the write lock up front, so neither can anything
  // in another process.
  const { id, created } = getDb().transaction(
    (tx) => {
      const recent = tx
        .select({
          id: patterns.id,
          description: patterns.description,
          code: patterns.code,
          codeCpp: patterns.codeCpp,
          license: patterns.license,
          madeHow: patterns.madeHow,
          visibility: patterns.visibility,
          parentId: patterns.parentId,
        })
        .from(patterns)
        .where(
          and(
            eq(patterns.userId, session.user.id),
            eq(patterns.title, title),
            gte(patterns.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS)),
          ),
        )
        .all();
      const twin = recent.find(
        (row) =>
          row.description === description &&
          row.codeCpp === codeCpp &&
          row.license === license &&
          row.madeHow === madeHow &&
          row.visibility === visibility &&
          row.parentId === parentId &&
          stripShareWrapping(row.code) === bareCode,
      );
      if (twin) return { id: twin.id, created: false };

      const fresh = newId();
      tx.insert(patterns)
        .values({
          id: fresh,
          userId: session.user.id,
          title,
          description,
          code: storedCode,
          codeCpp,
          license,
          madeHow,
          parentId,
          visibility,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return { id: fresh, created: true };
    },
    { behavior: "immediate" },
  );

  // The same answer the first request got, minus everything it already did:
  // the fork was announced and the header queued when the post was made.
  if (!created) return Response.json({ id }, { status: 200 });

  if (parent) {
    await notifyForkPublished({
      parentOwnerId: parent.userId,
      parentTitle: parent.title,
      forkId: id,
      forkVisibility: visibility,
      actorId: session.user.id,
    });
  }

  // Published with a header: compile it now, so the first install is a hit.
  // Never throws; a no-op without a build worker (moduleCache.ts).
  if (codeCpp) await bakePatternHeader(id);

  return Response.json({ id }, { status: 201 });
}
