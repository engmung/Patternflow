import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/server/admin";
import { getAuth } from "@/lib/community/server/auth";
import { communityEnabled } from "@/lib/community/server/db";
import { countFeed, listFeatured, listFeaturedIds, listFeed } from "@/lib/community/server/queries";
import { toCardItem } from "@/lib/community/server/serialize";
import FeaturedEditor from "@/components/community/FeaturedEditor";

// Picking the marquee — the five slots across the top of /community: the
// first plays dimmed behind the intro text, the other four are the panels
// (see Marquee.tsx).
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

/** The newest patterns the page opens with. Everything older is reached by
 *  the editor's own search, sort and "Load more" — this used to be a fixed 60
 *  newest with no way past them, so a pattern from a few months back simply
 *  could not be chosen. */
const FIRST_PAINT = 24;

export default async function FeaturedPage() {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const session = await getAuth().api.getSession({ headers: await headers() });
  // 404 rather than "you are not a moderator", same as the report queue.
  if (!isAdminSession(session)) notFound();

  const [chosen, chosenIds, recent, total] = await Promise.all([
    listFeatured(),
    listFeaturedIds(),
    listFeed({ sort: "new", limit: FIRST_PAINT }),
    countFeed(),
  ]);

  return (
    <FeaturedEditor
      // The chosen list comes back in marquee order; anything featured but no
      // longer public is dropped by listFeatured, so the editor never shows a
      // slot the front page would not render.
      initial={chosen.map((item) => toCardItem(item))}
      initialIds={chosenIds}
      candidates={recent.map((item) => toCardItem(item))}
      candidatesTotal={total}
    />
  );
}
