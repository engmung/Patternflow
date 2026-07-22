"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PatternCard, { PatternCardItem } from "./PatternCard";
import styles from "./Community.module.css";

// Dynamic responsive single-row layout for 1.2x enlarged vertical cards (~205px slot width).

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

export default function CommunityFeedClient({ items }: { items: PatternCardItem[] }) {
  const [page, setPage] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const cardsPerRow = useResponsiveCardsPerRow(containerRef);

  const totalPages = Math.max(1, Math.ceil(items.length / cardsPerRow));
  const currentPage = Math.min(page, totalPages - 1);
  const currentItems = items.slice(
    currentPage * cardsPerRow,
    (currentPage + 1) * cardsPerRow,
  );

  const handlePrev = () => {
    setPage((p) => Math.max(0, p - 1));
  };

  const handleNext = () => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  };

  // Support Arrow Left / Right keys for instant page flipping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalPages]);

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

      {items.length === 0 ? (
        <div className={styles.empty}>
          Nothing here yet. Open Pattern Lab, make something, hit “Share to Community”.
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
            {currentItems.map((item) => (
              <PatternCard key={item.id} item={item} />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className={styles.paginationBar}>
              <button
                type="button"
                className={styles.pageBtn}
                onClick={handlePrev}
                disabled={currentPage === 0}
              >
                ◀ Prev
              </button>

              <span className={styles.pageIndicator}>
                Page <strong>{currentPage + 1}</strong> of {totalPages}
                <span className={styles.pageMetaTotal}>({items.length} patterns)</span>
              </span>

              <button
                type="button"
                className={styles.pageBtn}
                onClick={handleNext}
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
