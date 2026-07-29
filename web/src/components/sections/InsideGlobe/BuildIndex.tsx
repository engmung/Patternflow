'use client';

import { useState } from 'react';
import Image from 'next/image';
import { builds, formatBuildDate } from './builds';
import { buildPath, useBuildSelection } from './useBuildSelection';
import styles from './BuildIndex.module.css';

const PAGE_SIZE = 5;

// Newest first, because the interesting question is who built one lately. Dates
// are YYYY-MM and several pins share a month, so ties fall back to reverse
// source order — later in builds.ts means added later, which is the best "newer"
// signal the data has.
const ordered = builds
  .map((build, index) => ({ build, index }))
  .sort((a, b) =>
    a.build.date === b.build.date
      ? b.index - a.index
      : b.build.date.localeCompare(a.build.date),
  )
  .map(({ build }) => build);

const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
const pad = (n: number) => String(n).padStart(2, '0');

// The globe is a canvas, so every pin on it is invisible to a keyboard, a
// screen reader and a crawler. This is the same set of pins as plain links —
// which is also the only way anything on the site points at the /inside/<slug>
// pages that already exist for each of them.
//
// They are real hrefs, so middle-click and cmd-click open the pin's own page.
// A plain click is intercepted instead: navigating for real would remount the
// 3D scene, so it goes through the same select() the markers use, which swaps
// the URL with pushState and leaves the globe alone.
//
// Paging hides rows with CSS rather than dropping them from the render. The
// list exists so that every pin has a crawlable link in the HTML; rendering one
// page of five would take that away again the moment there are six pins.
export default function BuildIndex() {
  const { selectedId, select } = useBuildSelection();
  const [page, setPage] = useState(0);
  const [pagedFor, setPagedFor] = useState(selectedId);

  // Picking a pin on the globe has to reveal its row — the panel is the globe's
  // ledger, and a selection highlighted on a page you cannot see is no ledger.
  //
  // Adjusted during render rather than in an effect: an effect would paint the
  // old page for a frame before correcting it, and React re-runs this pass
  // before committing anything to the DOM.
  if (selectedId !== pagedFor) {
    setPagedFor(selectedId);
    const index = selectedId ? ordered.findIndex((build) => build.id === selectedId) : -1;
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE));
  }

  const start = page * PAGE_SIZE;

  return (
    <>
      <ul className={styles.list} aria-label="Every build on the map">
        {ordered.map((build, index) => {
          const onPage = index >= start && index < start + PAGE_SIZE;

          return (
            <li key={build.id} className={onPage ? undefined : styles.offPage}>
              <a
                className={`${styles.item} ${selectedId === build.id ? styles.itemActive : ''}`}
                href={buildPath(build.id)}
                aria-current={selectedId === build.id ? 'true' : undefined}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  select(build.id);
                }}
              >
                {/* The first photo, where there is one. A pin with a face on it
                    reads as somebody's build rather than a row in a table — which
                    is the whole claim this list is making. */}
                {build.images?.[0] ? (
                  <Image
                    className={styles.thumb}
                    src={build.images[0].src}
                    alt={build.images[0].alt}
                    width={104}
                    height={72}
                  />
                ) : (
                  <span className={styles.thumbEmpty} aria-hidden="true" />
                )}
                <span className={styles.rowText}>
                  <span className={styles.rowHead}>
                    <span className={styles.maker}>{build.maker}</span>
                    {build.kind === 'collaboration' && (
                      <span className={styles.tag}>Collaboration</span>
                    )}
                  </span>
                  <span className={styles.meta}>
                    {build.location.label} · {formatBuildDate(build.date)}
                  </span>
                  <span className={styles.desc}>{build.description}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      {pageCount > 1 && (
        <div className={styles.pager}>
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0}
          >
            Prev
          </button>
          <span className={styles.pagerCount}>
            {pad(page + 1)} / {pad(pageCount)}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            disabled={page === pageCount - 1}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
