import { headers } from "next/headers";
import { getAuth } from "@/lib/community/server/auth";
import { communityEnabled } from "@/lib/community/server/db";
import {
  countFeed,
  likedPatternIds,
  listFeatured,
  listFeed,
  parseFeedSort,
} from "@/lib/community/server/queries";
import { toCardItem } from "@/lib/community/server/serialize";
import { FEED_FIRST_PAINT } from "@/lib/community/feedView";
import CommunityFeedClient from "@/components/community/CommunityFeedClient";
import Marquee from "@/components/community/Marquee";

// The stage. Five panels of running pattern across the top — the first one
// explaining the place, the rest just playing — and the wall underneath.
//
// The marquee is the argument: this is a room where patterns are on, and you
// can turn the knobs on any of them without an account. Everything below is
// /community/patterns, unchanged, so a link into the feed still lands on a
// feed.

export const dynamic = "force-dynamic";

/** Panels in the marquee: one intro + four patterns. */
const MARQUEE_SIZE = 5;

export default async function CommunityHomePage(props: {
  searchParams: Promise<{
    sort?: string;
    hw?: string;
  }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered notice

  const { sort: rawSort, hw } = await props.searchParams;
  const sort = parseFeedSort(rawSort);
  const hardwareOnly = hw === "1";

  const [items, total, picked, topLiked] = await Promise.all([
    listFeed({ sort, hardwareOnly, limit: FEED_FIRST_PAINT }),
    countFeed(hardwareOnly),
    // What a moderator chose, in their order — see /community/featured.
    listFeatured(MARQUEE_SIZE),
    // The fallback, so the front page works with nobody curating it, and is
    // never empty. Most-liked rather than newest: the marquee is front of
    // house and the wall right below it is already the newest-first view.
    listFeed({ sort: "top", limit: MARQUEE_SIZE }),
  ]);

  // Picks first, topped up with liked work when fewer than a full row was
  // chosen — a marquee with two panels and three holes is worse than one that
  // quietly finishes itself.
  const marquee = [
    ...picked,
    ...topLiked.filter((item) => !picked.some((pick) => pick.id === item.id)),
  ].slice(0, MARQUEE_SIZE);

  // Which of these the viewer already liked — one indexed query, so the card
  // hearts start lit where they should be.
  const session = await getAuth().api.getSession({ headers: await headers() });
  const likedIds = await likedPatternIds(
    session?.user.id ?? null,
    [...items, ...marquee].map((item) => item.id),
  );

  return (
    <>
      <Marquee items={marquee.map((item) => toCardItem(item, likedIds))} />
      <CommunityFeedClient
        // Remount on a sort/filter change so the accumulated list restarts.
        key={`${sort}-${hardwareOnly}`}
        items={items.map((item) => toCardItem(item, likedIds))}
        sort={sort}
        hardwareOnly={hardwareOnly}
        total={total}
      />
    </>
  );
}
