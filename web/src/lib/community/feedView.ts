// Feed density — two ways to look at the same feed.
//
// Lives in the URL (`?view=`) alongside sort and the hardware filter, so a view
// is shareable and the back button works. The server needs it too: it decides
// how many patterns to send on a first load, before the client has measured the
// viewport, and two rows of half-size cards need a lot more of them than one
// row of large ones.

export type FeedView = "large" | "small";

export type FeedViewConfig = {
  label: string;
  /** Target card width in px. The grid fits as many of these as it can. */
  slot: number;
  /** Grid gap in px — part of the fit calculation, so keep it with the slot. */
  gap: number;
  rows: number;
  /** First-load page size, used before the client knows the real row width. */
  defaultSize: number;
};

export const FEED_VIEWS: Record<FeedView, FeedViewConfig> = {
  large: { label: "Large", slot: 205, gap: 16, rows: 1, defaultSize: 12 },
  small: { label: "Small", slot: 104, gap: 10, rows: 2, defaultSize: 30 },
};

export const DEFAULT_FEED_VIEW: FeedView = "large";

/** Ceiling on how much pattern source one request can ship. */
export const MAX_FEED_PAGE_SIZE = 44;

export function parseFeedView(raw: string | undefined): FeedView {
  return raw === "small" ? "small" : DEFAULT_FEED_VIEW;
}
