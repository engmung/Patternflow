"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { captureEvent } from "@/lib/posthogEvents";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { readPerformanceFile } from "@/lib/community/performanceFile";
import AuthModal from "./AuthModal";
import styles from "./Community.module.css";

// Publish a performance recording for a pattern — a Director timeline (the
// Save-JSON file) that rides the same social rails as firmware ports: live
// immediately, credited to the recorder, and the pattern's author outranks or
// pins. Authoring happens in the Director tool; this modal only takes the
// finished JSON, and the server re-validates it against the device player's
// limits before storing the canonical form.

export default function AddPerformanceModal({
  patternId,
  onClose,
}: {
  patternId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [json, setJson] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Either half of a Director save: the .json it edits, or the .pfs it sends
  // to a panel. A packed table is decoded back to the editable form here, so
  // what gets published is always the source and the .pfs is regenerated.
  const pickFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    void readPerformanceFile(file).then((result) => {
      if (result.ok) setJson(result.json);
      else setError(result.error);
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        communityApiUrl(`/api/community/patterns/${patternId}/performance`),
        {
          method: "POST",
          ...COMMUNITY_FETCH_INIT,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ performanceJson: json, note }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save the performance.");
        return;
      }
      captureEvent("community_publish_performance", { pattern_id: patternId });
      router.refresh();
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.modalCardWide}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <span>Publish a performance</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {isPending ? (
          <div className={styles.modalBody}>
            <span className={styles.formNote}>Checking session…</span>
          </div>
        ) : !session ? (
          <AuthModal embedded onClose={() => undefined} />
        ) : (
          <div className={styles.modalBody}>
            <p className={styles.formNote}>
              A performance is a timed ride through this pattern&apos;s knobs — cues of absolute
              values (0..1000) the panel replays exactly. Record it in the Director tool and
              load either half of its save: the <code>.pfs</code> table you send to a panel, or
              the <code>.json</code> it edits. It goes live immediately, credited to you; the
              pattern&apos;s author can pin or out-rank it with their own recording.
            </p>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Load a .pfs or .json</span>
              <input
                type="file"
                accept=".pfs,.json,application/json,application/octet-stream"
                onChange={(event) => pickFile(event.target.files?.[0])}
              />
              <span className={styles.fieldHint}>
                A <code>.pfs</code> is unpacked back into the editable timeline below.
              </span>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Performance JSON</span>
              <textarea
                className={`${styles.textInput} ${styles.cppInput}`}
                placeholder='{"version":1,"title":"Sunset ride","length":30,"timeline":[{"t":0,"param":[500,500,500,500]}]}'
                spellCheck={false}
                value={json}
                onChange={(event) => setJson(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Note (optional)</span>
              <input
                className={styles.textInput}
                placeholder="What the ride does — mood, tempo, which knobs move…"
                value={note}
                maxLength={200}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>

            {error && <div className={styles.formError}>{error}</div>}

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.btnAccent}
                disabled={busy || json.trim().length === 0}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Publish performance"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
