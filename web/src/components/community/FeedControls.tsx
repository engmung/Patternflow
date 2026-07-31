"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { DEFAULT_FEED_VIEW, FEED_VIEWS, type FeedView } from "@/lib/community/feedView";
import styles from "./Community.module.css";

// Sort + filter bar. Plain links carrying query params, so the feed stays a
// server-rendered, shareable, back-button-friendly URL.

const SORTS = [
  { id: "new", label: "Newest" },
  { id: "top", label: "Most liked" },
  { id: "forks", label: "Most forked" },
  // Counts distinct OTHER people whose published decks carry the pattern —
  // harder to game than likes, since it costs a public deck slot.
  { id: "decks", label: "In decks" },
] as const;

export default function FeedControls({
  sort,
  hardwareOnly,
  view,
}: {
  sort: string;
  hardwareOnly: boolean;
  view: FeedView;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefWith = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    // Changing the view always restarts at the first page — page 3 of "newest"
    // means nothing in "most liked", and may not even exist once filtered.
    next.delete("page");
    // The row size is measured for the old view; let the server pick its
    // default and the client re-measure rather than carrying a stale one.
    next.delete("size");
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <div className={styles.feedControls}>
      <div className={styles.sortTabs} role="group" aria-label="Sort patterns">
        {SORTS.map((option) => (
          <Link
            key={option.id}
            href={hrefWith({ sort: option.id === "new" ? null : option.id })}
            data-active={sort === option.id}
            scroll={false}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className={styles.viewTabs} role="group" aria-label="Card size">
        {(Object.keys(FEED_VIEWS) as FeedView[]).map((option) => (
          <Link
            key={option}
            href={hrefWith({ view: option === DEFAULT_FEED_VIEW ? null : option })}
            data-active={view === option}
            scroll={false}
            title={
              FEED_VIEWS[option].rows === 1
                ? "One row of large cards"
                : `${FEED_VIEWS[option].rows} rows of smaller cards`
            }
          >
            {FEED_VIEWS[option].label}
          </Link>
        ))}
      </div>

      <Link
        className={styles.filterChip}
        href={hrefWith({ hw: hardwareOnly ? null : "1" })}
        data-active={hardwareOnly}
        scroll={false}
        title="Only patterns that ship a verified .h firmware header — ready to flash to a board"
      >
        {/* Same chip as the one on the cards, so the filter names its own badge. */}
        <span className={styles.hwChip}>.h</span> Hardware ready
      </Link>
    </div>
  );
}
