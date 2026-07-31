"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { REPORT_REASON_LABELS, type ReportReason } from "@/lib/community/validate";
import styles from "./Community.module.css";

export type ReportView = {
  id: string;
  targetType: string;
  targetId: string;
  targetTitle: string | null;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: string;
  reporterName: string | null;
  priorReports: number;
};

function targetHref(type: string, id: string): string | null {
  if (type === "pattern") return `/community/p/${id}`;
  if (type === "post") return `/community/discussions/${id}`;
  if (type === "deck") return `/community/d/${id}`;
  return null; // a comment has no page of its own
}

export default function ReportQueue({
  reports,
  status,
}: {
  reports: ReportView[];
  status: "open" | "all";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (id: string, next: "actioned" | "dismissed" | "open") => {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/reports/${id}`), {
        method: "PATCH",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Could not update the report.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.reportsPage}>
      <div className={styles.reportsHead}>
        <h1>Reports</h1>
        <nav className={styles.reportsTabs}>
          <Link href="/community/reports" data-active={status === "open"}>
            Open
          </Link>
          <Link href="/community/reports?show=all" data-active={status === "all"}>
            All
          </Link>
        </nav>
      </div>

      {error && <div className={styles.formError}>{error}</div>}

      {reports.length === 0 ? (
        <p className={styles.formNote}>
          {status === "open" ? "Nothing waiting." : "No reports have been filed."}
        </p>
      ) : (
        <ul className={styles.reportList}>
          {reports.map((report) => {
            const href = targetHref(report.targetType, report.targetId);
            return (
              <li key={report.id} className={styles.reportRow} data-status={report.status}>
                <div className={styles.reportMeta}>
                  <span className={styles.reportReason}>
                    {REPORT_REASON_LABELS[report.reason as ReportReason] ?? report.reason}
                  </span>
                  {/* The signal the table exists for. One report is noise; the
                      same author coming back is the thing worth acting on. */}
                  {report.priorReports > 1 && (
                    <span className={styles.reportRepeat} title="Reports against this author, all time">
                      {report.priorReports}× this author
                    </span>
                  )}
                  <span className={styles.reportDate}>
                    {new Date(report.createdAt).toISOString().slice(0, 10)}
                  </span>
                  {report.status !== "open" && (
                    <span className={styles.reportStatus}>{report.status}</span>
                  )}
                </div>

                <div className={styles.reportTarget}>
                  <span className={styles.reportKind}>{report.targetType}</span>{" "}
                  {href ? (
                    <Link href={href}>{report.targetTitle ?? report.targetId}</Link>
                  ) : (
                    <span className={styles.reportQuote}>
                      &ldquo;{report.targetTitle ?? report.targetId}&rdquo;
                    </span>
                  )}
                </div>

                {report.detail && <p className={styles.reportDetail}>{report.detail}</p>}

                <div className={styles.reportFoot}>
                  <span>by @{report.reporterName ?? "deleted user"}</span>
                  <span className={styles.headerSpacer} />
                  {report.status === "open" ? (
                    <>
                      <button
                        type="button"
                        className={styles.btn}
                        disabled={busy === report.id}
                        onClick={() => void resolve(report.id, "dismissed")}
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        className={styles.btnAccent}
                        disabled={busy === report.id}
                        title="Mark handled — remove the content separately"
                        onClick={() => void resolve(report.id, "actioned")}
                      >
                        Mark actioned
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.btn}
                      disabled={busy === report.id}
                      onClick={() => void resolve(report.id, "open")}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className={styles.formNote}>
        Closing a report does not remove anything — take the content down from its own page, then
        mark the report actioned.
      </p>
    </div>
  );
}
