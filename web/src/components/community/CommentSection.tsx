"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import BodyComposer from "./BodyComposer";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_PER_PARENT,
  formatBytes,
} from "@/lib/community/workshop";
import type { AttachmentView } from "@/lib/community/queries";
import { COMMENT_MAX } from "@/lib/community/validate";
import AttachmentList from "./AttachmentList";
import AuthModal from "./AuthModal";
import PostBody from "./PostBody";
import { formatDate } from "./PatternCard";
import styles from "./Community.module.css";

// Comment thread, shared by pattern pages and board threads. Reading is free;
// writing asks for login right here. Bodies are plain text — React escaping on
// output is the XSS defence, and LinkedText keeps it that way while making
// bare URLs clickable.

export type CommentView = {
  id: string;
  /** Who wrote it — drives whether the edit/delete controls appear. */
  userId: string;
  body: string;
  createdAt: string; // ISO
  /** Set when the author rewrote it, so the thread can say so. */
  editedAt: string | null;
  username: string | null;
  displayUsername: string | null;
};

/** What the thread hangs off. The two have separate tables and endpoints. */
export type CommentTarget = { kind: "pattern" | "post"; id: string };

const ACCEPT = ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(",");

export default function CommentSection({
  target,
  comments,
  attachments = [],
  workingUserIds = [],
}: {
  target: CommentTarget;
  comments: CommentView[];
  /** Files hung on this thread, body and replies together. */
  attachments?: AttachmentView[];
  /** Everyone pinned in the thread's territory: their replies get a tag, so a
   *  reader can tell "someone who has actually built this" from a passer-by. */
  workingUserIds?: string[];
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  // Files waiting to ride on the next reply. Workshop threads only — pattern
  // comments have no attachment table, and test results live in replies.
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Which comment is open for editing, and the draft inside it.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // Deleting is one click away but takes two, because there is no undo and the
  // button sits right beside "edit".
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);


  const viewerId = session?.user.id ?? null;
  const on = target.kind === "post" ? "post" : "pattern";

  const saveEdit = async (id: string) => {
    const text = draft.trim();
    if (text.length === 0) return;
    setRowBusy(id);
    setRowError(null);
    try {
      const response = await fetch(
        communityApiUrl(`/api/community/comments/${id}?on=${on}`),
        {
          method: "PATCH",
          ...COMMUNITY_FETCH_INIT,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setRowError(payload.error ?? "Could not save the edit.");
        return;
      }
      setEditingId(null);
      router.refresh();
    } catch {
      setRowError("Network error.");
    } finally {
      setRowBusy(null);
    }
  };

  const remove = async (id: string) => {
    setRowBusy(id);
    setRowError(null);
    try {
      const response = await fetch(
        communityApiUrl(`/api/community/comments/${id}?on=${on}`),
        { method: "DELETE", ...COMMUNITY_FETCH_INIT },
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setRowError(payload.error ?? "Could not delete the comment.");
        return;
      }
      setConfirmDelete(null);
      router.refresh();
    } catch {
      setRowError("Network error.");
    } finally {
      setRowBusy(null);
    }
  };

  const submit = async () => {
    const text = body.trim();
    if (text.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const collection = target.kind === "post" ? "posts" : "patterns";
      const response = await fetch(
        communityApiUrl(`/api/community/${collection}/${target.id}/comments`),
        {
          method: "POST",
          ...COMMUNITY_FETCH_INIT,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        },
      );
      const payload = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) {
        setError(payload.error ?? "Comment failed.");
        return;
      }

      // Files ride on the reply that was just created. Second request on
      // purpose (same shape as the new-thread modal): a rejected file must not
      // cost the words, which are already saved by the time this runs.
      if (target.kind === "post" && files.length > 0 && payload.id) {
        const form = new FormData();
        form.set("postId", target.id);
        form.set("commentId", payload.id);
        for (const file of files) form.append("files", file);
        const upload = await fetch(communityApiUrl("/api/community/attachments"), {
          method: "POST",
          ...COMMUNITY_FETCH_INIT,
          body: form,
        });
        if (!upload.ok) {
          const detail = (await upload.json()) as { error?: string };
          // The reply is up — say exactly that, not "it failed".
          setError(
            `Reply posted, but the files did not attach: ${detail.error ?? "upload failed"}.`,
          );
          setBody("");
          setFiles([]);
          router.refresh();
          return;
        }
      }

      setBody("");
      setFiles([]);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.commentsBlock}>
      <h2 className={styles.commentsTitle}>Comments ({comments.length})</h2>

      {comments.map((comment) => {
        const mine = viewerId !== null && viewerId === comment.userId;
        const editing = editingId === comment.id;
        return (
          <div key={comment.id} className={styles.commentItem}>
            <div className={styles.commentHead}>
              <Link
                href={`/community/u/${comment.username ?? ""}`}
                className={styles.commentAuthor}
              >
                @{comment.displayUsername ?? comment.username ?? "unknown"}
              </Link>
              {/* Somebody who has actually put hands on this direction, not a
                  passer-by. Worth knowing before you read the reply. */}
              {workingUserIds.includes(comment.userId) && (
                <span className={styles.workingTag}>
                  <i aria-hidden="true" />
                  working here
                </span>
              )}
              <span className={styles.commentDate}>{formatDate(comment.createdAt)}</span>
              {comment.editedAt && <span className={styles.commentEdited}>edited</span>}
              {mine && !editing && (
                <span className={styles.commentActions}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(comment.id);
                      setDraft(comment.body);
                      setRowError(null);
                    }}
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy === comment.id}
                    onClick={() => {
                      if (confirmDelete === comment.id) void remove(comment.id);
                      else {
                        setConfirmDelete(comment.id);
                        window.setTimeout(
                          () => setConfirmDelete((current) => (current === comment.id ? null : current)),
                          4000,
                        );
                      }
                    }}
                  >
                    {confirmDelete === comment.id ? "press again" : "delete"}
                  </button>
                </span>
              )}
            </div>
            {editing ? (
              <div className={styles.commentForm}>
                <BodyComposer
                  value={draft}
                  onChange={setDraft}
                  maxLength={COMMENT_MAX}
                  label="Edit comment"
                  grow="comment"
                  autoFocus
                />
                {rowError && <div className={styles.formError}>{rowError}</div>}
                <div className={styles.commentEditRow}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={rowBusy === comment.id || draft.trim().length === 0}
                    onClick={() => void saveEdit(comment.id)}
                  >
                    {rowBusy === comment.id ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => {
                      setEditingId(null);
                      setRowError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.commentBody}>
                <PostBody text={comment.body} />
                <AttachmentList
                  files={attachments.filter((file) => file.commentId === comment.id)}
                  canRemove={mine}
                />
              </div>
            )}
            {!editing && rowError && rowBusy === null && confirmDelete === comment.id && (
              <div className={styles.formError}>{rowError}</div>
            )}
          </div>
        );
      })}

      {session ? (
        <div className={styles.commentForm}>
          <BodyComposer
            value={body}
            onChange={setBody}
            maxLength={COMMENT_MAX}
            placeholder={
              target.kind === "post" ? "Reply — where are you with it?" : "Leave a comment…"
            }
            label={target.kind === "post" ? "Reply" : "Comment"}
            grow="comment"
          />

          {files.length > 0 && (
            <div className={styles.fileChips}>
              {files.map((file, index) => (
                <span key={`${file.name}-${index}`} className={styles.fileChip}>
                  ▤ {file.name} <span>{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && <div className={styles.formError}>{error}</div>}
          <div className={styles.composerRow}>
            {/* Workshop replies carry files — the DXF that finally fit, the
                photo of it on the bench. Pattern comments have nowhere to put
                one, so they don't offer. */}
            {target.kind === "post" && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  hidden
                  onChange={(event) => {
                    const list = event.target.files;
                    if (list) {
                      setFiles((current) =>
                        [...current, ...Array.from(list)].slice(0, ATTACHMENT_MAX_PER_PARENT),
                      );
                    }
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className={styles.composerLink}
                  onClick={() => fileRef.current?.click()}
                >
                  ▤ attach a file
                </button>
              </>
            )}
            <span className={styles.headerSpacer} />
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={busy || body.trim().length === 0}
              onClick={() => void submit()}
            >
              {busy ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.commentForm}>
          <div>
            <button type="button" className={styles.btn} onClick={() => setAuthOpen(true)}>
              Sign in to comment
            </button>
          </div>
        </div>
      )}

      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onAuthed={() => router.refresh()} />
      )}
    </section>
  );
}
