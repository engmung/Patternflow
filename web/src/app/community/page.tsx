import { communityEnabled } from "@/lib/community/db";
import { countFeed, listFeed, parseFeedSort } from "@/lib/community/queries";
import { toCardItem } from "@/lib/community/serialize";
import CommunityFeedClient from "@/components/community/CommunityFeedClient";

// The feed. Sort, hardware filter and paging all live in the URL (?sort=, ?hw=,
// ?page=, ?size=) so a view is shareable and the back button works.
//
// Only about one row of patterns is fetched per request. Every feed row ships
// its full source (the cards render and hover-play it client-side), so sending
// the whole feed would mean shipping code for patterns nobody can see.

export const dynamic = "force-dynamic";

// Generous enough to cover the widest single row; the client trims to fit and
// asks for its exact row size from the next page onwards.
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 12;

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export default async function CommunityFeedPage(props: {
  searchParams: Promise<{ sort?: string; hw?: string; page?: string; size?: string }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered notice

  const { sort: rawSort, hw, page: rawPage, size: rawSize } = await props.searchParams;
  const sort = parseFeedSort(rawSort);
  const hardwareOnly = hw === "1";
  const size = clampInt(rawSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const page = clampInt(rawPage, 0, 0, 100_000);

  const [items, total] = await Promise.all([
    listFeed({ sort, hardwareOnly, limit: size, offset: page * size }),
    countFeed(hardwareOnly),
  ]);

  return (
    <CommunityFeedClient
      // Remount on a view change so the layout re-measures from scratch.
      key={`${sort}-${hardwareOnly}`}
      items={items.map(toCardItem)}
      sort={sort}
      hardwareOnly={hardwareOnly}
      page={page}
      total={total}
    />
  );
}
