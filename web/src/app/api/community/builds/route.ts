import fs from "node:fs/promises";
import { getAuth } from "@/lib/community/auth";
import { countActiveBuilds, enqueueBuild, type BuildPatternInput } from "@/lib/community/builds";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled } from "@/lib/community/db";
import { rateLimit } from "@/lib/community/ratelimit";
import { CPP_MAX } from "@/lib/community/validate";
import { assembleFirmwareSource, MAX_CUSTOM_SLOTS } from "@/lib/firmware/assemble";
import { registryPath } from "@/lib/firmware/paths";

// POST /api/community/builds — queue a firmware build.
//
// The compile itself happens in the worker process (see scripts/build-worker),
// so this returns as soon as the job is on the queue. What it does do is run
// the same assembly the worker will: a namespace that collides with a bundled
// pattern is worth reporting now rather than after a fifteen second wait.

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
  // are limited twice: by rate, and by how many can be in flight at once.
  if (!rateLimit(`build:${session.user.id}`, 10, 60 * 60_000)) {
    return Response.json(
      { error: "Build limit reached for this hour. Try again later." },
      { status: 429 },
    );
  }
  if ((await countActiveBuilds(session.user.id)) >= 2) {
    return Response.json(
      { error: "You already have builds queued. Wait for them to finish." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>).patterns;
  if (!Array.isArray(raw) || raw.length === 0) {
    return Response.json({ error: "Send at least one pattern to build." }, { status: 400 });
  }
  if (raw.length > MAX_CUSTOM_SLOTS) {
    return Response.json(
      { error: `The firmware has ${MAX_CUSTOM_SLOTS} custom slots.` },
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

  // Dry-run the assembly so bad submissions fail here, with a readable reason.
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

  const id = await enqueueBuild(session.user.id, patterns);
  return Response.json({ id, namespaces: assembled.namespaces }, { status: 202 });
}
