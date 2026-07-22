"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import AuthModal from "./AuthModal";
import styles from "./Community.module.css";

// Like toggle with optimistic UI. Counts are visible to everyone; only the act
// of liking needs a session, so signed-out visitors get the sign-in modal at
// the moment they click — the same rule as publishing and commenting.

export default function LikeButton({
  patternId,
  initialCount,
  initialLiked,
}: {
  patternId: string;
  initialCount: number;
  initialLiked: boolean;
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const toggle = async () => {
    if (!session) {
      setAuthOpen(true);
      return;
    }
    if (busy) return;

    // Optimistic flip, rolled back if the server disagrees.
    const previous = { liked, count };
    setLiked(!liked);
    setCount(count + (liked ? -1 : 1));
    setBusy(true);
    try {
      const response = await fetch(`/api/community/patterns/${patternId}/like`, {
        method: "POST",
      });
      if (!response.ok) {
        setLiked(previous.liked);
        setCount(previous.count);
        return;
      }
      const payload = (await response.json()) as { liked: boolean; count: number };
      setLiked(payload.liked);
      setCount(payload.count);
    } catch {
      setLiked(previous.liked);
      setCount(previous.count);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.likeButton}${liked ? ` ${styles.likeButtonOn}` : ""}`}
        aria-pressed={liked}
        aria-label={liked ? "Unlike this pattern" : "Like this pattern"}
        onClick={() => void toggle()}
      >
        <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
        <span>{count}</span>
      </button>

      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onAuthed={() => router.refresh()} />
      )}
    </>
  );
}
