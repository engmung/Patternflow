// The working deck: capped, ORDERED, and buildable. What goes on the board
// tonight.
//
// The order is the point. The device cycles patterns with a long press on
// encoder 4, so a deck is a setlist, not a folder — and arranging one is a
// decision the person made, not a detail of storage.
//
// It lives in localStorage on purpose. This is browsing state: it holds copies
// of headers that could be re-collected in a minute, so losing it costs
// nothing, and keeping it out of the database means no schema, no "whose deck
// is this" question, and no sync.
//
// There used to be a second list here — Saved, unbounded and unordered, the
// "I might want this" pin. It was removed because a like already was that
// gesture, and a better one: likes are server-side and per-account, while
// Saved was per-browser and died with the site data. What likes lacked was
// somewhere to read them back, which is now the feed's "Liked" tab.

export type CollectedPattern = {
  /** Community pattern id — de-duplicates, and links back. */
  patternId: string;
  title: string;
  /** The verified .h header the pattern ships. This is what gets BUILT, and
   *  for a long time it was the only thing stored here. */
  code: string;
  /**
   * The pattern's JavaScript — what it LOOKS like.
   *
   * Carried purely so the dock can draw the slots it is holding. Every caller
   * already has this in hand (a card is rendering a thumbnail from it when you
   * press +), so it costs a field rather than a request; the deck pages get the
   * same thing from the database and have always been able to draw.
   *
   * Optional because decks collected before this existed have no copy, and a
   * slot without one falls back to its number rather than emptying.
   */
  js?: string;
};

/**
 * Patterns in one deck. Mirrors MAX_MODULE_PATTERNS_PER_BUILD on the build
 * API — the two must move together or a deck fills past what it can build.
 *
 * Not a device limit: the firmware holds 128 modules. This is how much work
 * one build job takes on, at roughly half a second per pattern.
 */
export const DECK_MAX = 20;

/**
 * How many PUBLIC decks one account may share at once.
 *
 * A curation policy, not a technical limit — the opposite of DECK_MAX, which
 * is a fact about firmware. Publishing a deck spends a slot, so a published
 * deck is staked reputation rather than overflow storage: a shelf you must
 * ration is a shelf you curate. Private decks are not rationed. Raising this
 * is easy; lowering it would strand people over the limit, which is why it
 * started at two.
 *
 * Moderators are exempt (see isAdminSession at the enforcement points): the
 * cap exists to keep the shelf curated, and curating the shelf is their job.
 */
export const PUBLIC_DECKS_MAX = 5;

export const COLLECTION_EVENT = "pf-collection-changed";

/**
 * The drag payload a wall card hands to the dock.
 *
 * A custom MIME type rather than `text/plain`, because the dock must be able
 * to tell "a pattern is being dragged onto me" from "some text is" during
 * dragover — where the DATA is unreadable but the type list is not.
 */
export const DECK_DRAG_TYPE = "application/x-patternflow-pattern";

export type DeckDragPayload = { patternId: string; title: string; js: string };

/**
 * Put a pattern in the deck, fetching the header first.
 *
 * The deck builds firmware, so it needs the .h — and a card does not carry one
 * (a header can be 200 KB and most cards are never collected), so it is
 * fetched at the moment of collecting. Shared by the "+" on a card and by
 * dropping a card on the dock: two gestures, one meaning, and the failure
 * modes should not drift apart.
 */
export async function collectPattern(
  item: DeckDragPayload,
  fetchHeader: (patternId: string) => Promise<{ codeCpp?: string; error?: string }>,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const payload = await fetchHeader(item.patternId);
    if (!payload.codeCpp) {
      return { ok: false, reason: payload.error ?? "Could not read the header." };
    }
    return deckAdd({
      patternId: item.patternId,
      title: item.title,
      code: payload.codeCpp,
      js: item.js,
    });
  } catch {
    return { ok: false, reason: "Network error." };
  }
}

/**
 * "Open the deck panel."
 *
 * The deck now has two faces — the dock along the bottom of every community
 * page, and the panel that actually builds and sends it — and only one of them
 * owns the build machinery. Rather than lift that state into a provider for a
 * single button, the dock asks for the panel by name and the panel answers.
 */
export const DECK_PANEL_EVENT = "pf-open-deck-panel";

export function openDeckPanel(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DECK_PANEL_EVENT));
}

const DECK_KEY = "pf-deck";
/** What the deck was called when it was the only list. Migrated once, on read. */
const LEGACY_CART_KEY = "pf-module-cart";
/** The removed Saved list. Cleared on first read so it does not sit in
 *  people's browsers forever holding copies of patterns nothing can show. */
const RETIRED_SAVED_KEY = "pf-saved";

