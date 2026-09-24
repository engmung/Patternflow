import { communityEnabled } from "@/lib/community/server/db";
import { assembleDeckPack, deckZipFilename } from "@/lib/community/server/deckZip";
import {
  PUBLIC_CORS,
  buildingResponse,
  filesResponse,
  publicOptions,
} from "@/lib/community/server/modulePack";
import { getDeck } from "@/lib/community/server/queries";

// GET /api/community/decks/[id]/zip — the deck as an installable pack.
//
// A `.zip` of `.pfm` + `.json` per included pattern, `catalog.txt` in the
// deck's running order, and the attached performance's `.pfs` when there is
// one: drop it on a device's /patterns page and the set installs in order.
// This is the address you paste in Discord, so it deliberately needs NO
// sign-in and no cookies — a public deck id is the capability.
//
// Assembled per request from the module cache (lib/community/server/
// deckZip.ts), so a hit never waits on the build queue. A deck with a header
// nobody has compiled yet asks for it and answers 202 — JSON for the device
// page and the site's own polling, a page that refreshes itself for a person
// who opened the link — and every request after that is a file. That is the
// honest shape: pretending to stream while a compiler runs would just be a
// timeout with extra steps.
//
//   (no params)   the pack; 202 while building; 409 when nothing can go in
//   ?status=1     always JSON — {state, total, included, pending?, skipped}
//                 — and a miss still queues its bake, so polling this is
//                 enough to warm the pack
//   ?list=1       {files: [...]}, and ?file=<name> one member — for v3.2–3.3
//                 consoles, whose /patterns?src= fetched files one by one
//
// A slot that cannot be included (removed or private, no header, a header
// that does not compile, a build service that failed on it just now) is left
// out and listed in `skipped` — one bad pattern no longer costs the set.
//
// CORS is public for the same reason the modules route is: the page fetching
// this may be served from a device on someone's LAN, and a raw IP is exactly
// what an allowlist cannot enumerate.

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await handleGet(request, context);
  for (const [key, value] of Object.entries(PUBLIC_CORS)) response.headers.set(key, value);
  return response;
}

export function OPTIONS() {
  return publicOptions();
}

const NO_WORKER =
  "Pattern builds are not enabled on this deployment, and some of this deck has never been compiled.";

async function handleGet(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const pack = await assembleDeckPack(id, deck.performanceJson);
  const query = new URL(request.url).searchParams;

  if (query.get("status") === "1") {
    // The one exception to "status always answers 200": a deployment that
    // cannot compile has no state to report that would ever change, and a
    // 200 "building" would have the page poll it forever.
    if (pack.state === "unavailable") {
      return Response.json(
        { error: NO_WORKER, state: "unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      {
        state: pack.state,
        total: pack.total,
        included: pack.included,
        ...(pack.state === "building" ? { pending: pack.pending } : {}),
        skipped: pack.skipped,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  switch (pack.state) {
    case "unavailable":
      return Response.json({ error: NO_WORKER, state: "unavailable" }, { status: 503 });
    case "empty":
      return Response.json(
        {
          error: "Nothing in this deck can be installed yet — none of its patterns has a header that builds.",
          state: "empty",
          skipped: pack.skipped,
        },
        { status: 409 },
      );
    case "building":
      return buildingResponse(request, "pack");
    case "ready":
      return filesResponse(request, pack.files, deckZipFilename(deck.title, deck.id));
  }
}
