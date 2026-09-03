import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

// Serves a hosted variant firmware image.
//
// Why this exists rather than a file in `public/`: these are binaries, one to
// two megabytes each, and they change every time a maintainer cuts a release.
// Putting them in git means the repository carries every version of every
// variant forever. They live on the Pi instead, in a directory outside the
// checkout, and this route hands them out.
//
// Why this exists rather than linking straight to GitHub: the device cannot
// fetch over the internet — TLS needs tens of KB of heap and the board has
// single digits spare — so the panel's own /update page takes a `?src=` URL
// and the BROWSER downloads it and POSTs it to the board. That fetch is
// cross-origin, from `http://patternflow.local` to wherever the image is, so
// the image has to send CORS headers. **GitHub release assets do not.** They
// were checked; there is no `access-control-allow-origin` on them at all.
//
// So one-click install only works for images served from somewhere we control
// the headers, which is the same boundary as "somebody vouched for this
// build" — see the note in editions-data.ts. Everything else links out to the
// maintainer's own releases and is downloaded by hand.
//
// On Vercel `VARIANT_BIN_DIR` is unset and every request 404s. That is
// correct: the static deployment has no business distributing firmware.
//
// **Nothing on the shelf uses this today.** Official firmwares are built
// here and their images sit under /flash/bin, which already sends CORS. This
// exists for the community tier — somebody else's build, vouched for and
// served from the Pi so it can be installed in one click like the rest. It
// is not dead code; it is an empty shelf slot with the plumbing already in.

export const dynamic = "force-dynamic";

const CORS = {
  // The board's page is the caller and its origin is whatever the panel is
  // named on that LAN. There is no list to allow.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

function resolveSafe(parts: string[]): string | null {
  const root = process.env.VARIANT_BIN_DIR;
  if (!root) return null;
  // Join, then confirm the result is still inside root. `..` in a path
  // segment is the obvious attack and normalize() is what catches it.
  const full = path.normalize(path.join(root, ...parts));
  const rootAbs = path.resolve(root);
  if (!path.resolve(full).startsWith(rootAbs + path.sep)) return null;
  return full;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await ctx.params;
  const file = resolveSafe(parts ?? []);
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    return new Response("not found", { status: 404, headers: CORS });
  }

  const size = statSync(file).size;
  const stream = Readable.toWeb(
    createReadStream(file),
  ) as unknown as ReadableStream;

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      // A hosted image is replaced in place when the version it stands for
      // changes, so it must not be cached as immutable the way core's
      // version-stamped bins are.
      "Cache-Control": "public, max-age=300",
    },
  });
}
