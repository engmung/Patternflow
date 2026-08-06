"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import BodyComposer from "./BodyComposer";
import { ATTACHMENT_EXTENSIONS } from "@/lib/community/workshop";
import type { AttachmentView } from "@/lib/community/queries";
import { POST_BODY_MAX, TITLE_MAX } from "@/lib/community/validate";
import AttachmentList from "./AttachmentList";
import CommentSection, { type CommentView } from "./CommentSection";
import PostBody from "./PostBody";
import type { WorkshopThread } from "./WorkshopClient";
import { formatDate } from "./PatternCard";
import styles from "./Community.module.css";

// One thread, inside a territory. Read-only for everyone; the author gets edit
// and delete.
//
// The page is as much about the territory as about the thread — a reader who
// arrived from a link should be able to see what this direction is, who is on
// it, and what else is being discussed there, without going back to the map.
// Hence the sidebar.

export type PostView = {
  id: string;
  title: string;
  body: string;
  /** Whether this post is THE notice. */
  pinned: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
};

export type ThreadTerritory = {
  code: string;
  title: string;
  description: string | null;
  pinCount: number;
  threadCount: number;
};

export default function PostDetailClient({
  post,
  comments,
  isOwner,
  isAdmin = false,
  territory,
  attachments = [],
  moreThreads = [],
  pinnedHere = false,
  workingUserIds = [],
}: {
  post: PostView;
  comments: CommentView[];
  isOwner: boolean;
  isAdmin?: boolean;
  territory: ThreadTerritory;
  attachments?: AttachmentView[];
  moreThreads?: WorkshopThread[];
  /** Whether the viewer has already pinned themselves in this territory. */
  pinnedHere?: boolean;
  /** Everyone pinned here — replies from them get the "working here" tag. */
  workingUserIds?: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Attaching more files after the thread exists (author only).
  const attachRef = useRef<HTMLInputElement | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const uploadFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setAttachBusy(true);
    setAttachError(null);
    try {
      const form = new FormData();
      form.set("postId", post.id);
      for (const file of Array.from(list)) form.append("files", file);
      const response = await fetch(communityApiUrl("/api/community/attachments"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        body: form,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setAttachError(payload.error ?? "Upload failed.");
        return;
      }
      router.refresh();
    } catch {
      setAttachError("Network error.");
    } finally {
      setAttachBusy(false);
    }
  };

  const edited = post.updatedAt !== post.createdAt;

  // Moderator-only: make this post the notice (one slot — pinning it bumps
  // whatever held the spot), or clear it.
  const setPinned = async (pinned: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/posts/${post.id}/pin`), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Could not save.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

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
      router.push(`/community/workshop?z=${territory.code}`);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const bodyFiles = attachments.filter((file) => file.commentId === null);
  const ACCEPT = ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(",");

  return (
    <div className={styles.threadLayout}>
      <div className={styles.threadMain}>
        <Link href={`/community/workshop?z=${territory.code}`} className={styles.backLink}>
          ← The workshop · {territory.code} {territory.title}
        </Link>

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
            <BodyComposer
              value={body}
              onChange={setBody}
              maxLength={POST_BODY_MAX}
              label="Post body"
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
            <h1 className={styles.postTitle}>
              {post.pinned && <span className={styles.noticeChip}>Notice</span>}
              {post.title}
            </h1>
            <div className={styles.postMeta}>
              <Link
                href={`/community/u/${post.username ?? ""}`}
                className={styles.commentAuthor}
              >
                @{post.displayUsername ?? post.username ?? "unknown"}
              </Link>
              <span className={styles.commentDate}>{formatDate(post.createdAt)}</span>
              {edited && <span className={styles.commentDate}>· edited</span>}
              {isAdmin && (
                <button
                  type="button"
                  className={styles.btnSmall}
                  disabled={busy}
                  title={
                    post.pinned
                      ? "Remove this post from the top of Discussions"
                      : "Keep this post at the top of Discussions (replaces the current notice)"
                  }
                  onClick={() => void setPinned(!post.pinned)}
                >
                  {post.pinned ? "Unpin notice" : "Pin as notice"}
                </button>
              )}
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
              <PostBody text={post.body} />
              {/* What was actually handed over: images inline, files as
                  download chips — see AttachmentList. */}
              <AttachmentList files={bodyFiles} />

              {/* The author can keep attaching after posting. This is also
                  what makes the modal's "the files did not attach — open it
                  and try again" a real instruction instead of a hope. */}
              {isOwner && (
                <div className={styles.composerRow}>
                  <input
                    ref={attachRef}
                    type="file"
                    multiple
                    accept={ACCEPT}
                    hidden
                    onChange={(event) => {
                      void uploadFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={styles.composerLink}
                    disabled={attachBusy}
                    onClick={() => attachRef.current?.click()}
                  >
                    {attachBusy ? "uploading…" : "▤ attach files"}
                  </button>
                  {attachError && <span className={styles.confirmError}>{attachError}</span>}
                </div>
              )}
            </div>
          </>
        )}
        </article>

        <CommentSection
          target={{ kind: "post", id: post.id }}
          comments={comments}
          attachments={attachments}
          workingUserIds={workingUserIds}
        />
      </div>

      <aside className={styles.threadAside}>
        <div className={styles.territoryCard}>
          <span className={styles.nodeHead}>
            <span className={styles.nodeCode}>{territory.code}</span>
            <span className={styles.drawerTitle}>{territory.title}</span>
          </span>
          {territory.description && (
            <span className={styles.territoryCardDesc}>{territory.description}</span>
          )}
          <span className={styles.drawerCounts}>
            {territory.pinCount} working · {territory.threadCount} thread
            {territory.threadCount === 1 ? "" : "s"}
          </span>
          {pinnedHere ? (
            <span className={styles.pinnedChip}>
              <i aria-hidden="true" />
              You&rsquo;re working here
            </span>
          ) : (
            <Link href={`/community/workshop?z=${territory.code}`} className={styles.pinHereBtn}>
              ▣ I&rsquo;m working here
            </Link>
          )}
        </div>

        {moreThreads.length > 0 && (
          <div className={styles.asideList}>
            <span className={styles.workingLabel}>More in {territory.code}</span>
            {moreThreads.map((thread) => (
              <Link
                key={thread.id}
                href={`/community/workshop/${territory.code.toLowerCase()}/t/${thread.id}`}
                className={styles.asideRow}
              >
                <span className={styles.threadCardHead}>
                  <span className={styles.threadCardTitle}>{thread.title}</span>
                  <span className={styles.headerSpacer} />
                  {thread.commentCount > 0 && (
                    <span className={styles.threadCardCount}>{thread.commentCount}</span>
                  )}
                </span>
                <span className={styles.threadCardByline}>
                  @{thread.displayUsername ?? thread.username ?? "unknown"} ·{" "}
                  {thread.createdAt.slice(0, 10)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
