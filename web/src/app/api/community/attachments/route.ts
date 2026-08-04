import fs from "node:fs/promises";
import { getAuth } from "@/lib/community/auth";
import { originBlocked, preflight, withCors } from "@/lib/community/cors";
import { communityEnabled, getDb } from "@/lib/community/db";
import { attachmentDir, attachmentPath } from "@/lib/community/attachments";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_PARENT,
  attachmentAllowed,
  cleanFilename,
  formatBytes,
} from "@/lib/community/workshop";
import {
  countAttachments,
  getPostCommentStub,
  getPostStub,
  newId,
} from "@/lib/community/queries";
import { rateLimit } from "@/lib/community/ratelimit";
import { postAttachments } from "@/lib/community/schema";

// POST /api/community/attachments — hang files on a thread or one of its
// replies. multipart/form-data: postId, optional commentId, and `files`.
//
// Called AFTER the thread or reply exists, not with it. That ordering means an
// attachment always has a parent — there is no upload session to expire, no
// orphaned bytes to sweep — and a failed upload leaves the writing intact for
// the author to retry rather than losing the post with it.
//
// This is not a file host and it runs on a Raspberry Pi: five files per parent,
// two megabytes each, and an extension allowlist. See lib/community/workshop.ts.

export async function POST(request: Request) {
  const blocked = originBlocked(request);
  if (blocked) return blocked;
  return withCors(request, await handlePost(request));
}

export const OPTIONS = preflight;

async function handlePost(request: Request) {
  if (!communityEnabled()) {
    return Response.json({ error: "Community is not enabled on this deployment." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to attach a file." }, { status: 401 });
  }

  if (!rateLimit(`attach:${session.user.id}`, 20, 60_000)) {
    return Response.json({ error: "Too many uploads — wait a minute." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a multipart form." }, { status: 400 });
  }

  const postId = String(form.get("postId") ?? "");
  const rawCommentId = form.get("commentId");
  const commentId = typeof rawCommentId === "string" && rawCommentId.length > 0 ? rawCommentId : null;

  // Only the person who wrote the thing may hang files on it — the file reads
  // as theirs, so it has to be.
  if (commentId) {
    const comment = await getPostCommentStub(commentId);
    if (!comment || comment.postId !== postId) {
      return Response.json({ error: "Reply not found." }, { status: 404 });
    }
    if (comment.userId !== session.user.id) {
      return Response.json({ error: "That is not your reply." }, { status: 403 });
    }
  } else {
    const post = await getPostStub(postId);
    if (!post) {
      return Response.json({ error: "Thread not found." }, { status: 404 });
    }
    if (post.userId !== session.user.id) {
      return Response.json({ error: "That is not your thread." }, { status: 403 });
    }
  }

  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "No files in the request." }, { status: 400 });
  }

  const already = await countAttachments(postId, commentId);
  if (already + files.length > ATTACHMENT_MAX_PER_PARENT) {
    return Response.json(
      { error: `Up to ${ATTACHMENT_MAX_PER_PARENT} files each — this one has ${already}.` },
      { status: 400 },
    );
  }

  // Validate everything before writing anything: a half-attached post is worse
  // than a rejected one.
  const accepted: { id: string; filename: string; bytes: Buffer }[] = [];
  for (const file of files) {
    const filename = cleanFilename(file.name);
    if (!filename) {
      return Response.json({ error: "A file had no usable name." }, { status: 400 });
    }
    if (!attachmentAllowed(filename)) {
      return Response.json(
        { error: `“${filename}” is not a file type we take. Link it from a repo instead.` },
        { status: 400 },
      );
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      return Response.json(
        {
          error: `“${filename}” is ${formatBytes(file.size)} — the limit is ${formatBytes(
            ATTACHMENT_MAX_BYTES,
          )}.`,
        },
        { status: 400 },
      );
    }
    accepted.push({
      id: newId(),
      filename,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
  }

  await fs.mkdir(attachmentDir(), { recursive: true });
  const now = new Date();
  const written: string[] = [];
  try {
    for (const item of accepted) {
      await fs.writeFile(attachmentPath(item.id), item.bytes);
      written.push(item.id);
    }
    await getDb()
      .insert(postAttachments)
      .values(
        accepted.map((item) => ({
          id: item.id,
          postId,
          commentId,
          userId: session.user.id,
          filename: item.filename,
          bytes: item.bytes.length,
          createdAt: now,
        })),
      );
  } catch {
    // Bytes on disk with no row pointing at them are invisible and permanent,
    // so a failed write takes its own files back out.
    await Promise.all(
      written.map((id) => fs.rm(attachmentPath(id), { force: true }).catch(() => undefined)),
    );
    return Response.json({ error: "Could not store the files." }, { status: 500 });
  }

  return Response.json(
    {
      ok: true,
      files: accepted.map((item) => ({
        id: item.id,
        filename: item.filename,
        bytes: item.bytes.length,
      })),
    },
    { status: 201 },
  );
}
