'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Globe from './Globe';
import PhotoLightbox from './PhotoLightbox';
import { builds, formatBuildDate, CARD_TILES, STRIP_TILES } from './builds';
import { useBuildSelection } from './useBuildSelection';
import styles from './GlobeViewer.module.css';

// The Inside section's viewer: an interactive globe with the picked build's
// details overlaid on a translucent scrim. Tap a marker (or empty space, or
// the marker again) to open/close.
//
// The selection lives in the app store rather than here, because on mobile the
// viewer is only 44vh — far too little room for photos and a description — so
// the Inside panel renders those as a card instead. See BuildCard.
export default function GlobeViewer() {
  const { selectedId, select: selectBuild } = useBuildSelection();
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [hasSelected, setHasSelected] = useState(false);

  const selectedIndex = useMemo(
    () => builds.findIndex((build) => build.id === selectedId),
    [selectedId],
  );
  const selected = selectedIndex === -1 ? null : builds[selectedIndex];

  // Only the tiles a pin shows the moment it opens are warmed up front (see the
  // preloader below). The rest of a build's photos live in the lightbox and can
  // load when it is opened, which keeps the warm-up flat as pins are added
  // instead of growing with every photo posted.
  const warmTiles = Math.max(STRIP_TILES, CARD_TILES);
  const allImages = useMemo(
    () => builds.flatMap((build) => (build.images ?? []).slice(0, warmTiles)),
    [warmTiles],
  );
  const images = selected?.images;
  // The strip only has room for a few; the rest are reachable through any tile.
  const stripImages = images?.slice(0, STRIP_TILES);
  const galleryOpen = galleryIndex !== null && !!images?.length;

  const select = (id: string | null) => {
    selectBuild(id);
    setGalleryIndex(null);
    if (id) setHasSelected(true);
  };

  // Step to the previous/next build, cycling through the list.
  const step = (delta: number) => {
    if (selectedIndex === -1) return;
    const next = (selectedIndex + delta + builds.length) % builds.length;
    select(builds[next].id);
  };

  return (
    <div className={styles.viewer}>
      {/* Offscreen preloader: fetch each pin's opening tiles (the same optimized
          variant the strip and card use) eagerly the moment the globe mounts, so
          opening a pin shows its photos instantly instead of lazy-loading. Low
          fetch priority so they queue behind the globe itself rather than
          competing with it for bandwidth on first paint. */}
      <div className={styles.preload} aria-hidden>
        {allImages.map((image) => (
          <span key={image.src} className={styles.preloadBox}>
            <Image src={image.src} alt="" fill sizes="280px" loading="eager" fetchPriority="low" />
          </span>
        ))}
      </div>

      <Globe selectedBuildId={selectedId ?? undefined} onSelectBuild={select} />

      {/* Swapped in CSS rather than by measuring the viewport, so the server
          and the client render the same thing. */}
      <div className={`${styles.hint} ${hasSelected ? styles.hintHidden : ''}`}>
        <span className={styles.hintPointer}>Click a marker to explore</span>
        <span className={styles.hintTouch}>Tap a marker to explore</span>
      </div>

      <div
        className={`${styles.overlay} ${selected ? styles.overlayOpen : ''}`}
        aria-hidden={!selected}
        onClick={() => {
          if (selected) select(null);
        }}
      >
        {selected && (
          <>
            {/* Photo strip, pinned to the top edge. */}
            {stripImages && stripImages.length > 0 && (
              <div className={styles.thumbs} onClick={(event) => event.stopPropagation()}>
                {stripImages.map((image, index) => (
                  <button
                    key={image.src}
                    type="button"
                    className={styles.thumb}
                    onClick={() => setGalleryIndex(index)}
                    aria-label={image.alt}
                  >
                    <Image src={image.src} alt="" fill sizes="280px" />
                  </button>
                ))}
              </div>
            )}

            {builds.length > 1 && (
              <>
                <button
                  className={`${styles.arrow} ${styles.arrowPrev}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    step(-1);
                  }}
                  aria-label="Previous build"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 4 7 12l8 8" />
                  </svg>
                </button>
                <button
                  className={`${styles.arrow} ${styles.arrowNext}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    step(1);
                  }}
                  aria-label="Next build"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 4l8 8-8 8" />
                  </svg>
                </button>
              </>
            )}

            {/* The counter row is the anchor for the text group: the name and
                place hang above it and the links below, so the name sits on
                the same line for every build however many links there are. On
                desktop the arrows share its line; on mobile they stay centred
                in the frame while this group moves up out of the way. */}
            <div className={styles.nav}>
              <div className={styles.info}>
                <div>
                  <span className={styles.maker}>{selected.maker}</span>
                </div>
                <div>
                  <span className={styles.meta}>
                    {selected.location.label} · {formatBuildDate(selected.date)}
                  </span>
                </div>
              </div>

              <span className={styles.kicker}>
                {String(selectedIndex + 1).padStart(2, '0')} /{' '}
                {String(builds.length).padStart(2, '0')}
              </span>

              {selected.links && selected.links.length > 0 && (
                <div className={styles.links}>
                  {selected.links.map((link) => (
                    <a
                      key={link.href}
                      className={styles.link}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {link.label} ↗
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Description, centred in the band between the arrows and the
                bottom edge. The inner wrapper is what the band centres — put
                the span in directly and being a grid item would blockify it,
                turning the per-line highlight into one big rectangle. */}
            <div className={styles.detail}>
              <div className={styles.detailInner}>
                <span className={styles.desc}>{selected.description}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {galleryOpen && images && (
        <PhotoLightbox
          images={images}
          index={galleryIndex}
          onIndexChange={setGalleryIndex}
          onClose={() => setGalleryIndex(null)}
        />
      )}
    </div>
  );
}
