import { getBuild, parseBuildPatterns, queuePosition } from "@/lib/community/builds";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled } from "@/lib/community/db";

// GET /api/community/builds/[id] — poll a build.
//
// Readable by anyone holding the id, which is 64 bits of randomness and only
// ever handed to the person who queued the build. That matters because
// esp-web-tools fetches the manifest and image itself, without credentials and
// possibly from another origin — a cookie check here would break flashing from
// the main site's Pattern Lab. The id is the capability; nothing here exposes
// anything a guessing attacker could find by other means.

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleGet(context));
}

export const OPTIONS = preflight;

async function handleGet(context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const { id } = await context.params;
  const build = await getBuild(id);
  if (!build) return Response.json({ error: "Build not found." }, { status: 404 });

  const elapsedMs = build.startedAt
    ? (build.finishedAt ?? new Date()).getTime() - build.startedAt.getTime()
    : null;

  const done = build.status === "done";
  return Response.json(
    {
      id: build.id,
      status: build.status,
      format: build.format,
      patterns: parseBuildPatterns(build.patterns).map((pattern) => pattern.label),
      namespaces: build.namespaces ? (JSON.parse(build.namespaces) as string[]) : [],
      queuePosition: build.status === "queued" ? await queuePosition(build.id, build.createdAt) : null,
      elapsedMs,
      bytes: build.artifactBytes ?? null,
      error: build.error ?? null,
      // Only meaningful once done. Every build is modules now — the
      // whole-image fields (firmwareUrl, manifestUrl) went with that path.
      modulesUrl: done ? `/api/community/builds/${build.id}/modules` : null,
    },
    // A finished build never changes; a running one must not be cached at all.
    { headers: { "Cache-Control": done ? "private, max-age=60" : "no-store" } },
  );
}
