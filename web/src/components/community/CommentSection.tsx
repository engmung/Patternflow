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
  body: string;
  createdAt: string; // ISO
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

      {comments.map((comment) => (
        <div key={comment.id} className={styles.commentItem}>
          <div className={styles.commentHead}>
            <Link
              href={`/community/u/${comment.username ?? ""}`}
              className={styles.commentAuthor}
            >
              @{comment.displayUsername ?? comment.username ?? "unknown"}
            </Link>
            <span className={styles.commentDate}>{formatDate(comment.createdAt)}</span>
          </div>
          <div className={styles.commentBody}>
            <LinkedText text={comment.body} />
          </div>
        </div>
      ))}

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
