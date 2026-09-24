import { headers } from "next/headers";
import type { Metadata } from "next";
import { getAuth } from "@/lib/community/server/auth";
import { communityEnabled } from "@/lib/community/server/db";
import { countFeed, likedPatternIds, listFeed, parseFeedSort } from "@/lib/community/server/queries";
import { toCardItem } from "@/lib/community/server/serialize";
import { FEED_FIRST_PAINT } from "@/lib/community/feedView";
import CommunityFeedClient from "@/components/community/CommunityFeedClient";

// The wall, on its own: everything anyone has published, newest first, with
// nothing above it. /community is the same wall with the marquee over it —
// this is the page you land on when you already know what you came for.
//
// Sort, the hardware filter and the search live in the URL (?sort=, ?hw=,
// ?q=) so a view is shareable and the back button works. Card size does not
// — that is the Ctrl+scroll zoom, remembered per browser.
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
    q?: string | string[];
  }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered notice

  const { sort: rawSort, hw, q: rawQ } = await props.searchParams;
  const sort = parseFeedSort(rawSort);
  const hardwareOnly = hw === "1";
  // A repeated ?q= arrives as an array; the first one is the search.
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ ?? "").trim();

  const session = await getAuth().api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;

  const [items, total] = await Promise.all([
    listFeed({ sort, hardwareOnly, limit: FEED_FIRST_PAINT, viewerId, q }),
    countFeed(hardwareOnly, { q, sort, viewerId }),
  ]);
  const likedIds = await likedPatternIds(viewerId, items.map((item) => item.id));

  return (
    <CommunityFeedClient
      // Remount on a sort/filter change so the accumulated list restarts. Not
      // on a search: the list inside restarts on its own, and keying the
      // whole wall on q would remount the search box under the typing.
      key={`${sort}-${hardwareOnly}`}
      items={items.map((item) => toCardItem(item, likedIds))}
      sort={sort}
      hardwareOnly={hardwareOnly}
      // For "liked" this is the viewer's own count (countFeed), so the scroll
      // keeps going past the first batch instead of calling it the end.
      total={total}
      signedIn={viewerId !== null}
      q={q}
    />
  );
}
