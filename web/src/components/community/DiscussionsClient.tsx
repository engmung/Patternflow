"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { POST_BODY_MAX, TITLE_MAX } from "@/lib/community/validate";
import AuthModal from "./AuthModal";
import { formatDate } from "./PatternCard";
import styles from "./Community.module.css";

// Discussions index: the thread list, plus an inline composer.
//
// The composer is inline rather than a separate /new page because a post here
// is short — making someone navigate away to write three lines is more
// ceremony than the content deserves.

export type PostListView = {
  id: string;
  title: string;
  body: string;
  /** The notice — moderator-pinned, always first in the list. */
  pinned: boolean;
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
  commentCount: number;
};

/** One line of the body for the list, with newlines flattened. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

export default function DiscussionsClient({
  posts,
  page,
  pageSize,
  total,
}: {
  posts: PostListView[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl("/api/community/posts"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      const payload = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not post.");
        return;
      }
      setTitle("");
      setBody("");
      setComposing(false);
      // Straight into the new thread — the author almost always wants to see it.
      if (payload.id) router.push(`/community/discussions/${payload.id}`);
      else router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.discussionWrap}>
      <div className={styles.introRow}>
        <span>Questions, build logs and anything else that isn&apos;t a pattern.</span>
        <span className={styles.headerSpacer} />
        {session ? (
          <button
            type="button"
            className={styles.btnAccent}
            onClick={() => setComposing((open) => !open)}
          >
            {composing ? "Cancel" : "New post"}
          </button>
        ) : (
          <button type="button" className={styles.btn} onClick={() => setAuthOpen(true)}>
            Sign in to post
          </button>
        )}
      </div>

      {composing && session && (
        <div className={styles.postComposer}>
          <input
            className={styles.postTitleInput}
            value={title}
            maxLength={TITLE_MAX}
            placeholder="Title"
            aria-label="Post title"
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            className={styles.postBodyInput}
            value={body}
            maxLength={POST_BODY_MAX}
            placeholder={"Write your post. Plain text — links become clickable on their own, and anything between ``` lines renders as code."}
            aria-label="Post body"
            onChange={(event) => setBody(event.target.value)}
          />
          {error && <div className={styles.formError}>{error}</div>}
          <div className={styles.composerActions}>
            <span className={styles.composerCount}>
              {body.length} / {POST_BODY_MAX}
            </span>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={busy || !canSubmit}
              onClick={() => void submit()}
            >
              {busy ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className={styles.empty}>
          Nothing here yet. Ask something, or write up what you built.
        </div>
      ) : (
        <ul className={styles.postList}>
          {posts.map((post) => (
            <li key={post.id} className={styles.postRow}>
              <Link href={`/community/discussions/${post.id}`} className={styles.postRowLink}>
                <span className={styles.postRowTitle}>
                  {post.pinned && <span className={styles.noticeChip}>Notice</span>}
                  {post.title}
                  {post.commentCount > 0 && (
                    <span className={styles.postRowCount}>{post.commentCount}</span>
                  )}
                </span>
                <span className={styles.postRowPreview}>{preview(post.body)}</span>
              </Link>
              <div className={styles.postRowMeta}>
                <Link
                  href={`/community/u/${post.username ?? ""}`}
                  className={styles.commentAuthor}
                >
                  @{post.displayUsername ?? post.username ?? "unknown"}
                </Link>
                <span className={styles.commentDate}>{formatDate(post.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className={styles.paginationBar}>
          <Link
            className={styles.pageBtn}
            href={page > 0 ? `/community/discussions?page=${page - 1}` : "#"}
            aria-disabled={page === 0}
            data-disabled={page === 0}
            scroll={false}
          >
            ◀ Prev
          </Link>
          <span className={styles.pageIndicator}>
            Page <strong>{page + 1}</strong> of {totalPages}
            <span className={styles.pageMetaTotal}>({total} posts)</span>
          </span>
          <Link
            className={styles.pageBtn}
            href={page < totalPages - 1 ? `/community/discussions?page=${page + 1}` : "#"}
            aria-disabled={page >= totalPages - 1}
            data-disabled={page >= totalPages - 1}
            scroll={false}
          >
            Next ▶
          </Link>
        </div>
      )}

      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onAuthed={() => router.refresh()} />
      )}
    </div>
  );
}
