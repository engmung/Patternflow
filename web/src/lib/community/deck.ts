// Two collections, not one.
//
// This started as a single "cart" capped at ten, which conflated two different
// things because they happened to share a button. Ten is a *build* limit
// (MAX_MODULE_PATTERNS_PER_BUILD) and has nothing to do with how many patterns
// somebody wants to keep. Telling a person they may only like ten things is
// absurd; telling them a firmware build fits ten is a fact about firmware.
//
//   Saved — unbounded, unordered. The "I might want this" gesture. A pin.
//   Deck  — capped, ORDERED, and buildable. What goes on the board tonight.
//
// The order is the point of a deck. The device cycles patterns with a long
// press on encoder 4, so a deck is a setlist, not a folder — and arranging one
// is a decision the person made, not a detail of storage.
//
// Both live in localStorage on purpose. This is browsing state: it holds copies
// of headers that could be re-collected in a minute, so losing it costs
// nothing, and keeping it out of the database means no schema, no "whose deck
// is this" question, and no sync.

export type CollectedPattern = {
  /** Community pattern id — de-duplicates, and links back. */
  patternId: string;
  title: string;
  /** The verified .h header the pattern ships. */
  code: string;
};

/** Mirrors MAX_MODULE_PATTERNS_PER_BUILD on the build API. */
export const DECK_MAX = 10;

export const COLLECTION_EVENT = "pf-collection-changed";

const DECK_KEY = "pf-deck";
const SAVED_KEY = "pf-saved";
/** What the deck was called when it was the only list. Migrated once, on read. */
const LEGACY_CART_KEY = "pf-module-cart";

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
      reason: `A deck holds ${DECK_MAX} patterns — that is what fits in one build. Save it instead.`,
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

// ── Saved ────────────────────────────────────────────────────────────────────

export function savedItems(): CollectedPattern[] {
  return read(SAVED_KEY);
}

export function savedHas(patternId: string): boolean {
  return read(SAVED_KEY).some((item) => item.patternId === patternId);
}

/** No cap. Saving is "I liked this", and there is no reason to ration that. */
export function savedAdd(item: CollectedPattern): void {
  const items = read(SAVED_KEY);
  const existing = items.findIndex((entry) => entry.patternId === item.patternId);
  if (existing >= 0) items[existing] = item;
  else items.unshift(item); // newest first — this is a list you browse
  write(SAVED_KEY, items);
}

export function savedRemove(patternId: string): void {
  write(
    SAVED_KEY,
    read(SAVED_KEY).filter((item) => item.patternId !== patternId),
  );
}

export function savedClear(): void {
  write(SAVED_KEY, []);
}

/**
 * Promote a saved pattern into the deck, leaving it saved.
 *
 * Saving works on any pattern, but a deck is built into firmware, so one
 * without a hardware-tested `.h` has nothing to compile. Caught here rather
 * than at build time, where the failure would be a compiler error about an
 * empty file.
 */
export function savedToDeck(patternId: string): { ok: boolean; reason?: string } {
  const item = read(SAVED_KEY).find((entry) => entry.patternId === patternId);
  if (!item) return { ok: false, reason: "That pattern is no longer saved." };
  if (item.code.trim().length === 0) {
    return {
      ok: false,
      reason: `"${item.title}" has no firmware header yet, so it cannot be built. Open it and check back once its author adds one.`,
    };
  }
  return deckAdd(item);
}

/** Whether a saved pattern can go into the deck at all. Drives the UI. */
export function savedIsBuildable(item: CollectedPattern): boolean {
  return item.code.trim().length > 0;
}
