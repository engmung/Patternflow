import fs from "node:fs/promises";
import path from "node:path";
import { artifactDir, getBuild } from "@/lib/community/builds";
import { communityEnabled } from "@/lib/community/db";

// GET /api/community/builds/[id]/modules — the built .pfm modules, zipped.
//
// The module counterpart of ../firmware: one zip holding <slug>.pfm and
// <slug>.json for every pattern in the build. Installing is unzip + drop the
// files onto the device's /patterns page (it accepts several at once) — no
// reflash, no reboot.
//
// Same access model as the firmware route: the 64-bit build id in the URL is
// the capability, no cookies. CORS is public for the same reason — a LAN
// device origin (raw IP, different in every home) is exactly what an allowlist
// cannot enumerate, and a future device-side "fetch from community" needs to
// reach this cross-origin.

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
  if (!build || build.status !== "done" || !build.artifact || build.format !== "pfm") {
    return new Response("No modules for this build.", { status: 404 });
  }

  // The artifact name comes from the database, but it is still joined and then
  // checked: a stored value containing traversal must not be able to read
  // outside the artifact directory.
  const directory = artifactDir();
  const file = path.resolve(directory, build.artifact);
  if (!file.startsWith(path.resolve(directory) + path.sep)) {
    return new Response("Invalid artifact path.", { status: 400 });
  }

  let zip: Buffer;
  try {
    zip = await fs.readFile(file);
  } catch {
    return new Response("Module bundle is missing from disk.", { status: 410 });
  }

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.byteLength),
      "Content-Disposition": `attachment; filename="patternflow-modules-${build.id}.zip"`,
      // Immutable once built, and the URL contains the build id.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
