import type { Metadata } from "next";
import { communityEnabled } from "@/lib/community/db";
import { countPosts, listPosts } from "@/lib/community/queries";
import DiscussionsClient from "@/components/community/DiscussionsClient";

// Discussions: plain-text threads that aren't attached to a pattern.
//
// Deliberately the boring half of the community. No previews, no sandboxes,
// no thumbnails — a title, a body, and replies. That is why it can page in
// twenty rows where the pattern feed can only afford a handful.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discussions / Patternflow Community",
  description: "Questions, build logs and discussion from the Patternflow community.",
};

const PAGE_SIZE = 20;

export default async function CommunityDiscussionsPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const { page: rawPage } = await props.searchParams;
  const parsed = Number(rawPage);
  const page = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;

  const [posts, total] = await Promise.all([
    listPosts({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    countPosts(),
  ]);

  return (
    <DiscussionsClient
      posts={posts.map((post) => ({
        id: post.id,
        title: post.title,
        body: post.body,
        pinned: post.pinned,
        createdAt: post.createdAt.toISOString(),
        username: post.username,
        displayUsername: post.displayUsername,
        commentCount: post.commentCount,
      }))}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
    />
  );
}
