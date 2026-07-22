"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { captureEvent } from "@/lib/posthogEvents";
import styles from "./Community.module.css";

// Deleting is irreversible, so it asks in place rather than firing on the first
// click — and it says what else goes with it.

export default function DeletePatternButton({
  patternId,
  forkCount,
}: {
  patternId: string;
  forkCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destroy = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/patterns/${patternId}`), {
        method: "DELETE",
        ...COMMUNITY_FETCH_INIT,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not delete this pattern.");
        return;
      }
      captureEvent("community_delete_pattern", { pattern_id: patternId });
      router.push("/community");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <button type="button" className={styles.btnDanger} onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }

  return (
    <span className={styles.confirmRow}>
      <span className={styles.confirmText}>
        Delete permanently? Its comments and likes go too
        {forkCount > 0 && (
          <>
            {" "}
            — the {forkCount} {forkCount === 1 ? "fork" : "forks"} of it stay, but lose the link back
          </>
        )}
        .
      </span>
      <button type="button" className={styles.btnDanger} disabled={busy} onClick={() => void destroy()}>
        {busy ? "Deleting…" : "Yes, delete"}
      </button>
      <button type="button" className={styles.btn} disabled={busy} onClick={() => setConfirming(false)}>
        Cancel
      </button>
      {error && <span className={styles.confirmError}>{error}</span>}
    </span>
  );
}
