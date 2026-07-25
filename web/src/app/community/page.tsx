import { communityEnabled } from "@/lib/community/db";
import { countFeed, listFeed, parseFeedSort } from "@/lib/community/queries";
import { toCardItem } from "@/lib/community/serialize";
import { FEED_VIEWS, MAX_FEED_PAGE_SIZE, parseFeedView } from "@/lib/community/feedView";
import CommunityFeedClient from "@/components/community/CommunityFeedClient";

// The feed. Sort, hardware filter, card size and paging all live in the URL
// (?sort=, ?hw=, ?view=, ?page=, ?size=) so a view is shareable and the back
// button works.
//
// Only about one row of patterns is fetched per request. Every feed row ships
// its full source (the cards render and hover-play it client-side), so sending
// the whole feed would mean shipping code for patterns nobody can see.

export const dynamic = "force-dynamic";

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export default async function CommunityFeedPage(props: {
  searchParams: Promise<{
    sort?: string;
    hw?: string;
    view?: string;
    page?: string;
    size?: string;
  }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered notice

  const { sort: rawSort, hw, view: rawView, page: rawPage, size: rawSize } = await props.searchParams;
  const sort = parseFeedSort(rawSort);
  const hardwareOnly = hw === "1";
  const view = parseFeedView(rawView);
  // Generous enough to fill the widest screen in this view; the client trims to
  // what actually fits and asks for its exact size from the next page onwards.
  const size = clampInt(rawSize, FEED_VIEWS[view].defaultSize, 1, MAX_FEED_PAGE_SIZE);
  const page = clampInt(rawPage, 0, 0, 100_000);

  const [items, total] = await Promise.all([
    listFeed({ sort, hardwareOnly, limit: size, offset: page * size }),
    countFeed(hardwareOnly),
  ]);

  return (
    <CommunityFeedClient
      // Remount on a view change so the layout re-measures from scratch.
      key={`${sort}-${hardwareOnly}-${view}`}
      items={items.map(toCardItem)}
      sort={sort}
      hardwareOnly={hardwareOnly}
      view={view}
      page={page}
      total={total}
    />
  );
}
