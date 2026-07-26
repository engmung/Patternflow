'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import type { BuildImage } from './builds';
import gallery from './PhotoLightbox.module.css';

interface PhotoLightboxProps {
  images: BuildImage[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}

// Full-screen photo viewer for a build's images. Shared by the globe overlay
// and the Inside panel's mobile build card.
export default function PhotoLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: PhotoLightboxProps) {
  const count = images.length;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') onIndexChange((index + 1) % count);
      else if (event.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [index, count, onClose, onIndexChange]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={gallery.gallery}
      role="dialog"
      aria-modal="true"
      aria-label="Build photos"
      onClick={onClose}
    >
      <button className={gallery.galleryClose} type="button" aria-label="Close gallery" onClick={onClose}>
        close
      </button>
      {/* No stopPropagation on the stage itself — only the photo, the arrows
          and the thumbnails swallow the click, so clicking the space around
          them closes the popup. */}
      <div className={gallery.galleryStage}>
        <div className={gallery.galleryFrame}>
          {count > 1 && (
            <button
              type="button"
              className={gallery.galleryNav}
              aria-label="Previous photo"
              onClick={(event) => {
                event.stopPropagation();
                onIndexChange((index - 1 + count) % count);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 4 7 12l8 8" />
              </svg>
            </button>
          )}
          {/* The source photos are phone-camera originals — several megabytes
              each — so this goes through the optimizer rather than serving the
              file as-is. The nominal width/height only give it a ratio to work
              with: the CSS sets both back to auto, so the real one takes over
              once it loads. `sizes` stays plain viewport widths — a min() there
              parses as CSS, but the browser ignores it when picking from the
              srcset and quietly falls back to the largest variant there is. */}
          <Image
            className={gallery.galleryMain}
            src={images[index].src}
            alt={images[index].alt}
            width={1600}
            height={1200}
            sizes="(max-width: 640px) 94vw, 92vw"
            priority
            onClick={(event) => event.stopPropagation()}
          />
          {count > 1 && (
            <button
              type="button"
              className={gallery.galleryNav}
              aria-label="Next photo"
              onClick={(event) => {
                event.stopPropagation();
                onIndexChange((index + 1) % count);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 4l8 8-8 8" />
              </svg>
            </button>
          )}
        </div>
        {count > 1 && (
          <div className={gallery.galleryThumbs} onClick={(event) => event.stopPropagation()}>
            {images.map((image, thumbIndex) => (
              <button
                key={image.src}
                type="button"
                className={`${gallery.galleryThumb} ${thumbIndex === index ? gallery.galleryThumbActive : ''}`}
                onClick={() => onIndexChange(thumbIndex)}
                aria-label={image.alt}
                aria-current={thumbIndex === index}
              >
                <Image src={image.src} alt="" fill sizes="42px" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
