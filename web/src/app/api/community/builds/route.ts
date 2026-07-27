import fs from "node:fs/promises";
import { getAuth } from "@/lib/community/auth";
import {
  countActiveBuilds,
  enqueueBuild,
  supersedeQueuedBuilds,
  type BuildFormat,
  type BuildPatternInput,
} from "@/lib/community/builds";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled } from "@/lib/community/db";
import { rateLimit } from "@/lib/community/ratelimit";
import { CPP_MAX } from "@/lib/community/validate";
import {
  assembleFirmwareSource,
  validateCustomPattern,
  MAX_CUSTOM_SLOTS,
} from "@/lib/firmware/assemble";
import { registryPath } from "@/lib/firmware/paths";

// POST /api/community/builds — queue a firmware build.
//
// The compile itself happens in the worker process (see scripts/build-worker),
// so this returns as soon as the job is on the queue. What it does do is run
// the same validation the worker will: a namespace that collides with a bundled
// pattern is worth reporting now rather than after a fifteen second wait.
//
// `format` selects what comes out. "bin" (default) is a whole flashable image,
// limited to the firmware's custom slots. "pfm" is loadable modules — one .pfm
// per pattern, zipped — where the slot limit does not apply because nothing is
// compiled into the image; the cap there is only queue hygiene.

const MAX_MODULE_PATTERNS_PER_BUILD = 10;

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawFormat = (body as Record<string, unknown>).format ?? "bin";
  if (rawFormat !== "bin" && rawFormat !== "pfm") {
    return Response.json({ error: 'format must be "bin" or "pfm".' }, { status: 400 });
  }
  const format: BuildFormat = rawFormat;

  const raw = (body as Record<string, unknown>).patterns;
  if (!Array.isArray(raw) || raw.length === 0) {
    return Response.json({ error: "Send at least one pattern to build." }, { status: 400 });
  }
  if (format === "bin" && raw.length > MAX_CUSTOM_SLOTS) {
    return Response.json(
      { error: `The firmware has ${MAX_CUSTOM_SLOTS} custom slots.` },
      { status: 400 },
    );
  }
  if (format === "pfm" && raw.length > MAX_MODULE_PATTERNS_PER_BUILD) {
    return Response.json(
      { error: `At most ${MAX_MODULE_PATTERNS_PER_BUILD} modules per build.` },
      { status: 400 },
    );
  }

  const patterns: BuildPatternInput[] = [];
  for (const [index, entry] of raw.entries()) {
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

  // Dry-run so bad submissions fail here, with a readable reason.
  let namespaces: string[];
  if (format === "pfm") {
    // A module never enters the firmware image, so preset-namespace collisions
    // and the registry itself are irrelevant — shape-check each header alone.
    namespaces = [];
    for (const pattern of patterns) {
      const verdict = validateCustomPattern(pattern.code);
      if (!verdict.ok) {
        return Response.json({ error: `${pattern.label}: ${verdict.error}` }, { status: 400 });
      }
      namespaces.push(verdict.namespace);
    }
  } else {
    let registry: string;
    try {
      registry = await fs.readFile(registryPath(), "utf8");
    } catch {
      return Response.json(
        { error: "Firmware sources are not available on this deployment." },
        { status: 503 },
      );
    }

    const assembled = assembleFirmwareSource(patterns, registry);
    if (!assembled.ok) {
      return Response.json({ error: assembled.error }, { status: 400 });
    }
    namespaces = assembled.namespaces;
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
