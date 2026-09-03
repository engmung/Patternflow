import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/server/admin";
import { getAuth } from "@/lib/community/server/auth";
import { communityEnabled } from "@/lib/community/server/db";
import { getDeck, listDeckItems } from "@/lib/community/server/queries";
import { toDeckPageItem } from "@/lib/community/server/serialize";
import { canView } from "@/lib/community/visibility";
import DeckDetailClient from "./DeckDetailClient";

// A shared deck: the running order somebody arranged, each slot a live pattern
// card credited to its own author. Slots whose pattern is gone (deleted, or
// made private since) render as gaps — the arrangement is the deck author's
// work, and silently closing a hole would misrepresent it.

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function generateMetadata(props: RouteParams): Promise<Metadata> {
  if (!communityEnabled()) return {};
  const { id } = await props.params;
  const deck = await getDeck(id);
  if (!deck || deck.visibility === "private") return {};
  return {
    title: `${deck.title} / Patternflow Community`,
    description:
      deck.description ??
      `A deck of LED matrix patterns arranged by @${deck.displayUsername ?? deck.username}.`,
  };
}

export default async function CommunityDeckPage(props: RouteParams) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const { id } = await props.params;
  const deck = await getDeck(id);
  if (!deck) notFound();

  const session = await getAuth().api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;

  if (!canView(deck.visibility, deck.userId, viewerId, isAdminSession(session))) {
    notFound();
  }

  const items = (await listDeckItems(deck.id, viewerId)).map(toDeckPageItem);

  return (
    <DeckDetailClient
      key={`${deck.id}:${deck.updatedAt.getTime()}`}
      deck={{
        id: deck.id,
        title: deck.title,
        description: deck.description,
        visibility: deck.visibility,
        performanceJson: deck.performanceJson,
        createdAt: deck.createdAt.toISOString(),
        username: deck.username,
        displayUsername: deck.displayUsername,
      }}
      items={items}
      isOwner={viewerId === deck.userId}
    />
  );
}
