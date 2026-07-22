"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./Community.module.css";

// Sort + filter bar. Plain links carrying query params, so the feed stays a
// server-rendered, shareable, back-button-friendly URL.

const SORTS = [
  { id: "new", label: "Newest" },
  { id: "top", label: "Most liked" },
  { id: "forks", label: "Most forked" },
] as const;

export default function FeedControls({
  sort,
  hardwareOnly,
}: {
  sort: string;
  hardwareOnly: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefWith = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
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
