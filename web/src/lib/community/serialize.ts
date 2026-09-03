import type { DeckCardItem, PatternCardItem } from "./cardTypes";
import type { DeckItem, DeckListItem, FeedItem } from "./queries";

/** Server → client boundary: Dates become ISO strings. `likedIds` (from
 *  likedPatternIds, one query per page) lights the card hearts. */
export function toCardItem(item: FeedItem, likedIds?: Set<string>): PatternCardItem {
  return {
    id: item.id,
    title: item.title,
    code: item.code,
    parentId: item.parentId,
    createdAt: item.createdAt.toISOString(),
    username: item.username,
    displayUsername: item.displayUsername,
    likeCount: item.likeCount,
    forkCount: item.forkCount,
    hasCpp: item.hasCpp,
    visibility: item.visibility,
    deckCount: item.deckCount,
    viewerLiked: likedIds?.has(item.id) ?? false,
  };
}

export function toDeckCardItem(item: DeckListItem): DeckCardItem {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    visibility: item.visibility,
    createdAt: item.createdAt.toISOString(),
    username: item.username,
    displayUsername: item.displayUsername,
    patternCount: item.patternCount,
    preview: item.preview,
  };
}

/** One slot of a deck page: a pattern card, or a named gap. */
export type DeckPageItem = {
  position: number;
  patternId: string;
  titleSnapshot: string;
  pattern: PatternCardItem | null;
  gap: "deleted" | "private" | null;
};

export function toDeckPageItem(item: DeckItem): DeckPageItem {
  return {
    position: item.position,
    patternId: item.patternId,
    titleSnapshot: item.titleSnapshot,
    pattern: item.pattern ? toCardItem(item.pattern) : null,
    gap: item.gap,
  };
}
