import { getAuth } from "@/lib/community/server/auth";
import { DECK_MAX } from "@/lib/community/deck";
import {
  countActiveBuilds,
  enqueueBuild,
  supersedeQueuedBuilds,
  type BuildFormat,
  type BuildPatternInput,
} from "@/lib/community/server/builds";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { readJsonObject } from "@/lib/community/jsonBody";
import { communityEnabled } from "@/lib/community/server/db";
import { rateLimit } from "@/lib/community/ratelimit";
import { CPP_MAX } from "@/lib/community/validate";
import { validateCustomPattern } from "@/lib/firmware/assemble";

// POST /api/community/builds — queue a module build.
//
// The compile itself happens in the worker process (see scripts/build-worker),
// so this returns as soon as the job is on the queue. What it does do is run
// the same validation the worker will: a header that will not compile is worth
// reporting now rather than after the wait.
//
// Modules only. Baking a pattern INTO the firmware used to be the other half
// of this endpoint, and its one justification was that the rebuild came off
// the latest sources, so it doubled as a firmware update. Updating is its own
// thing now — the device's console says when a release is newer and
// patternflow.work/update hands it over Wi-Fi — which leaves whole-image
// builds as a slow way to do what a 6 KB .pfm does in seconds.

// One source of truth with the deck: a deck that fills to DECK_MAX must be
// buildable, so these cannot drift apart.
const MAX_MODULE_PATTERNS_PER_BUILD = DECK_MAX;

export async function POST(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePost(request));
}

export const OPTIONS = preflight;

/** Builds are off unless the deployment has a worker to run them. */
function buildsEnabled(): boolean {
  return process.env.BUILD_ENABLED === "1";
}

async function handlePost(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }
  if (!buildsEnabled()) {
    return Response.json(
      { error: "Firmware building is not enabled on this deployment." },
      { status: 503 },
    );
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to build firmware." }, { status: 401 });
  }

  // Builds are the most expensive thing a signed-in user can ask for, so they
  // are limited twice: by rate, and by how many can be COMPILING at once.
  // A user's own still-queued builds never block them — see below.
  if (!rateLimit(`build:${session.user.id}`, 30, 60 * 60_000)) {
    return Response.json(
      { error: "Build limit reached for this hour. Try again later." },
      { status: 429 },
    );
  }

  const body = await readJsonObject(request);
  if (body instanceof Response) return body;

  // "bin" asked for a whole firmware image. The community built those from 25
  // July 2026 (c5e0907) until 4c13474 removed them on 12 August, and since
  // then the word gets a 410 that says where to go instead of the 400 below.
  // No page here ever sent it. BuildFirmwareModal, the one dialog that asked
  // for an image, sent no format, and a missing format meant "bin" until 12
  // August. The 410 is for a caller outside this repository that names the
  // format, as this route's header told it to from 27 July (d7cd193).
  const rawFormat = body.format ?? "pfm";
  if (rawFormat === "bin") {
    return Response.json(
      {
        error:
          "Whole-firmware builds are gone. Patterns install as modules in seconds; " +
          "to update the firmware itself, open patternflow.work/update.",
      },
      { status: 410 },
    );
  }
  if (rawFormat !== "pfm") {
    return Response.json({ error: 'format must be "pfm".' }, { status: 400 });
  }
  const format: BuildFormat = rawFormat;

  const raw = body.patterns;
  if (!Array.isArray(raw) || raw.length === 0) {
    return Response.json({ error: "Send at least one pattern to build." }, { status: 400 });
  }
  if (raw.length > MAX_MODULE_PATTERNS_PER_BUILD) {
    return Response.json(
      { error: `At most ${MAX_MODULE_PATTERNS_PER_BUILD} modules per build.` },
      { status: 400 },
    );
  }

  const patterns: BuildPatternInput[] = [];
  for (const [index, entry] of raw.entries()) {
    // `[null]` threw on `.code` below and came back a 500 without CORS.
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return Response.json(
        { error: `Pattern ${index + 1}: expected an object with the header in "code".` },
        { status: 400 },
      );
    }
    const item = entry as Record<string, unknown>;
    const code = typeof item.code === "string" ? item.code : "";
    if (code.length === 0 || code.length > CPP_MAX) {
      return Response.json(
        { error: `Pattern ${index + 1}: header is empty or over ${CPP_MAX / 1000}KB.` },
        { status: 400 },
      );
    }
    const label = typeof item.label === "string" && item.label.trim().length > 0
      ? item.label.trim().slice(0, 80)
      : `pattern ${index + 1}`;
    patterns.push({ label, code });
  }

  // Dry-run so bad submissions fail here, with a readable reason. A module
  // never enters the firmware image, so preset-namespace collisions and the
  // registry itself are irrelevant — shape-check each header alone.
  const namespaces: string[] = [];
  for (const pattern of patterns) {
    const verdict = validateCustomPattern(pattern.code);
    if (!verdict.ok) {
      return Response.json({ error: `${pattern.label}: ${verdict.error}` }, { status: 400 });
    }
    namespaces.push(verdict.namespace);
  }

  // Iterating on a pattern means re-submitting fast, and the newest submission
  // is the one the user wants: cancel their still-queued builds instead of
  // bouncing them off their own queue. Runs only after validation, so a
  // malformed request can never wipe a good queued build. Compiles already
  // running are untouched — only those still count against the cap.
  await supersedeQueuedBuilds(session.user.id);
  if ((await countActiveBuilds(session.user.id)) >= 2) {
    return Response.json(
      { error: "Your previous builds are still compiling. Try again in a few seconds." },
      { status: 429 },
    );
  }

  const id = await enqueueBuild(session.user.id, patterns, format);
  return Response.json({ id, format, namespaces }, { status: 202 });
}
