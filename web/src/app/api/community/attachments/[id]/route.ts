import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { isAdminSession } from "@/lib/community/server/admin";
import { attachmentPath, sniffImage } from "@/lib/community/server/attachments";
import { getAuth } from "@/lib/community/server/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/server/db";
import { getAttachment } from "@/lib/community/server/queries";
import { postAttachments } from "@/lib/community/server/schema";

// GET /api/community/attachments/[id] — hand back a file from a thread.
// DELETE the same — take one back off.
//
// Two paths out, decided by the BYTES rather than the uploaded name:
//
//   - Verified raster images (png/jpeg/gif/webp by magic number) are served
//     inline with their real content type, so a build photo shows up IN the
//     thread instead of landing in Downloads. `CSP: sandbox` rides along as
//     the belt to that brace: even if something were mis-sniffed, the response
//     renders with no scripts, no origin, no cookies.
//
//   - Everything else is application/octet-stream + attachment, whatever it
//     claims to be. An .svg or .html hung on a thread is somebody else's
//     markup on our origin — served inline it would run with our cookies,
//     which is stored XSS. SVG stays on this path forever: it is a document,
//     and there is no magic number that makes a document safe.
//
// No auth check: threads are public, so their files are too. The id is the
// capability, and it is not guessable.

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const { id } = await context.params;
  const row = await getAttachment(id);
  if (!row) {
    return Response.json({ error: "File not found." }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(attachmentPath(row.id));
  } catch {
    // The row outlived its file — a restored database against a fresh disk,
    // say. A 404 is the honest answer.
    return Response.json({ error: "File not found." }, { status: 404 });
  }

  // The stored name is already stripped of quotes and control characters
  // (cleanFilename), so it is safe to put in the header; filename* carries the
  // non-ASCII form for browsers that want it.
  const encoded = encodeURIComponent(row.filename);
  const image = sniffImage(bytes);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": image ?? "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${image ? "inline" : "attachment"}; filename="${row.filename}"; filename*=UTF-8''${encoded}`,
      // A thread's file never changes — the row is immutable once written.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // For the inline path: no scripts, no origin, no cookies, even if the
      // sniff were somehow wrong. Harmless on downloads.
      "Content-Security-Policy": "sandbox",
    },
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handleDelete(request, context));
}

export const OPTIONS = preflight;

/**
 * Unattach a file.
 *
 * Attaching used to be one-way: pick the wrong file and it was on the thread
 * for good, under your name, with a permanent URL. That is a bad thing to do to
 * somebody over a misclick, and worse when the wrong file is one they did not
 * mean to publish at all.
 *
 * Only the person who uploaded it, or a moderator. The uploader is always the
 * author of the thread or reply it hangs on (the POST route enforces that), so
 * this is the same permission as editing the thing it is attached to.
 *
 * Row first, then bytes. A row pointing at a missing file already 404s
 * gracefully above; bytes with no row are invisible and permanent, so if the
 * unlink fails the sweep is what cleans up — never the other way round.
 */
async function handleDelete(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  const { id } = await context.params;
  const row = await getAttachment(id);
  if (!row) {
    return Response.json({ error: "File not found." }, { status: 404 });
  }
  if (row.userId !== session.user.id && !isAdminSession(session)) {
    return Response.json({ error: "That is not your file." }, { status: 403 });
  }

  await getDb().delete(postAttachments).where(eq(postAttachments.id, row.id));
  await fs.rm(attachmentPath(row.id), { force: true }).catch(() => undefined);

  return Response.json({ ok: true });
}
