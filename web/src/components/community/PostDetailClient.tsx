"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { POST_BODY_MAX, TITLE_MAX } from "@/lib/community/validate";
import CommentSection, { type CommentView } from "./CommentSection";
import LinkedText from "./LinkedText";
import { formatDate } from "./PatternCard";
import styles from "./Community.module.css";

// One discussion thread. Read-only for everyone; the author gets edit and delete.

export type PostView = {
  id: string;
  title: string;
  body: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
};

export default function PostDetailClient({
  post,
  comments,
  isOwner,
}: {
  post: PostView;
  comments: CommentView[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const edited = post.updatedAt !== post.createdAt;

  const save = async () => {
    if (title.trim().length === 0 || body.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/posts/${post.id}`), {
        method: "PATCH",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Could not save.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/posts/${post.id}`), {
        method: "DELETE",
        ...COMMUNITY_FETCH_INIT,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Could not delete.");
        return;
      }
      router.push("/community/discussions");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.discussionWrap}>
      <div className={styles.introRow}>
        <Link href="/community/discussions" className={styles.backLink}>
          ← Discussions
        </Link>
      </div>

      <article className={styles.postArticle}>
        {editing ? (
          <>
            <input
              className={styles.postTitleInput}
              value={title}
              maxLength={TITLE_MAX}
              aria-label="Post title"
              onChange={(event) => setTitle(event.target.value)}
            />
            <textarea
              className={styles.postBodyInput}
              value={body}
              maxLength={POST_BODY_MAX}
              aria-label="Post body"
              onChange={(event) => setBody(event.target.value)}
            />
            {error && <div className={styles.formError}>{error}</div>}
            <div className={styles.composerActions}>
              <button
                type="button"
                className={styles.btn}
                disabled={busy}
                onClick={() => {
                  setTitle(post.title);
                  setBody(post.body);
                  setError(null);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy || title.trim().length === 0 || body.trim().length === 0}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className={styles.postTitle}>{post.title}</h1>
            <div className={styles.postMeta}>
              <Link
                href={`/community/u/${post.username ?? ""}`}
                className={styles.commentAuthor}
              >
                @{post.displayUsername ?? post.username ?? "unknown"}
              </Link>
              <span className={styles.commentDate}>{formatDate(post.createdAt)}</span>
              {edited && <span className={styles.commentDate}>· edited</span>}
              {isOwner && (
                <>
                  <span className={styles.headerSpacer} />
                  <button
                    type="button"
                    className={styles.btnSmall}
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                  {confirmingDelete ? (
                    <>
                      <button
                        type="button"
                        className={styles.btnSmall}
                        disabled={busy}
                        onClick={() => setConfirmingDelete(false)}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        className={styles.btnSmallDanger}
                        disabled={busy}
                        onClick={() => void remove()}
                      >
                        {busy ? "Deleting…" : "Really delete"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.btnSmall}
                      onClick={() => setConfirmingDelete(true)}
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
            {error && <div className={styles.formError}>{error}</div>}
            <div className={styles.postBody}>
              <LinkedText text={post.body} />
            </div>
          </>
        )}
      </article>

      <CommentSection
        target={{ kind: "post", id: post.id }}
        comments={comments}
      />
    </div>
  );
}
