import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { getPattern } from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { patterns } from "@/lib/community/schema";
import { buildStoredPatternCode } from "@/lib/community/license";
import {
  cleanCode,
  cleanCpp,
  cleanDescription,
  cleanMadeOn,
  cleanTitle,
} from "@/lib/community/validate";
import { LICENSE_OPTIONS, stripShareWrapping } from "@/lib/sharePattern";

// PATCH /api/community/patterns/[id] — the author edits their own pattern.
//
// Partial update: only the fields present in the body change. Whatever the
// edit touches, the licence block is rebuilt from the row afterwards (see
// lib/community/license.ts) so the header in the source always matches the
// pattern's real title, licence and author.

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

// Deleting takes the comments and likes with it (both cascade). Forks survive:
// their `parent_id` is set to null, so a remix someone else built on top of
// this pattern doesn't vanish because the original author changed their mind —
// it just loses the lineage link.
async function handleDelete(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to delete your pattern." }, { status: 401 });
  }

  const { id } = await context.params;
  const pattern = await getPattern(id);
  if (!pattern) {
    return Response.json({ error: "Pattern not found." }, { status: 404 });
  }
  if (pattern.userId !== session.user.id) {
    return Response.json({ error: "You can only delete your own patterns." }, { status: 403 });
  }

  await getDb().delete(patterns).where(eq(patterns.id, id));
  return Response.json({ ok: true });
}

async function handlePatch(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to edit your pattern." }, { status: 401 });
  }

  if (!rateLimit(`patch:${session.user.id}`, 20, 60_000)) {
    return Response.json({ error: "Too many edits — wait a minute and try again." }, { status: 429 });
  }

  const { id } = await context.params;
  const pattern = await getPattern(id);
  if (!pattern) {
    return Response.json({ error: "Pattern not found." }, { status: 404 });
  }
  if (pattern.userId !== session.user.id) {
    // 403, not 404 — the pattern is public, it just isn't theirs to edit.
    return Response.json({ error: "You can only edit your own patterns." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  // ── Resolve each field, falling back to what is already stored ────────────
  let title = pattern.title;
  if (raw.title !== undefined) {
    const next = cleanTitle(raw.title);
    if (!next) return Response.json({ error: "Title is required (max 80 chars)." }, { status: 400 });
    title = next;
  }

  let description = pattern.description;
  if (raw.description !== undefined) {
    const next = cleanDescription(raw.description);
    if (next === undefined) {
      return Response.json({ error: "Description is too long (max 2000 chars)." }, { status: 400 });
    }
    description = next;
  }

  let license = pattern.license;
  if (raw.license !== undefined) {
    const match = LICENSE_OPTIONS.find((option) => option.spdx === raw.license);
    if (!match) return Response.json({ error: "Unknown licence." }, { status: 400 });
    license = match.spdx;
  }

  let madeOn = pattern.madeOn;
  if (raw.madeOn !== undefined) {
    const next = cleanMadeOn(raw.madeOn);
    if (next === undefined) {
      return Response.json(
        { error: "Made-on date must be a real past date in YYYY-MM-DD form." },
        { status: 400 },
      );
    }
    madeOn = next;
  }

  // Compare the bodies with any licence wrapping removed, so re-saving without
  // touching the code isn't mistaken for a code change.
  let bareCode = stripShareWrapping(pattern.code);
  let codeChanged = false;
  if (raw.code !== undefined) {
    const next = cleanCode(raw.code);
    if (!next) {
      return Response.json({ error: "Pattern code is missing or over 100KB." }, { status: 400 });
    }
    const nextBare = stripShareWrapping(next);
    if (nextBare.length === 0) {
      return Response.json({ error: "Pattern code is empty once the licence header is removed." }, { status: 400 });
    }
    codeChanged = nextBare !== bareCode;
    bareCode = nextBare;
  }

  let codeCpp = pattern.codeCpp;
  if (raw.codeCpp !== undefined) {
    const next = cleanCpp(raw.codeCpp);
    if (next === undefined) {
      return Response.json(
        { error: "That does not look like a Patternflow header — it must start with `#pragma once` and be under 200KB." },
        { status: 400 },
      );
    }
    codeCpp = next;
  } else if (codeChanged) {
    // A header is a port of a SPECIFIC version of the pattern, verified on real
    // hardware. Once the JavaScript moves, that guarantee is gone, so the
    // pattern drops back to "not hardware ready" until a fresh port is attached
    // — better than leaving a badge that quietly lies.
    codeCpp = null;
  }

  const handle = pattern.displayUsername ?? pattern.username ?? null;

  await getDb()
    .update(patterns)
    .set({
      title,
      description,
      license,
      madeOn,
      // The header records when the work was MADE, which is what a licence
      // notice is about. Falls back to the upload date when unset; `createdAt`
      // itself never moves.
      code: buildStoredPatternCode(bareCode, {
        title,
        license,
        handle,
        date: madeOn ?? pattern.createdAt,
      }),
      codeCpp,
      updatedAt: new Date(),
    })
    .where(eq(patterns.id, id));

  return Response.json({
    ok: true,
    hasCpp: codeCpp !== null,
    headerDetached: codeChanged && raw.codeCpp === undefined && pattern.codeCpp !== null,
  });
}
