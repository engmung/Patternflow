'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import Globe from './Globe';
import { builds } from './builds';
import gallery from '../InsidePanel.module.css';
import styles from './GlobeViewer.module.css';

// The Inside section's left viewer: an interactive globe with the picked
// build's details overlaid on a translucent scrim. Tap a marker (or the X)
// to open/close; tapping empty space or the marker again clears it.
export default function GlobeViewer() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [hasSelected, setHasSelected] = useState(false);

  const selected = useMemo(
    () => builds.find((build) => build.id === selectedId) ?? null,
    [selectedId],
  );
  const images = selected?.images;
  const galleryOpen = galleryIndex !== null && !!images?.length;

  const select = (id: string | null) => {
    setSelectedId(id);
    setGalleryIndex(null);
    if (id) setHasSelected(true);
  };

  // Step to the previous/next build, cycling through the list.
  const step = (delta: number) => {
    const index = builds.findIndex((build) => build.id === selectedId);
    if (index === -1) return;
    const next = (index + delta + builds.length) % builds.length;
    select(builds[next].id);
  };

  useEffect(() => {
    if (!galleryOpen || !images) return;
    const count = images.length;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGalleryIndex(null);
      else if (event.key === 'ArrowRight') setGalleryIndex((i) => (i === null ? i : (i + 1) % count));
      else if (event.key === 'ArrowLeft') setGalleryIndex((i) => (i === null ? i : (i - 1 + count) % count));
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [galleryOpen, images]);

  return (
    <div className={styles.viewer}>
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
            <div className={styles.card}>
              <div>
                <span className={styles.maker}>{selected.maker}</span>
              </div>
              <div>
                <span className={styles.meta}>
                  {selected.location.label} · {selected.date}
                </span>
              </div>
              <div>
                <span className={styles.desc}>{selected.description}</span>
              </div>
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
                      <Image src={image.src} alt="" fill sizes="160px" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {galleryOpen && images && typeof document !== 'undefined' &&
        createPortal(
          <div
            className={gallery.gallery}
            role="dialog"
            aria-modal="true"
            aria-label="Build photos"
            onClick={() => setGalleryIndex(null)}
          >
            <button
              className={gallery.galleryClose}
              type="button"
              aria-label="Close gallery"
              onClick={() => setGalleryIndex(null)}
            >
              close
            </button>
            <div className={gallery.galleryStage} onClick={(event) => event.stopPropagation()}>
              <div className={gallery.galleryFrame}>
                {images.length > 1 && (
                  <button
                    type="button"
                    className={gallery.galleryNav}
                    aria-label="Previous photo"
                    onClick={() =>
                      setGalleryIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length))
                    }
                  >
                    ‹
                  </button>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={gallery.galleryMain}
                  src={images[galleryIndex].src}
                  alt={images[galleryIndex].alt}
                />
                {images.length > 1 && (
                  <button
                    type="button"
                    className={gallery.galleryNav}
                    aria-label="Next photo"
                    onClick={() =>
                      setGalleryIndex((i) => (i === null ? i : (i + 1) % images.length))
                    }
                  >
                    ›
                  </button>
                )}
              </div>
              {images.length > 1 && (
                <div className={gallery.galleryThumbs}>
                  {images.map((image, index) => (
                    <button
                      key={image.src}
                      type="button"
                      className={`${gallery.galleryThumb} ${index === galleryIndex ? gallery.galleryThumbActive : ''}`}
                      onClick={() => setGalleryIndex(index)}
                      aria-label={image.alt}
                      aria-current={index === galleryIndex}
                    >
                      <Image src={image.src} alt="" fill sizes="42px" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
