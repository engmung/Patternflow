import { livePresets } from "@/lib/presets";
import { BASICS_PACK, packPreviews } from "@/lib/pattern/packs";

// What hangs in the practice community (Make · 01): placeholders, as the maker
// allowed — Origin, and three patterns named only "Pattern 1", "Pattern 2",
// "Pattern 3", each alive through a real JS preset (the names stay generic;
// the code is the preset's own, credit and all). Two placeholder decks. The
// shipped Basics pack is the real one (lib/pattern/packs.ts), because it is
// the same object the real Decks page shows.
//
// Nothing here is fetched and nothing is sent: the practice community is
// connected to nothing.

export type PracticePattern = {
  id: string;
  title: string;
  /** The JS the card plays: a real preset's source. */
  code: string;
  /** Ships a .h (in the practice, a flag: the real community stores the header). */
  hasCpp: boolean;
  handle: string;
  license: string;
};

export type PracticeDeck = {
  id: string;
  title: string;
  handle: string;
  /** Pattern ids, in running order. */
  patterns: string[];
};

function presetCode(id: string): string {
  const p = livePresets.find((x) => x.id === id);
  if (!p) throw new Error(`practice community: no preset "${id}"`);
  return p.code;
}

// Four looks that are easy to tell apart at a glance: Origin's red tiles, a
// swirl, rings, a spiral. Pattern 2 is the one without a .h — the one that
// plays here and not on a board.
export const PATTERNS: PracticePattern[] = [
  { id: "origin", title: "Origin", code: presetCode("origin"), hasCpp: true, handle: "engmung", license: "CC-BY-SA-4.0" },
  { id: "pattern-1", title: "Pattern 1", code: presetCode("pattern-0524"), hasCpp: true, handle: "engmung", license: "CC-BY-SA-4.0" },
  { id: "pattern-2", title: "Pattern 2", code: presetCode("pattern-0614"), hasCpp: false, handle: "engmung", license: "CC-BY-SA-4.0" },
  { id: "pattern-3", title: "Pattern 3", code: presetCode("pattern-0629"), hasCpp: true, handle: "engmung", license: "CC-BY-SA-4.0" },
];

/** Newest first, as the wall comes by default (the practice's own order). */
export const NEWEST = ["pattern-3", "pattern-2", "pattern-1", "origin"];

export const DECKS: PracticeDeck[] = [
  { id: "deck-1", title: "Deck 1", handle: "engmung", patterns: ["pattern-3", "origin", "pattern-1"] },
  { id: "deck-2", title: "Deck 2", handle: "engmung", patterns: ["origin", "pattern-3"] },
];

export function patternById(id: string): PracticePattern | undefined {
  return PATTERNS.find((p) => p.id === id);
}

export function deckById(id: string): PracticeDeck | undefined {
  return DECKS.find((d) => d.id === id);
}

/** The Basics card's strip: its first patterns, drawn from their JS twins (as the decks page does). */
export const BASICS = BASICS_PACK;
export const BASICS_STRIP = packPreviews(BASICS_PACK, livePresets).map((e) => ({
  key: `basics-${e.slug}`,
  code: e.code,
  title: e.title,
}));

/** The deck bar's cap and the public-deck cap the Decks page states: the real community's. */
export { DECK_MAX, PUBLIC_DECKS_MAX } from "@/lib/community/deck";

/** A compiled module is about this big (SendModuleModal: "~6 KB"); the practice's pretend build reports it. */
export const MODULE_KB = 6;
