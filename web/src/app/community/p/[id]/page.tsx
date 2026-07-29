import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { communityEnabled } from "@/lib/community/db";
import { getAuth } from "@/lib/community/auth";
import { getPattern, getPatternStub, hasLiked, listComments } from "@/lib/community/queries";
import { provenanceFor } from "@/lib/community/provenance";
import type { CommentView } from "@/components/community/CommentSection";
import PatternDetailClient from "./PatternDetailClient";

// Pattern detail: sandboxed live preview + editable code (no login), fork
// hand-off to Pattern Lab, comments below.

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
};

export async function generateMetadata(props: RouteParams): Promise<Metadata> {
  if (!communityEnabled()) return {};
  const { id } = await props.params;
  const pattern = await getPattern(id);
  if (!pattern) return {};
  return {
    title: `${pattern.title} / Patternflow Community`,
    description: pattern.description ?? `An LED matrix pattern by ${pattern.displayUsername ?? pattern.username}.`,
  };
}

export default async function CommunityPatternPage(props: RouteParams) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const { id } = await props.params;
  const { k } = await props.searchParams;

  const pattern = await getPattern(id);
  if (!pattern) notFound();

  const initialKnobs = k
    ? k.split(",").map(Number).filter((v) => Number.isFinite(v))
    : undefined;

  // Viewer context: whether they already liked this, and whether it's theirs to
  // edit. Signed-out visitors get `null` and simply see the read-only version.
  const session = await getAuth().api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;
  const liked = viewerId ? await hasLiked(viewerId, pattern.id) : false;

  const parent = pattern.parentId ? await getPatternStub(pattern.parentId) : null;
  const comments: CommentView[] = (await listComments(pattern.id)).map((comment) => ({
    id: comment.id,
    userId: comment.userId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() ?? null,
    username: comment.username,
    displayUsername: comment.displayUsername,
  }));

  return (
    <PatternDetailClient
      // Remount after an owner edit so the editor and preview pick up the
      // rewritten source instead of holding the pre-edit copy in local state.
      key={`${pattern.id}:${pattern.updatedAt.getTime()}`}
      pattern={{
        id: pattern.id,
        title: pattern.title,
        description: pattern.description,
        code: pattern.code,
        codeCpp: pattern.codeCpp,
        license: pattern.license,
        madeOn: pattern.madeOn,
        madeHow: pattern.madeHow,
        createdAt: pattern.createdAt.toISOString(),
        username: pattern.username,
        displayUsername: pattern.displayUsername,
        // Read out of the stored source, not stored separately — the source is
        // where Pattern Lab wrote these while the author worked.
        provenance: provenanceFor(pattern.code, pattern.codeCpp !== null, pattern.madeHow),
        parent: parent
          ? {
              id: parent.id,
              title: parent.title,
              // Carried so the download's credit line matches the stored source.
              handle: parent.displayUsername ?? parent.username ?? null,
              // Bounds what this fork may be relicensed to.
              license: parent.license,
            }
          : null,
        likeCount: pattern.likeCount,
        forkCount: pattern.forkCount,
      }}
      comments={comments}
      initialKnobs={initialKnobs}
      liked={liked}
      isOwner={viewerId === pattern.userId}
    />
  );
}
