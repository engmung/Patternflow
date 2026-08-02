import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/admin";
import { communityEnabled } from "@/lib/community/db";
import { getAuth } from "@/lib/community/auth";
import { getPost, listPostComments } from "@/lib/community/queries";
import type { CommentView } from "@/components/community/CommentSection";
import PostDetailClient from "@/components/community/PostDetailClient";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function generateMetadata(props: RouteParams): Promise<Metadata> {
  if (!communityEnabled()) return {};
  const { id } = await props.params;
  const post = await getPost(id);
  if (!post) return {};
  return {
    title: `${post.title} / Patternflow Community`,
    // Plain text already, so it needs flattening but no stripping.
    description: post.body.replace(/\s+/g, " ").slice(0, 160),
  };
}

export default async function CommunityPostPage(props: RouteParams) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const { id } = await props.params;
  const post = await getPost(id);
  if (!post) notFound();

  const session = await getAuth().api.getSession({ headers: await headers() });
  const comments: CommentView[] = (await listPostComments(post.id)).map((comment) => ({
    id: comment.id,
    userId: comment.userId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() ?? null,
    username: comment.username,
    displayUsername: comment.displayUsername,
  }));

  return (
    <PostDetailClient
      // Remount after an edit so the form starts from the saved text rather
      // than whatever local state was holding.
      key={`${post.id}:${post.updatedAt.getTime()}`}
      post={{
        id: post.id,
        title: post.title,
        body: post.body,
        pinned: post.pinnedAt !== null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        username: post.username,
        displayUsername: post.displayUsername,
      }}
      comments={comments}
      isOwner={session?.user.id === post.userId}
      isAdmin={isAdminSession(session)}
    />
  );
}
