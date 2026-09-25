"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { COMMENT_MAX } from "@/lib/community/validate";
import { captureEvent } from "@/lib/posthogEvents";
import styles from "./Community.module.css";

// A moderator's take-down on somebody else's pattern or deck: make it private
// without deleting it, or put back one a moderator made private. What is
// allowed is decided by the API (lib/community/server/admin.ts); this bar asks
// first, takes the reason, and says what will happen.

export default function ModerateVisibility({
  kind,
  id,
  visibility,
  hiddenAt,
}: {
  kind: "pattern" | "deck";
  id: string;
  visibility: string;
  /** ISO — set while a moderator's take-down stands. */
  hiddenAt: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Private by its author's own choice: nothing here is a moderator's to do.
  if (visibility === "private" && !hiddenAt) return null;

  const send = async (next: "public" | "private") => {
    const trimmed = reason.trim();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/${kind}s/${id}`), {
        method: "PATCH",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          next === "private" && trimmed ? { visibility: next, reason: trimmed } : { visibility: next },
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not change who can see this.");
        return;
      }
      captureEvent("community_moderate_visibility", {
        kind,
        id,
        visibility: next,
        with_reason: next === "private" && trimmed.length > 0,
      });
      setConfirming(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  if (hiddenAt) {
    return (
      <div className={styles.ownerBar}>
        <span className={styles.formNote}>
          Moderator — made private on {hiddenAt.slice(0, 10)}. Its author still has it, but cannot
          put it back on the wall until a moderator restores it.
        </span>
        <span className={styles.ownerBarSpacer} />
        <button
          type="button"
          className={styles.btn}
          disabled={busy}
          title="Make it public again, as it was — the author is told"
          onClick={() => void send("public")}
        >
          {busy ? "Restoring…" : "Restore to public"}
        </button>
        {error && <span className={styles.confirmError}>{error}</span>}
      </div>
    );
  }

  if (!confirming) {
    return (
      <div className={styles.ownerBar}>
        <span className={styles.formNote}>
          Moderator — take this {kind} off the wall without deleting it. Its author keeps it, and
          is told.
        </span>
        <span className={styles.ownerBarSpacer} />
        <button type="button" className={styles.btnDanger} onClick={() => setConfirming(true)}>
          Make private
        </button>
      </div>
    );
  }

  return (
    <div className={styles.ownerBar}>
      <label className={`${styles.field} ${styles.moderateReason}`}>
        <span className={styles.fieldLabel}>Reason (optional)</span>
        <textarea
          className={styles.textInput}
          rows={2}
          maxLength={COMMENT_MAX}
          value={reason}
          autoFocus
          placeholder={
            kind === "pattern"
              ? "e.g. Same pattern as one you already posted — update that one instead of posting it again."
              : "e.g. This deck repeats another of yours."
          }
          onChange={(event) => setReason(event.target.value)}
        />
        <span className={styles.fieldHint}>
          {kind === "pattern"
            ? "Posted under the pattern as your comment, where its author can answer, and sent with their alert."
            : "Sent to its author with the alert — a deck has no comments."}
        </span>
      </label>
      <span className={styles.confirmText}>
        Only its author and moderators will be able to open it, and it stays private until a
        moderator restores it.
      </span>
      <span className={styles.ownerBarSpacer} />
      <button
        type="button"
        className={styles.btnDanger}
        disabled={busy}
        onClick={() => void send("private")}
      >
        {busy ? "Making private…" : "Make private"}
      </button>
      <button
        type="button"
        className={styles.btn}
        disabled={busy}
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
      >
        Cancel
      </button>
      {error && <span className={styles.confirmError}>{error}</span>}
    </div>
  );
}
