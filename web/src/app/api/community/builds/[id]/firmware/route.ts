import fs from "node:fs/promises";
import path from "node:path";
import { artifactDir, getBuild } from "@/lib/community/builds";
import { communityEnabled } from "@/lib/community/db";

// GET /api/community/builds/[id]/firmware — the built application image.
//
// No credential check by design: esp-web-tools fetches this itself, without
// cookies and possibly cross-origin. The build id is the capability (see the
// status route).
//
// CORS is deliberately PUBLIC (`*`, no credentials) instead of the allowlist
// the rest of the community API uses: the device's own web console fetches
// this URL to flash over Wi-Fi (#232 — "Send over Wi-Fi" hands the build off
// to http://patternflow.local/update), and a LAN device origin — a raw IP,
// different in every home — is exactly what an allowlist cannot enumerate.
// Wildcard-without-credentials is safe here because the response needs no
// cookie and the build id in the URL is the whole capability.

const PUBLIC_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Length",
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await handleGet(context);
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

async function handleGet(context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return new Response("Community is not enabled on this deployment.", { status: 503 });
  }

  const { id } = await context.params;
  const build = await getBuild(id);
  if (!build || build.status !== "done" || !build.artifact || build.format === "pfm") {
    // A pfm build's artifact is a zip of modules, not a flashable image —
    // serving it from here with a .bin name would brick-scare somebody.
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
