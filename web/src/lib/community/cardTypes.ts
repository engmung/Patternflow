// The shapes the community's two cards are drawn from. They live here, not
// beside the components, because the server-side serializers in
// lib/community/serialize.ts produce them — and lib must not reach into
// components/ to learn what to produce (the one import that did was the only
// lib → components edge in the repository). The components re-export them,
// so existing importers are unaffected.

export type PatternCardItem = {
  id: string;
  title: string;
  code: string;
  parentId: string | null;
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
  likeCount: number;
  forkCount: number;
  /** Ships a verified firmware header — flashable as-is. */
  hasCpp: boolean;
  /** "public" | "private" — a chip appears when private,
   *  which only ever happens on the owner's own profile. */
  visibility: string;
  /** Distinct other people whose public decks carry this pattern. */
  deckCount: number;
  /** Whether the signed-in viewer already liked it — lights the card heart.
   *  Optional: surfaces that don't compute it get a heart that assumes no. */
  viewerLiked?: boolean;
};

export type DeckCardItem = {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
  patternCount: number;
  /** First few patterns in running order. */
  preview: { id: string; title: string; code: string }[];
};
