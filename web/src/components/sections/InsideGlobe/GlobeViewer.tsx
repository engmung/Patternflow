'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Globe from './Globe';
import PhotoLightbox from './PhotoLightbox';
import { builds } from './builds';
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

  // Every build photo across all pins — warmed up front (see preloader below).
  const allImages = useMemo(() => builds.flatMap((build) => build.images ?? []), []);
  const images = selected?.images;
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
      {/* Offscreen preloader: fetch every pin's thumbnail (the same 160px
          optimized variant the card uses) eagerly the moment the globe mounts,
          so opening a pin shows its photos instantly instead of lazy-loading. */}
      <div className={styles.preload} aria-hidden>
        {allImages.map((image) => (
          <span key={image.src} className={styles.preloadBox}>
            <Image src={image.src} alt="" fill sizes="280px" loading="eager" />
          </span>
        ))}
      </div>

      <Globe selectedBuildId={selectedId ?? undefined} onSelectBuild={select} />

      <div className={`${styles.hint} ${hasSelected ? styles.hintHidden : ''}`}>
        Click a marker to explore
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
            {images && images.length > 0 && (
              <div className={styles.thumbs} onClick={(event) => event.stopPropagation()}>
                {images.map((image, index) => (
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
                    {selected.location.label} · {selected.date}
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

            {/* Description, pinned to the bottom edge. Wrapper keeps the span
                inline, so the highlight hugs each wrapped line instead of
                becoming one big rectangle. */}
            <div className={styles.detail}>
              <span className={styles.desc}>{selected.description}</span>
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
