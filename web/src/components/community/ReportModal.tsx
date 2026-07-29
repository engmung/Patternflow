"use client";

import { useState } from "react";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import {
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  type ReportReason,
  type ReportTargetType,
} from "@/lib/community/validate";
import { captureEvent } from "@/lib/posthogEvents";
import AuthModal from "./AuthModal";
import styles from "./Community.module.css";

// Reporting needs an account, same as commenting — a report costs someone
// nothing to file and real time to read. People who are not members use the
// address in the terms instead, which the footer of this modal points at.

export default function ReportModal({
  targetType,
  targetId,
  targetLabel,
  onClose,
}: {
  targetType: ReportTargetType;
  targetId: string;
  /** What the reporter thinks they are flagging, echoed back for confidence. */
  targetLabel: string;
  onClose: () => void;
}) {
  const { data: session, isPending } = authClient.useSession();
  const [reason, setReason] = useState<ReportReason>("copyright");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(communityApiUrl("/api/community/reports"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, detail }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not send the report.");
        return;
      }
      captureEvent("community_report", { target_type: targetType, reason });
      setSent(true);
    } catch {
      setError("Network error — is the community server reachable?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>Report</span>
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
        ) : sent ? (
          <div className={styles.modalBody}>
            <p className={styles.formNote}>
              Thank you — this has been recorded and will be reviewed. You will not get an
              automatic reply, but every report is read.
            </p>
            <button type="button" className={styles.btnAccent} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <div className={styles.modalBody}>
            <p className={styles.formNote}>
              Reporting <strong>{targetLabel}</strong>.
            </p>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Reason</span>
              <select value={reason} onChange={(event) => setReason(event.target.value as ReportReason)}>
                {REPORT_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {REPORT_REASON_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Details (optional)</span>
              <textarea
                className={styles.textInput}
                rows={4}
                value={detail}
                maxLength={REPORT_DETAIL_MAX}
                placeholder="If this is a copyright report, a link to the original helps a lot."
                onChange={(event) => setDetail(event.target.value)}
              />
            </label>

            {error && <div className={styles.formError}>{error}</div>}

            <button
              type="button"
              className={styles.btnAccent}
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Sending…" : "Send report"}
            </button>

            <span className={styles.formNote}>
              Are you the rights holder and not a member here? Email{" "}
              <a href="mailto:contact@patternflow.work">contact@patternflow.work</a> — see the{" "}
              <a href="/terms">terms</a>.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
