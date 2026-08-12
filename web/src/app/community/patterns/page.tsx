import { headers } from "next/headers";
import type { Metadata } from "next";
import { getAuth } from "@/lib/community/auth";
import { communityEnabled } from "@/lib/community/db";
import { countFeed, listFeed, parseFeedSort } from "@/lib/community/queries";
import { toCardItem } from "@/lib/community/serialize";
import { FEED_FIRST_PAINT } from "@/lib/community/feedView";
import CommunityFeedClient from "@/components/community/CommunityFeedClient";

// The wall, on its own: everything anyone has published, newest first, with
// nothing above it. /community is the same wall with the marquee over it —
// this is the page you land on when you already know what you came for.
//
// Sort and the hardware filter live in the URL (?sort=, ?hw=) so a view is
// shareable and the back button works. Card size does not — that is the
// Ctrl+scroll zoom, remembered per browser.
//
// Only the first batch is rendered here; scrolling loads the rest through
// GET /api/community/patterns. Every card ships its full source (they render
// and hover-play it client-side), so the wall pays for patterns as they come
// into reach rather than all at once.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Patterns / Patternflow Community",
  description:
    "Every LED matrix pattern shared to Patternflow — hover to play one, scroll on it to turn its knobs, open it to read the code.",
};

export default async function CommunityWallPage(props: {
  searchParams: Promise<{
    sort?: string;
    hw?: string;
  }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered notice

  const { sort: rawSort, hw } = await props.searchParams;
  const sort = parseFeedSort(rawSort);
  const hardwareOnly = hw === "1";

  const session = await getAuth().api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;

  const [items, total] = await Promise.all([
    listFeed({ sort, hardwareOnly, limit: FEED_FIRST_PAINT, viewerId }),
    countFeed(hardwareOnly),
  ]);

  return (
    <CommunityFeedClient
      // Remount on a sort/filter change so the accumulated list restarts.
      key={`${sort}-${hardwareOnly}`}
      items={items.map(toCardItem)}
      sort={sort}
      hardwareOnly={hardwareOnly}
      // The liked list is a subset, so the wall's total would overstate it.
      total={sort === "liked" ? items.length : total}
      signedIn={viewerId !== null}
    />
  );
}
