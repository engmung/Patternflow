import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { communityEnabled } from "@/lib/community/db";
import { listReports } from "@/lib/community/queries";
import ReportQueue from "@/components/community/ReportQueue";

// The moderation queue. Reports were write-only until this page existed —
// filed into a table nobody could read without opening SQLite by hand, which
// is the same as not having them.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reports / Patternflow Community",
  robots: { index: false, follow: false },
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const session = await getAuth().api.getSession({ headers: await headers() });
  // 404 rather than a "you are not a moderator" page: the existence of a
  // moderation queue is not something a visitor needs confirmed.
  if (!isAdminSession(session)) notFound();

  const { show } = await searchParams;
  const status = show === "all" ? "all" : "open";
  const rows = await listReports(status);

  return (
    <ReportQueue
      status={status}
      reports={rows.map((row) => ({
        id: row.id,
        targetType: row.targetType,
        targetId: row.targetId,
        targetTitle: row.targetTitle,
        reason: row.reason,
        detail: row.detail,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        reporterName: row.reporterName,
        priorReports: row.priorReports,
      }))}
    />
  );
}
