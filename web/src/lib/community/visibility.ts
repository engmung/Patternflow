// Visibility — two states, shared by patterns and decks.
//
// Shared, or not. Public is on the wall and openable by anyone; private is the
// author alone.
//
// There used to be a third, `unlisted`: off the wall but openable by link.
// It was doing two jobs — "look at this before I post it", and letting a deck
// carry a pattern that was not on the wall — and neither survived contact with
// the question "so who can see this?", which is the only question the picker is
// really asking. Two states answer it; three made people guess.
//
// The consequence is deliberate and worth knowing: a shared deck can now only
// carry PUBLIC patterns. Something private is yours, and putting it in
// somebody else's running order is a contradiction rather than a feature.
// Migration 0014 folded every existing `unlisted` row into `private`.
//
// Importable from client and server — no database access here.

export const VISIBILITY_VALUES = ["public", "private"] as const;
export type Visibility = (typeof VISIBILITY_VALUES)[number];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "Public",
  private: "Private",
};

/** Shown under the picker — has to say what actually happens. */
export const VISIBILITY_HINTS: Record<Visibility, string> = {
  public: "On the wall, for everyone.",
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
 * their own private work.
 */
export function forkBlocked(
  parent: { visibility: string; userId: string },
  viewerId: string,
): boolean {
  return parent.visibility === "private" && parent.userId !== viewerId;
}
