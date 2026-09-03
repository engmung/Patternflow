import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/server/admin";
import { getAuth } from "@/lib/community/server/auth";
import { communityEnabled } from "@/lib/community/server/db";
import { listTerritoriesForAdmin } from "@/lib/community/server/queries";
import TerritoryEditor from "@/components/community/TerritoryEditor";

// Drawing the map — the directions the workshop is made of.
//
// Moderators only. This existed as a seed script first, which meant adding a
// direction took an SSH session and a redeploy, and the workshop's own empty
// state told the person running the project that somebody ought to draw some
// while giving them nowhere to do it. `npm run seed:map` is still there for
// first setup; this is for every change after.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Territories / Patternflow Community",
  robots: { index: false, follow: false },
};

export default async function TerritoriesPage() {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const session = await getAuth().api.getSession({ headers: await headers() });
  // 404 rather than "you are not a moderator", same as the report queue.
  if (!isAdminSession(session)) notFound();

  const rows = await listTerritoriesForAdmin();

  return (
    <TerritoryEditor
      territories={rows.map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        description: row.description,
        span: row.span,
        position: row.position,
        x: row.x,
        y: row.y,
        shippingNext: row.shippingNext,
        questions: row.questions,
        pinCount: row.pinCount,
        threadCount: row.threadCount,
        archived: row.archivedAt !== null,
      }))}
    />
  );
}
