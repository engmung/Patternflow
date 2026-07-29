"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { COMMENT_MAX } from "@/lib/community/validate";
import AuthModal from "./AuthModal";
import LinkedText from "./LinkedText";
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

export default function CommentSection({
  target,
  comments,
}: {
  target: CommentTarget;
  comments: CommentView[];
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
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
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Comment failed.");
        return;
      }
      setBody("");
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
                <textarea
                  value={draft}
                  maxLength={COMMENT_MAX}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
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
                <LinkedText text={comment.body} />
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
          <textarea
            value={body}
            maxLength={COMMENT_MAX}
            placeholder="Leave a comment…"
            onChange={(event) => setBody(event.target.value)}
          />
          {error && <div className={styles.formError}>{error}</div>}
          <div>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={busy || body.trim().length === 0}
              onClick={() => void submit()}
            >
              {busy ? "Posting…" : "Post comment"}
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
