// Feed density — one continuous knob, not two presets.
//
// Card size follows Ctrl + scroll (and trackpad pinch), Pinterest-style: the
// grid refits as the target card width changes, and the choice is remembered
// per browser (localStorage) rather than in the URL — it is a personal
// reading preference, not something a shared link should impose.
//
// The server still needs one number: how many patterns the first paint ships,
// before the client has measured anything. After that the feed loads batch by
// batch as you scroll, because every card ships its full source and fetching
// patterns nobody has scrolled to would pay for them twice — in transfer and
// in sandboxes.

/** Target card width, px. The grid fits as many as the row allows. */
export const SLOT_DEFAULT = 205;
export const SLOT_MIN = 90;
export const SLOT_MAX = 320;

/** At and below this width the card swaps to its compact furniture
 *  (the CSS keyed off data-view="small"). */
export const SLOT_COMPACT = 140;

/** Where the browser remembers the chosen size. */
export const FEED_SLOT_KEY = "pf-feed-slot";

/** First-paint batch, served before the client knows its viewport. */
export const FEED_FIRST_PAINT = 18;

/** Ceiling on how much pattern source one request can ship. */
export const MAX_FEED_PAGE_SIZE = 44;

// Mobile ignores the zoom entirely: cards are static thumbnails (no hover, no
// Ctrl+wheel on a phone), packed dense so the feed is a real scrollable wall.
export const MOBILE_FEED_VIEW = {
  slot: 100,
  gap: 8,
  batchRows: 6,
} as const;

/** Grid gap for a given card size — compact cards sit tighter. */
export function gapForSlot(slot: number): number {
  return slot <= SLOT_COMPACT ? 10 : 16;
}

/** Rows fetched per scroll batch — enough that scrolling one row does not
 *  cost one request, small enough that the tail stays cheap. */
export function batchRowsForSlot(slot: number): number {
  return slot <= SLOT_COMPACT ? 4 : 3;
}
