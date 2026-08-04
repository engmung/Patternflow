import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { communityEnabled } from "@/lib/community/db";
import {
  getPost,
  getTerritoryByCode,
  listAttachments,
  listPostComments,
  listPosts,
  listTerritoryPins,
} from "@/lib/community/queries";
import type { CommentView } from "@/components/community/CommentSection";
import PostDetailClient from "@/components/community/PostDetailClient";

// One thread, at /community/workshop/a3/t/[id].
//
// The territory code is in the path even though the id alone would find the
// thread: the URL should say where the conversation is happening, and a
// mismatched code redirects to the right one rather than rendering a page that
// lies about its own location.

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ code: string; id: string }> };

/** Sibling threads in the sidebar. */
const MORE_IN_ZONE = 6;

export async function generateMetadata(props: RouteParams): Promise<Metadata> {
  if (!communityEnabled()) return {};
  const { id } = await props.params;
  const post = await getPost(id);
  if (!post) return {};
  return {
    title: `${post.title} / ${post.territoryTitle} / Patternflow Community`,
    description: post.body.slice(0, 160),
  };
}

export default async function ThreadPage(props: RouteParams) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const { code, id } = await props.params;
  const post = await getPost(id);
  if (!post) notFound();

  // The thread knows which territory it is in; the URL is just a label. If they
  // disagree, the thread wins.
  if (post.territoryCode.toLowerCase() !== code.toLowerCase()) {
    redirect(`/community/workshop/${post.territoryCode.toLowerCase()}/t/${post.id}`);
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;

  const [territory, comments, attachments, pins, siblings] = await Promise.all([
    getTerritoryByCode(post.territoryCode),
    listPostComments(post.id),
    listAttachments(post.id),
    listTerritoryPins(post.territoryId),
    listPosts({ territoryId: post.territoryId, limit: MORE_IN_ZONE + 1 }),
  ]);
  if (!territory) notFound();

  const commentViews: CommentView[] = comments.map((comment) => ({
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
      comments={commentViews}
      isOwner={viewerId === post.userId}
      isAdmin={isAdminSession(session)}
      territory={{
        code: territory.code,
        title: territory.title,
        description: territory.description,
        pinCount: territory.pinCount,
        threadCount: territory.threadCount,
      }}
      attachments={attachments}
      moreThreads={siblings
        .filter((thread) => thread.id !== post.id)
        .slice(0, MORE_IN_ZONE)
        .map((thread) => ({
          id: thread.id,
          title: thread.title,
          body: thread.body,
          createdAt: thread.createdAt.toISOString(),
          username: thread.username,
          displayUsername: thread.displayUsername,
          commentCount: thread.commentCount,
        }))}
      pinnedHere={pins.some((pin) => pin.userId === viewerId)}
      workingUserIds={pins.map((pin) => pin.userId)}
    />
  );
}
