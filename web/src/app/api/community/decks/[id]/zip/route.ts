import fs from "node:fs/promises";
import path from "node:path";
import { artifactDir } from "@/lib/community/builds";
import { communityEnabled } from "@/lib/community/db";
import { deckZipFilename, ensureDeckZip, invalidateDeckZip } from "@/lib/community/deckZip";
import { getDeck } from "@/lib/community/queries";

// GET /api/community/decks/[id]/zip — the deck as an installable pack.
//
// A `.zip` of `.pfm` + `.json` + `catalog.txt`: drop it on a device's
// /patterns page and the set installs in its running order. This is the
// address you paste in Discord, so it deliberately needs NO sign-in and no
// cookies — a public deck id is the capability, exactly like a build id.
//
// The pack is built once per running order and cached on the deck (see
// deckZip.ts). A first request for a deck nobody has downloaded yet finds
// nothing built, queues it, and answers 202 with a JSON status; the page
// polls, and every request after that is a file. That is the honest shape:
// pretending to stream while a compiler runs would just be a timeout with
// extra steps.
//
// CORS is public for the same reason the modules route is: the page fetching
// this may be served from a device on someone's LAN, and a raw IP is exactly
// what an allowlist cannot enumerate.

const PUBLIC_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Length",
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await handleGet(request, context);
  for (const [key, value] of Object.entries(PUBLIC_CORS)) response.headers.set(key, value);
  return response;
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...PUBLIC_CORS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function handleGet(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const { id } = await context.params;
  const deck = await getDeck(id);
  // A private deck answers exactly like a missing one: this endpoint takes no
  // session, so it must not become a way to test whether an id exists.
  if (!deck || deck.visibility !== "public") {
    return Response.json({ error: "Deck not found." }, { status: 404 });
  }

  const state = await ensureDeckZip(id);

  if (state.state === "empty") {
    return Response.json(
      { error: "Nothing in this deck can be installed yet — its patterns have no verified header." },
      { status: 409 },
    );
  }
  if (state.state === "failed") {
    return Response.json({ error: "The pack failed to build.", buildId: state.buildId }, { status: 500 });
  }
  if (state.state === "building") {
    return Response.json(
      { status: "building", buildId: state.buildId, retryAfterMs: 2000 },
      { status: 202, headers: { "Retry-After": "2", "Cache-Control": "no-store" } },
    );
  }

  // Artifact name comes from the database, so it is joined and then checked:
  // a stored value carrying traversal must not read outside the store.
  const directory = artifactDir();
  const file = path.resolve(directory, state.artifact);
  if (!file.startsWith(path.resolve(directory) + path.sep)) {
    return new Response("Invalid artifact path.", { status: 400 });
  }

  let zip: Buffer;
  try {
    zip = await fs.readFile(file);
  } catch {
    // The retention sweep reaps old artifacts, and the fingerprint still
    // matches, so without dropping the cache here this deck would answer 410
    // forever. Forget the build and let the next request queue a fresh one.
    await invalidateDeckZip(id);
    return Response.json(
      { status: "rebuilding", retryAfterMs: 2000 },
      { status: 202, headers: { "Retry-After": "2", "Cache-Control": "no-store" } },
    );
  }

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.byteLength),
      "Content-Disposition": `attachment; filename="${deckZipFilename(deck.title)}"`,
      // The URL is stable and the contents are not: a deck can be rearranged
      // under the same address, so this is revalidated rather than kept.
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
