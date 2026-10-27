"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl, readApiError } from "@/lib/community/apiBase";
import AuthModal from "./AuthModal";
import styles from "./Community.module.css";

// Like toggle with optimistic UI. Counts are visible to everyone; only the act
// of liking needs a session, so signed-out visitors get the sign-in modal at
// the moment they click — the same rule as publishing and commenting.
//
// A like the server turns down rolls back, and the button says why beside it.
// Before, the flip came undone inside 150 ms with nothing on the page, so a
// 429 ("Too many likes — slow down a moment.") read as a button that ignored
// the press.

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
  const [note, setNote] = useState<string | null>(null);

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
    setNote(null);
    try {
      const response = await fetch(
        communityApiUrl(`/api/community/patterns/${patternId}/like`),
        { method: "POST", ...COMMUNITY_FETCH_INIT },
      );
      if (!response.ok) {
        setLiked(previous.liked);
        setCount(previous.count);
        setNote(await readApiError(response, "Like not saved"));
        return;
      }
      const payload = (await response.json()) as { liked: boolean; count: number };
      setLiked(payload.liked);
      setCount(payload.count);
    } catch {
      setLiked(previous.liked);
      setCount(previous.count);
      setNote("Network error.");
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
        {/* State reads from .likeButtonOn (accent), not a glyph — the style
            guide keeps the UI on mono labels. */}
        <span aria-hidden="true">LIK</span>
        <span>{String(count).padStart(2, "0")}</span>
      </button>
      {note && (
        <span role="alert" className={styles.likeNote}>
          {note}
        </span>
      )}

      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onAuthed={() => router.refresh()} />
      )}
    </>
  );
}
