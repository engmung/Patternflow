'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import PhotoLightbox from './PhotoLightbox';
import { builds } from './builds';
import { useBuildSelection } from './useBuildSelection';
import styles from './BuildCard.module.css';

// Mobile-only companion to the globe. The viewer is pinned to the top 44vh on
// phones, which leaves no room for photos and a description on top of the map,
// so the picked build's details are rendered down here in the Inside panel
// instead. Hidden entirely on desktop, where the globe overlay does the job.
export default function BuildCard() {
  const { selectedId, select } = useBuildSelection();
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const selectedIndex = useMemo(
    () => builds.findIndex((build) => build.id === selectedId),
    [selectedId],
  );
  const selected = selectedIndex === -1 ? null : builds[selectedIndex];
  const images = selected?.images;

  // Bring the card into view when a pin is tapped — the globe is fixed over
  // the top of the screen, so without this the details land off-screen.
  useEffect(() => {
    if (!selectedId) return;
    const card = cardRef.current;
    if (!card || window.matchMedia('(min-width: 901px)').matches) return;

    const styleOf = getComputedStyle(document.documentElement);
    const viewerHeight = parseFloat(styleOf.getPropertyValue('--mb-viewer-h')) || 0;
    const navHeight = parseFloat(styleOf.getPropertyValue('--mb-nav-h')) || 0;
    // --mb-viewer-h is in vh; --mb-nav-h in px.
    const offset = (window.innerHeight * viewerHeight) / 100 + navHeight + 12;

    window.scrollTo({
      top: card.getBoundingClientRect().top + window.scrollY - offset,
      behavior: 'smooth',
    });
  }, [selectedId]);

  const step = (delta: number) => {
    if (selectedIndex === -1) return;
    const next = (selectedIndex + delta + builds.length) % builds.length;
    select(builds[next].id);
    setGalleryIndex(null);
  };

  return (
    <div className={styles.card} ref={cardRef}>
      {!selected ? (
        <p className={styles.empty}>Tap a marker on the map to see that build.</p>
      ) : (
        <>
          <div className={styles.head}>
            <div className={styles.headText}>
              <strong className={styles.maker}>{selected.maker}</strong>
              <span className={styles.meta}>
                {selected.location.label} · {selected.date}
              </span>
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={() => select(null)}
              aria-label="Clear selection"
            >
              close
            </button>
          </div>

          {selected.links && selected.links.length > 0 && (
            <div className={styles.links}>
              {selected.links.map((link) => (
                <a
                  key={link.href}
                  className={styles.link}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label} ↗
                </a>
              ))}
            </div>
          )}

          {/* A two-tile preview, not the whole set — a taller strip pushed the
              description off-screen, so you could not tell it was there. Any
              tile opens the full run of photos in the lightbox. */}
          {images && images.length > 0 && (
            <div className={styles.photos}>
              {images.map((image, index) => (
                <button
                  key={image.src}
                  type="button"
                  className={styles.photo}
                  onClick={() => setGalleryIndex(index)}
                  aria-label={image.alt}
                >
                  <Image src={image.src} alt="" fill sizes="45vw" />
                  {index === 1 && images.length > 2 && (
                    <span className={styles.more}>+{images.length - 2}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <p className={styles.desc}>{selected.description}</p>

          {builds.length > 1 && (
            <div className={styles.pager}>
              <button type="button" onClick={() => step(-1)} aria-label="Previous build">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 4 7 12l8 8" />
                </svg>
              </button>
              <span className={styles.counter}>
                {String(selectedIndex + 1).padStart(2, '0')} /{' '}
                {String(builds.length).padStart(2, '0')}
              </span>
              <button type="button" onClick={() => step(1)} aria-label="Next build">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 4l8 8-8 8" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}

      {galleryIndex !== null && images && images.length > 0 && (
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
