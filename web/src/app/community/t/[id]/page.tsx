import { notFound, redirect } from "next/navigation";
import { communityEnabled } from "@/lib/community/db";
import { getPost } from "@/lib/community/queries";

// /community/t/[id] — a thread by id alone.
//
// The real URL carries the territory code (/community/workshop/a3/t/…), which is
// right for reading and wrong for linking: an alert row or a moderation queue
// entry has a post id and no idea where it lives. Rather than join a territory
// onto every one of those queries, they point here and this looks it up.

export const dynamic = "force-dynamic";

export default async function ThreadRedirect(props: { params: Promise<{ id: string }> }) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const { id } = await props.params;
  const post = await getPost(id);
  if (!post) notFound();

  redirect(`/community/workshop/${post.territoryCode.toLowerCase()}/t/${post.id}`);
}