function parse(raw: string | null): CollectedPattern[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CollectedPattern =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as CollectedPattern).patternId === "string" &&
        typeof (entry as CollectedPattern).title === "string" &&
        typeof (entry as CollectedPattern).code === "string",
    );
  } catch {
    return [];
  }
}

function read(key: string): CollectedPattern[] {
  if (typeof window === "undefined") return [];
  // Anyone who had a cart before this split keeps it, as their deck. Done on
  // read rather than in a migration step so it works whenever they next visit,
  // from whichever page they land on.
  if (key === DECK_KEY) {
    const legacy = window.localStorage.getItem(LEGACY_CART_KEY);
    if (legacy !== null && window.localStorage.getItem(DECK_KEY) === null) {
      window.localStorage.setItem(DECK_KEY, legacy);
      window.localStorage.removeItem(LEGACY_CART_KEY);
    }
    // Same idea for the list that went away: nothing reads it now, and leaving
    // it behind would keep a copy of somebody's saved patterns in their
    // browser indefinitely with no screen able to show or clear it.
    window.localStorage.removeItem(RETIRED_SAVED_KEY);
  }
  return parse(window.localStorage.getItem(key));
}

function write(key: string, items: CollectedPattern[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Private mode: the list degrades to per-page state; the event still fires
    // so the UI reflects what the visitor just did.
  }
  window.dispatchEvent(new CustomEvent(COLLECTION_EVENT));
}

// ── Deck ─────────────────────────────────────────────────────────────────────

export function deckItems(): CollectedPattern[] {
  return read(DECK_KEY);
}

export function deckHas(patternId: string): boolean {
  return read(DECK_KEY).some((item) => item.patternId === patternId);
}

/** Add, or refresh the stored header if the pattern is already in the deck. */
export function deckAdd(item: CollectedPattern): { ok: boolean; reason?: string } {
  // A deck is compiled into firmware, so a pattern whose author has not
  // shipped a `.h` has nothing to build. This check used to live on the way
  // out of the Saved list, which was the only route in for a pattern without
  // one; with that list gone the rule belongs here, where everything enters.
  // The callers also gate their buttons on it — this is the floor under them.
  if (!deckIsBuildable(item)) {
    return {
      ok: false,
      reason: `"${item.title}" has no firmware header yet, so it cannot be built. Open it and check back once its author adds one.`,
    };
  }
  const items = read(DECK_KEY);
  const existing = items.findIndex((entry) => entry.patternId === item.patternId);
  if (existing >= 0) {
    items[existing] = item;
    write(DECK_KEY, items);
    return { ok: true };
  }
  if (items.length >= DECK_MAX) {
    return {
      ok: false,
      reason: `A deck holds ${DECK_MAX} patterns — that is what fits in one build. Take one out to make room.`,
    };
  }
  items.push(item);
  write(DECK_KEY, items);
  return { ok: true };
}

export function deckRemove(patternId: string): void {
  write(
    DECK_KEY,
    read(DECK_KEY).filter((item) => item.patternId !== patternId),
  );
}

export function deckClear(): void {
  write(DECK_KEY, []);
}

/**
 * Replace the whole working deck in one move — how a shared deck is copied in.
 * Order is preserved (it is the point of a deck); anything over the cap is
 * dropped from the end. The caller confirms before overwriting a non-empty
 * deck — this function does not ask.
 */
export function deckReplace(items: CollectedPattern[]): void {
  write(DECK_KEY, items.slice(0, DECK_MAX));
}

/**
 * Drop the pattern at `from` into position `to`, shifting the rest along.
 *
 * What dragging a slot in the dock commits. Index-based rather than
 * id-based because the dock has already worked out where the thing landed by
 * counting slots, and asking it to translate that back into an id would be
 * arithmetic in both directions.
 */
export function deckReorder(from: number, to: number): void {
  const items = read(DECK_KEY);
  if (from === to) return;
  if (from < 0 || from >= items.length) return;
  const target = Math.max(0, Math.min(items.length - 1, to));
  const [moved] = items.splice(from, 1);
  items.splice(target, 0, moved);
  write(DECK_KEY, items);
}

/**
 * Move one pattern up or down the running order. A deck plays in sequence on
 * the device, so this is the only editing a deck really needs.
 */
export function deckMove(patternId: string, direction: -1 | 1): void {
  const items = read(DECK_KEY);
  const from = items.findIndex((item) => item.patternId === patternId);
  if (from < 0) return;
  const to = from + direction;
  if (to < 0 || to >= items.length) return;
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  write(DECK_KEY, items);
}

/** Whether a pattern can go into the deck at all. Drives the UI. */
export function deckIsBuildable(item: CollectedPattern): boolean {
  return item.code.trim().length > 0;
}
