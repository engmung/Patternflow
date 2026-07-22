"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PatternCard, { PatternCardItem } from "./PatternCard";
import FeedControls from "./FeedControls";
import styles from "./Community.module.css";

// Dynamic responsive single-row layout for 1.2x enlarged vertical cards (~205px slot width).
//
// Paging is server-side: each request returns roughly one row's worth of
// patterns instead of the whole feed. Cards are tall (1:2), so a second row
// would not fit the viewport anyway — there is no reason to ship code for
// patterns that can't be drawn.

function useResponsiveCardsPerRow(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [cardsPerRow, setCardsPerRow] = useState(6);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      // 1.2x enlarged card width ~205px + gap 20px = 225px per card slot
      const count = Math.max(1, Math.floor((w + 20) / (205 + 20)));
      setCardsPerRow(count);
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return cardsPerRow;
}

export default function CommunityFeedClient({
  items,
  sort = "new",
  hardwareOnly = false,
  page = 0,
  total = 0,
}: {
  items: PatternCardItem[];
  sort?: string;
  hardwareOnly?: boolean;
  page?: number;
  total?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const cardsPerRow = useResponsiveCardsPerRow(containerRef);

  // The server sends a slightly generous first page (it can't know the
  // viewport), so trim to what actually fits. Page 0 of any size shares the
  // same prefix, so the following pages line up exactly.
  const visibleItems = items.slice(0, cardsPerRow);
  const totalPages = Math.max(1, Math.ceil(total / cardsPerRow));
  const currentPage = Math.min(page, totalPages - 1);

  const hrefForPage = useCallback(
    (nextPage: number) => {
      const next = new URLSearchParams(params.toString());
      if (nextPage <= 0) next.delete("page");
      else next.set("page", String(nextPage));
      // Ask for exactly one row from here on.
      next.set("size", String(cardsPerRow));
      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [params, pathname, cardsPerRow],
  );

  const goTo = useCallback(
    (nextPage: number) => {
      if (nextPage < 0 || nextPage > totalPages - 1) return;
      router.push(hrefForPage(nextPage), { scroll: false });
    },
    [router, hrefForPage, totalPages],
  );

  // Arrow keys flip pages, as before.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowLeft") goTo(currentPage - 1);
      if (event.key === "ArrowRight") goTo(currentPage + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goTo, currentPage]);

  return (
    <div className={styles.feedWrapper}>
      <div className={styles.introRow}>
        <span>
          Patterns shared by the community — hover over any pattern to play live, scroll wheel to turn knobs!
        </span>
        <span className={styles.headerSpacer} />
        <Link href="/pattern-lab" className={styles.btnAccent}>
          Make one in Pattern Lab
        </Link>
      </div>

      <FeedControls sort={sort} hardwareOnly={hardwareOnly} />

      {total === 0 ? (
        <div className={styles.empty}>
          {hardwareOnly
            ? "No hardware-ready patterns yet — these are the ones shipping a verified .h you can flash straight to a board."
            : "Nothing here yet. Open Pattern Lab, make something, hit “Share to Community”."}
        </div>
      ) : (
        <div ref={containerRef} className={styles.centeredFeedBody}>
          {/* Single Row Grid dynamically styled with exact cardsPerRow columns */}
          <div
            className={styles.singleRowGrid}
            style={{
              gridTemplateColumns: `repeat(${cardsPerRow}, minmax(0, 1fr))`,
            }}
          >
            {visibleItems.map((item) => (
              <PatternCard key={item.id} item={item} />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className={styles.paginationBar}>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => goTo(currentPage - 1)}
                disabled={currentPage === 0}
              >
                ◀ Prev
              </button>

              <span className={styles.pageIndicator}>
                Page <strong>{currentPage + 1}</strong> of {totalPages}
                <span className={styles.pageMetaTotal}>({total} patterns)</span>
              </span>

              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => goTo(currentPage + 1)}
                disabled={currentPage >= totalPages - 1}
              >
                Next ▶
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
