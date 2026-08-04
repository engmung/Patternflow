import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { communityEnabled } from "@/lib/community/db";
import { listFeatured, listFeaturedIds, listFeed } from "@/lib/community/queries";
import { toCardItem } from "@/lib/community/serialize";
import FeaturedEditor from "@/components/community/FeaturedEditor";

// Picking the marquee — the four patterns across the top of /community.
//
// Moderators only, and the only page on the site whose whole job is deciding
// what somebody else sees first. It exists because "most liked" answers a
// different question than "what should this place look like to a person who
// has never been here", and the front page should be able to answer the
// second one deliberately.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marquee / Patternflow Community",
  robots: { index: false, follow: false },
};

/** How many recent patterns to offer as candidates. */
const CANDIDATES = 60;

export default async function FeaturedPage() {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const session = await getAuth().api.getSession({ headers: await headers() });
  // 404 rather than "you are not a moderator", same as the report queue.
  if (!isAdminSession(session)) notFound();

  const [chosen, chosenIds, recent] = await Promise.all([
    listFeatured(),
    listFeaturedIds(),
    listFeed({ sort: "new", limit: CANDIDATES }),
  ]);

  return (
    <FeaturedEditor
      // The chosen list comes back in marquee order; anything featured but no
      // longer public is dropped by listFeatured, so the editor never shows a
      // slot the front page would not render.
      initial={chosen.map(toCardItem)}
      initialIds={chosenIds}
      candidates={recent.map(toCardItem)}
    />
  );
}
