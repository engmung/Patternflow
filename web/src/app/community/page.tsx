import { communityEnabled } from "@/lib/community/db";
import { countFeed, listFeed, parseFeedSort } from "@/lib/community/queries";
import { toCardItem } from "@/lib/community/serialize";
import { FEED_FIRST_PAINT } from "@/lib/community/feedView";
import CommunityFeedClient from "@/components/community/CommunityFeedClient";

// The feed. Sort and the hardware filter live in the URL (?sort=, ?hw=) so a
// view is shareable and the back button works. Card size does not — that is
// the Ctrl+scroll zoom, remembered per browser.
//
// Only the first batch is rendered here; scrolling loads the rest through
// GET /api/community/patterns. Every card ships its full source (they render
// and hover-play it client-side), so the feed pays for patterns as they come
// into reach rather than all at once.

export const dynamic = "force-dynamic";

export default async function CommunityFeedPage(props: {
  searchParams: Promise<{
    sort?: string;
    hw?: string;
  }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered notice

  const { sort: rawSort, hw } = await props.searchParams;
  const sort = parseFeedSort(rawSort);
  const hardwareOnly = hw === "1";

  const [items, total] = await Promise.all([
    listFeed({ sort, hardwareOnly, limit: FEED_FIRST_PAINT }),
    countFeed(hardwareOnly),
  ]);

  return (
    <CommunityFeedClient
      // Remount on a sort/filter change so the accumulated list restarts.
      key={`${sort}-${hardwareOnly}`}
      items={items.map(toCardItem)}
      sort={sort}
      hardwareOnly={hardwareOnly}
      total={total}
    />
  );
}
