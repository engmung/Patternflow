import fs from "node:fs/promises";
import path from "node:path";
import { artifactDir, getBuild } from "@/lib/community/builds";
import { preflight, withCors } from "@/lib/community/cors";
import { communityEnabled } from "@/lib/community/db";

// GET /api/community/builds/[id]/firmware — the built application image.
//
// No credential check by design: esp-web-tools fetches this itself, without
// cookies and possibly cross-origin. The build id is the capability (see the
// status route). No CORS *rejection* either, for the same reason — the flasher
// must be able to read it from whichever origin the page was served from.

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withCors(request, await handleGet(context));
}

export const OPTIONS = preflight;

async function handleGet(context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return new Response("Community is not enabled on this deployment.", { status: 503 });
  }

  const { id } = await context.params;
  const build = await getBuild(id);
  if (!build || build.status !== "done" || !build.artifact) {
    return new Response("No firmware for this build.", { status: 404 });
  }

  // The artifact name comes from the database, but it is still joined and then
  // checked: a stored value containing traversal must not be able to read
  // outside the artifact directory.
  const directory = artifactDir();
  const file = path.resolve(directory, build.artifact);
  if (!file.startsWith(path.resolve(directory) + path.sep)) {
    return new Response("Invalid artifact path.", { status: 400 });
  }

  let image: Buffer;
  try {
    image = await fs.readFile(file);
  } catch {
    return new Response("Firmware image is missing from disk.", { status: 410 });
  }

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(image.byteLength),
      "Content-Disposition": `attachment; filename="patternflow-${build.id}.bin"`,
      // Immutable once built, and the URL contains the build id.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
