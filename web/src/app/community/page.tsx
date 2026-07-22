import { communityEnabled } from "@/lib/community/db";
import { listFeed } from "@/lib/community/queries";
import { toCardItem } from "@/lib/community/serialize";
import CommunityFeedClient from "@/components/community/CommunityFeedClient";

// The feed. Newest first; thumbnails rendered client-side from code.

export const dynamic = "force-dynamic";

export default async function CommunityFeedPage() {
  if (!communityEnabled()) return null; // layout already rendered notice

  const items = (await listFeed()).map(toCardItem);

  return <CommunityFeedClient items={items} />;
}
