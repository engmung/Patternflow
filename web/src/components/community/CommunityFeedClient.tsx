"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PatternCard, { PatternCardItem } from "./PatternCard";
import FeedControls from "./FeedControls";
import { DEFAULT_FEED_VIEW, FEED_VIEWS, type FeedView } from "@/lib/community/feedView";
import styles from "./Community.module.css";

// Responsive grid sized to whichever view is active (see lib/community/feedView).
//
// Paging is server-side: a request returns about a screenful of patterns rather
// than the whole feed. Every row ships its full source — the cards compile and
// play it client-side — so sending patterns nobody can see would be paying for
// them twice, in transfer and in sandboxes.

function useResponsiveCardsPerRow(
  containerRef: React.RefObject<HTMLDivElement | null>,
  slot: number,
  gap: number,
) {
  const [cardsPerRow, setCardsPerRow] = useState(6);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // n cards need n*slot + (n-1)*gap, i.e. (width + gap) / (slot + gap).
    const update = () => {
      setCardsPerRow(Math.max(1, Math.floor((el.clientWidth + gap) / (slot + gap))));
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, slot, gap]);

  return cardsPerRow;
}

export default function CommunityFeedClient({
  items,
  sort = "new",
  hardwareOnly = false,
  view = DEFAULT_FEED_VIEW,
  page = 0,
  total = 0,
}: {
  items: PatternCardItem[];
  sort?: string;
  hardwareOnly?: boolean;
  view?: FeedView;
  page?: number;
  total?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const config = FEED_VIEWS[view];
  const cardsPerRow = useResponsiveCardsPerRow(containerRef, config.slot, config.gap);
  const pageSize = Math.max(1, cardsPerRow * config.rows);

  // The server sends a slightly generous first page (it can't know the
  // viewport), so trim to what actually fits. Page 0 of any size shares the
  // same prefix, so the following pages line up exactly.
  const visibleItems = items.slice(0, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages - 1);

  const hrefForPage = useCallback(
    (nextPage: number) => {
      const next = new URLSearchParams(params.toString());
      if (nextPage <= 0) next.delete("page");
      else next.set("page", String(nextPage));
      // Ask for exactly what this viewport shows from here on.
      next.set("size", String(pageSize));
      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [params, pathname, pageSize],
  );

  const goTo = useCallback(
    (nextPage: number) => {
      if (nextPage < 0 || nextPage > totalPages - 1) return;
      router.push(hrefForPage(nextPage), { scroll: false });
    },
    [router, hrefForPage, totalPages],
  );

  const pageInputRef = useRef<HTMLInputElement | null>(null);

  const commitPageInput = useCallback(() => {
    const input = pageInputRef.current;
    if (!input) return;
    const typed = Number(input.value);
    if (!Number.isFinite(typed)) {
      input.value = String(currentPage + 1);
      return;
    }
    // Clamp rather than reject: "999" on a 7-page feed means the end.
    const target = Math.max(0, Math.min(totalPages - 1, Math.round(typed) - 1));
    if (target === currentPage) {
      input.value = String(currentPage + 1);
      return;
    }
    goTo(target);
  }, [currentPage, totalPages, goTo]);

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

      <FeedControls sort={sort} hardwareOnly={hardwareOnly} view={view} />

      {total === 0 ? (
        <div className={styles.empty}>
          {hardwareOnly
            ? "No hardware-ready patterns yet — these are the ones shipping a verified .h you can flash straight to a board."
            : "Nothing here yet. Open Pattern Lab, make something, hit “Share to Community”."}
        </div>
      ) : (
        <div ref={containerRef} className={styles.centeredFeedBody}>
          <div
            className={styles.feedGrid}
            data-view={view}
            style={{
              gridTemplateColumns: `repeat(${cardsPerRow}, minmax(0, 1fr))`,
              gap: `${config.gap}px`,
            }}
          >
            {visibleItems.map((item) => (
              <PatternCard key={item.id} item={item} />
            ))}
          </div>

          {/* Pagination. Stepping is fine for a handful of pages, but a feed of
              any size needs a way in that doesn't cost one page load per step —
              hence First/Last and a page box you can type into. */}
          {totalPages > 1 && (
            <div className={styles.paginationBar}>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => goTo(0)}
                disabled={currentPage === 0}
                title="First page"
                aria-label="First page"
              >
                ⏮
              </button>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => goTo(currentPage - 1)}
                disabled={currentPage === 0}
              >
                ◀ Prev
              </button>

              <span className={styles.pageIndicator}>
                Page{" "}
                <input
                  // Remount on page change so the box always shows the page
                  // actually being displayed, never a half-typed number left
                  // over from a jump that got clamped or cancelled.
                  key={currentPage}
                  ref={pageInputRef}
                  className={styles.pageInput}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={totalPages}
                  defaultValue={currentPage + 1}
                  aria-label={`Page number, 1 to ${totalPages}`}
                  onFocus={(event) => event.currentTarget.select()}
                  onBlur={commitPageInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      event.currentTarget.value = String(currentPage + 1);
                      event.currentTarget.blur();
                    }
                  }}
                />{" "}
                of {totalPages}
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
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => goTo(totalPages - 1)}
                disabled={currentPage >= totalPages - 1}
                title="Last page"
                aria-label="Last page"
              >
                ⏭
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
