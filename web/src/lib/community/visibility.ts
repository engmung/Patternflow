// Visibility — three states, not two, shared by patterns and decks.
//
// Public is in the feed. Private is the author alone. Unlisted is the one that
// earns its keep: reachable by link but off the feed — "look at this before I
// post it", and the state that lets a deck carry a pattern without that pattern
// flooding the feed. Publishing still defaults to public: the community works
// because things are shared, and the flood is handled by curation (decks as a
// ranking signal), not by suppressing supply.
//
// Importable from client and server — no database access here.

export const VISIBILITY_VALUES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITY_VALUES)[number];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "Public",
  unlisted: "Unlisted",
  private: "Private",
};

/** Shown under the picker — has to say what actually happens. */
export const VISIBILITY_HINTS: Record<Visibility, string> = {
  public: "In the community feed, for everyone.",
  unlisted: "Off the feed — anyone with the link can open it.",
  private: "Only you can open it.",
};

export function isVisibility(raw: unknown): raw is Visibility {
  return typeof raw === "string" && VISIBILITY_VALUES.includes(raw as Visibility);
}

/** The value, or `undefined` when invalid. Callers pick their own default. */
export function cleanVisibility(raw: unknown): Visibility | undefined {
  return isVisibility(raw) ? raw : undefined;
}

/**
 * Whether a viewer may open something with this visibility. Moderators pass:
 * visibility is not a shield from a report, and a moderation queue that cannot
 * open what it moderates would be theatre.
 */
export function canView(
  visibility: string,
  ownerId: string,
  viewerId: string | null,
  isAdmin = false,
): boolean {
  if (visibility !== "private") return true;
  return viewerId === ownerId || isAdmin;
}

/**
 * A fork bakes a `Based on:` credit link into its source. If the parent is
 * private that link 404s for everyone (#255), so only the author may fork
 * their own private work. Unlisted parents are forkable — the link resolves.
 */
export function forkBlocked(
  parent: { visibility: string; userId: string },
  viewerId: string,
): boolean {
  return parent.visibility === "private" && parent.userId !== viewerId;
}
