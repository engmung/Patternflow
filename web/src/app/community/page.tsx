import { communityEnabled } from "@/lib/community/db";
import { listFeed, parseFeedSort } from "@/lib/community/queries";
import { toCardItem } from "@/lib/community/serialize";
import CommunityFeedClient from "@/components/community/CommunityFeedClient";

// The feed. Sort + hardware filter live in the URL (?sort=, ?hw=) so a view is
// shareable and the back button works; thumbnails render client-side from code.

export const dynamic = "force-dynamic";

export default async function CommunityFeedPage(props: {
  searchParams: Promise<{ sort?: string; hw?: string }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered notice

  const { sort: rawSort, hw } = await props.searchParams;
  const sort = parseFeedSort(rawSort);
  const hardwareOnly = hw === "1";

  const items = (await listFeed({ sort, hardwareOnly })).map(toCardItem);

  return (
    <CommunityFeedClient
      // Remount on a view change so pagination restarts at page 1.
      key={`${sort}-${hardwareOnly}`}
      items={items}
      sort={sort}
      hardwareOnly={hardwareOnly}
    />
  );
}
