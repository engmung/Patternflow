"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { captureEvent } from "@/lib/posthogEvents";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import styles from "./Community.module.css";

// Author-only: attach the hand-verified firmware header to an already published
// pattern. This is the "publish the JS now, port it later" half of the flow —
// generation and hardware testing happen in Pattern Lab and on the board, and
// only the finished, working .h comes back here.

export default function AddHeaderModal({
  patternId,
  initialCpp,
  onClose,
}: {
  patternId: string;
  initialCpp: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [cpp, setCpp] = useState(initialCpp ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (next: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/patterns/${patternId}`), {
        method: "PATCH",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeCpp: next }),
      });
      const payload = (await response.json()) as { error?: string; hasCpp?: boolean };
      if (!response.ok) {
        setError(payload.error ?? "Could not save the header.");
        return;
      }
      captureEvent("community_attach_header", {
        pattern_id: patternId,
        attached: Boolean(payload.hasCpp),
      });
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
          <span>{initialCpp ? "Update firmware header" : "Add firmware header (.h)"}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <p className={styles.formNote}>
            The board runs C++, so a pattern needs a <code>.h</code> port before anyone can flash
            it. Generate one with <strong>Copy C++ prompt</strong> in{" "}
            <Link href="/pattern-lab">Pattern Lab</Link>, build it on your own board, and paste the
            working header here. Your pattern then shows as{" "}
            <strong>hardware ready</strong> and can be filtered for in the feed.
          </p>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Header source</span>
            <textarea
              className={`${styles.textInput} ${styles.cppInput}`}
              placeholder="#pragma once&#10;…"
              spellCheck={false}
              value={cpp}
              onChange={(event) => setCpp(event.target.value)}
            />
            <span className={styles.fieldHint}>
              Must start with <code>#pragma once</code>. It is stored as you paste it — we can&apos;t
              compile it here, so only attach a header you have actually run.
            </span>
          </label>

          {error && <div className={styles.formError}>{error}</div>}

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.btnAccent}
              disabled={busy || cpp.trim().length === 0}
              onClick={() => void save(cpp)}
            >
              {busy ? "Saving…" : initialCpp ? "Update header" : "Attach header"}
            </button>
            {initialCpp && (
              <button
                type="button"
                className={styles.btn}
                disabled={busy}
                onClick={() => void save("")}
              >
                Remove header
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
