import { communityEnabled } from "@/lib/community/server/db";
import {
  buildsEnabled,
  currentBuilderRev,
  loadPatternSources,
  lookupModule,
  requestBake,
  sourceSha,
  touchModules,
  type CachedModule,
} from "@/lib/community/server/moduleCache";
import {
  PUBLIC_CORS,
  assignPackSlugs,
  buildingResponse,
  composeSidecar,
  filesResponse,
  publicOptions,
} from "@/lib/community/server/modulePack";

// GET /api/community/patterns/[id]/zip — one pattern, ready to install.
//
// `<slug>.pfm` + `<slug>.json`, and deliberately NO catalog.txt: installing a
// single pattern must not rewrite the running order somebody arranged on
// their board. It is the pattern page's "Download .zip" and the address its
// "Send over Wi-Fi" hands the device (`/patterns?src=…/zip` — the device page
// sees the path end in /zip, fetches it, and polls a 202 by itself).
//
// Public and cookie-less like the deck pack: a public pattern's id is the
// capability, and the device page that fetches this is on somebody's LAN.
//
// The module comes out of the cache (lib/community/server/moduleCache.ts):
// compiled once per header, by the worker, and served from the database ever
// after. A header nobody has compiled yet — or not since a firmware update
// changed the toolchain — is queued for a bake here, charged to its owner,
// and answered 202 until it lands.
//
//   200  the zip (or ?list=1 / ?file=<name>, for v3.2–3.3 consoles)
//   202  building — JSON, or a self-refreshing page for a person's browser
//   404  no such pattern, or it is not public (the same answer, on purpose)
//   409  the pattern has no firmware header
//   422  its header does not compile on the current toolchain (`detail` is
//        the compiler's tail)
//   503  it needs compiling and the build service cannot right now
//   ?status=1  JSON {state, slug?, bytes?, error?, detail?} — never a file,
//              and a miss still queues the bake, so polling it warms the cache

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await handleGet(request, context);
  for (const [key, value] of Object.entries(PUBLIC_CORS)) response.headers.set(key, value);
  return response;
}

export function OPTIONS() {
  return publicOptions();
}

const NO_STORE = { "Cache-Control": "no-store" };
const DOES_NOT_COMPILE = "This pattern's header does not compile on the current firmware toolchain.";

async function handleGet(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const { id } = await context.params;
  const wantStatus = new URL(request.url).searchParams.get("status") === "1";
  const source = (await loadPatternSources([id])).get(id);

  // Private answers exactly like missing: no session is read here, so this
  // must not be a way to learn that an id exists.
  if (!source || source.visibility !== "public") {
    return Response.json({ error: "Pattern not found." }, { status: 404 });
  }

  if (!source.header) {
    const error = "This pattern has no firmware header yet, so there is nothing to install.";
    return wantStatus
      ? Response.json({ state: "no-header", error }, { headers: NO_STORE })
      : Response.json({ error, state: "no-header" }, { status: 409 });
  }

  const sha = sourceSha(source.header.code);
  const rev = await currentBuilderRev();
  let row: CachedModule | null = rev ? await lookupModule(sha, rev) : null;

  if (!row) {
    // Nothing compiled for this toolchain. Without a worker nothing ever will
    // be, and "building" would be a promise nobody keeps.
    if (!buildsEnabled()) {
      return Response.json(
        { error: "Pattern builds are not enabled on this deployment.", state: "unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }
    const bake = await requestBake(source.header.code, source.header.ownerId, source.title);
    if (bake.state === "cached") {
      row = bake.row;
    } else if (bake.state === "backoff") {
      // The build service failed on this header a moment ago for a reason
      // that was not the code's (a timeout, a missing toolchain). Saying so
      // beats a 202 that would be polled until the page gives up.
      const retryAfter = Math.max(1, Math.ceil((bake.retryAt.getTime() - Date.now()) / 1000));
      return Response.json(
        {
          error: "The build service could not compile this pattern just now. Try again in a few minutes.",
          state: "unavailable",
          retryAfterMs: retryAfter * 1000,
        },
        { status: 503, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } },
      );
    } else if (bake.state === "queued") {
      return wantStatus
        ? Response.json({ state: "building" }, { headers: NO_STORE })
        : buildingResponse(request, "pattern");
    } else {
      // "disabled" — already answered above; kept for exhaustiveness.
      return Response.json(
        { error: "Pattern builds are not enabled on this deployment.", state: "unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }
  }

  if (row.status !== "done" || !row.pfm || !row.slug) {
    const detail = row.error ?? "";
    return wantStatus
      ? Response.json({ state: "error", error: DOES_NOT_COMPILE, detail }, { headers: NO_STORE })
      : Response.json({ error: DOES_NOT_COMPILE, state: "error", detail }, { status: 422 });
  }

  // Through the same rule a deck uses, so a pattern NAMEd "Performance" is
  // not handed to the board as a file its /patterns page throws away.
  const [slug] = assignPackSlugs([row.slug]);
  if (wantStatus) {
    return Response.json({ state: "ready", slug, bytes: row.bytes ?? row.pfm.byteLength }, { headers: NO_STORE });
  }

  if (rev) await touchModules([sha], rev);
  const files: Record<string, Uint8Array> = {
    [`${slug}.pfm`]: new Uint8Array(row.pfm),
    [`${slug}.json`]: new TextEncoder().encode(
      composeSidecar(row.sidecar, { name: row.name, slug, source }),
    ),
  };
  return filesResponse(request, files, `patternflow-${slug}.zip`);
}
