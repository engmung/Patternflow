"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { captureEvent } from "@/lib/posthogEvents";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import AuthModal from "./AuthModal";
import styles from "./Community.module.css";

// Two ways a .h reaches a pattern, one modal:
//
//   owner — the author attaches (or replaces) their own header. PATCHes the
//   pattern row; this is the "publish the JS now, port it later" half of the
//   original flow.
//
//   port — somebody ELSE verified it on their board and proposes it. POSTs a
//   community port, live immediately (see the header route) — the author
//   hears about it and can pin or out-rank it.
//
// Generation and hardware testing happen in Pattern Lab and on the board;
// only the finished, working .h comes here.

export default function AddHeaderModal({
  patternId,
  initialCpp,
  mode = "owner",
  onClose,
}: {
  patternId: string;
  initialCpp: string | null;
  mode?: "owner" | "port";
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [cpp, setCpp] = useState(initialCpp ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (next: string) => {
    setBusy(true);
    setError(null);
    try {
      const response =
        mode === "port"
          ? await fetch(communityApiUrl(`/api/community/patterns/${patternId}/header`), {
              method: "POST",
              ...COMMUNITY_FETCH_INIT,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ codeCpp: next, note }),
            })
          : await fetch(communityApiUrl(`/api/community/patterns/${patternId}`), {
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
      captureEvent(mode === "port" ? "community_propose_port" : "community_attach_header", {
        pattern_id: patternId,
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
          <span>
            {mode === "port"
              ? "Propose a firmware port (.h)"
              : initialCpp
                ? "Update firmware header"
                : "Add firmware header (.h)"}
          </span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {mode === "port" && isPending ? (
          <div className={styles.modalBody}>
            <span className={styles.formNote}>Checking session…</span>
          </div>
        ) : mode === "port" && !session ? (
          <AuthModal embedded onClose={() => undefined} />
        ) : (
          <div className={styles.modalBody}>
            {mode === "port" ? (
              <p className={styles.formNote}>
                The author has no header for this pattern yet — if you ran it on your own board,
                finish the job for them. Generate the port with <strong>Copy C++ prompt</strong> in{" "}
                <Link href="/pattern-lab">Pattern Lab</Link>, verify it on hardware, and paste it
                here. It goes live immediately, credited to you; the author can pin or replace it,
                and the port carries the pattern&apos;s own licence — the work stays theirs.
              </p>
            ) : (
              <p className={styles.formNote}>
                The board runs C++, so a pattern needs a <code>.h</code> port before anyone can
                flash it. Generate one with <strong>Copy C++ prompt</strong> in{" "}
                <Link href="/pattern-lab">Pattern Lab</Link>, build it on your own board, and paste
                the working header here. Your pattern then shows as <strong>hardware ready</strong>{" "}
                and can be filtered for in the feed.
              </p>
            )}

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
                Must start with <code>#pragma once</code>. It is stored as you paste it — we
                can&apos;t compile it here, so only submit a header you have actually run.
              </span>
            </label>

            {mode === "port" && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Note (optional)</span>
                <input
                  className={styles.textInput}
                  placeholder="How you verified it — board, firmware version…"
                  value={note}
                  maxLength={200}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            )}

            {error && <div className={styles.formError}>{error}</div>}

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.btnAccent}
                disabled={busy || cpp.trim().length === 0}
                onClick={() => void save(cpp)}
              >
                {busy
                  ? "Saving…"
                  : mode === "port"
                    ? "Propose port"
                    : initialCpp
                      ? "Update header"
                      : "Attach header"}
              </button>
              {mode === "owner" && initialCpp && (
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
        )}
      </div>
    </div>
  );
}
