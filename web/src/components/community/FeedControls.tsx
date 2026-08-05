"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./Community.module.css";

// The wall's one control row: how many patterns there are, how they are
// ordered, and whether to show only the ones a board can play tonight.
//
// Everything except card size is a plain link carrying a query param, so a
// view is a server-rendered, shareable, back-button-friendly URL. Card size is
// not here: that is the Ctrl+scroll zoom, a per-browser preference, and the
// hint on the right is its only UI.

const SORTS = [
  { id: "new", label: "Newest" },
  { id: "top", label: "Most liked" },
  { id: "forks", label: "Most forked" },
  { id: "decks", label: "In decks" },
] as const;

export default function FeedControls({
  sort,
  hardwareOnly,
  total,
}: {
  sort: string;
  hardwareOnly: boolean;
  total?: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefWith = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    // Parameters from the paginated era — scrub them off any link followed
    // from an old bookmark.
    next.delete("page");
    next.delete("size");
    next.delete("view");
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <div className={styles.feedControls}>
      {typeof total === "number" && (
        <span className={styles.feedCount}>
          {total} pattern{total === 1 ? "" : "s"}
        </span>
      )}

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

      <span className={styles.controlRule} aria-hidden="true" />

      <Link
        className={styles.filterChip}
        href={hrefWith({ hw: hardwareOnly ? null : "1" })}
        data-active={hardwareOnly}
        scroll={false}
        title="Only patterns that ship a verified .h firmware header — ready to flash to a board"
      >
        {/* Same badge as the one on the cards, so the filter names its own mark. */}
        <span className={styles.hwChip}>.h</span> Flashable now
      </Link>

      {/* Desktop only (hidden with the rest of the pointer furniture on
          mobile): these gestures have no widgets, so the hint IS their
          discoverability. */}
      <span className={styles.zoomHint}>
        Ctrl + scroll to resize · scroll on a screen to turn its knobs · hover to play
      </span>

      {/* No mobile twin: on a phone every card on screen is already playing,
          so there is no gesture left to advertise. */}
    </div>
  );
}
