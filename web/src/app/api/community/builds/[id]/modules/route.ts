import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { artifactDir, getBuild } from "@/lib/community/server/builds";
import { communityEnabled } from "@/lib/community/server/db";

// GET /api/community/builds/[id]/modules — the built .pfm modules.
//
// Three shapes, all from the one stored zip:
//   (no params)   the zip itself, for the download-and-drop flow
//   ?list=1       JSON: { files: ["slug.pfm", "slug.json", …] }
//   ?file=<name>  one entry out of the zip
//
// The last two exist for one-click Wi-Fi install: the community page opens
// http://<device>/patterns?src=<this-url>, and that page — running in the
// visitor's own browser, which can reach both origins — fetches the list, then
// each file, and POSTs them to the device it is served from. Same trick the
// firmware modal's "Send over Wi-Fi" uses, so modules are not a step backwards
// from the flow people already know.
//
// Same access model as the firmware route: the 64-bit build id in the URL is
// the capability, no cookies. CORS is public for the same reason — a LAN
// device origin (raw IP, different in every home) is exactly what an allowlist
// cannot enumerate.

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

async function handleGet(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const query = new URL(request.url).searchParams;
  const wantedFile = query.get("file");
  const wantList = query.get("list") === "1";

  if (wantList || wantedFile) {
    // Unzipping per request instead of storing loose files keeps the artifact
    // store one-file-per-build; a deck's zip is tens of KB, so this is cheap.
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(zip));
    } catch {
      return new Response("Module bundle is corrupt.", { status: 500 });
    }

    if (wantList) {
      return Response.json(
        { files: Object.keys(entries).sort() },
        { headers: { "Cache-Control": "private, max-age=3600" } },
      );
    }

    // Exact-match lookup against the zip's own entry names — nothing here
    // touches the filesystem, so there is no path to traverse.
    const entry = wantedFile ? entries[wantedFile] : undefined;
    if (!entry) return new Response("No such file in this build.", { status: 404 });

    return new Response(new Uint8Array(entry), {
      headers: {
        "Content-Type": wantedFile!.endsWith(".json")
          ? "application/json"
          : "application/octet-stream",
        "Content-Length": String(entry.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
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
