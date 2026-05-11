"use client";

import { useEffect, useState } from "react";

type LightboxImage = {
  src: string;
  alt: string;
  caption: string;
};

export default function JournalLightbox() {
  const [image, setImage] = useState<LightboxImage | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof HTMLImageElement)) {
        return;
      }

      const figure = target.closest("figure");
      if (
        !figure?.classList.contains("journal-md-figure") &&
        !figure?.classList.contains("journal-hero-cover")
      ) {
        return;
      }

      // Use the original src attribute (not currentSrc) so the lightbox
      // always shows the full-resolution image, even on mobile where
      // Next Image's srcset may have selected a smaller variant.
      const originalSrc = target.getAttribute("src") || target.src;
      setImage({
        src: originalSrc,
        alt: target.alt,
        caption: figure.querySelector("figcaption")?.textContent ?? target.alt,
      });
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (!image) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImage(null);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [image]);

  if (!image) {
    return null;
  }

  return (
    <div
      className="journal-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={image.caption || image.alt || "Expanded image"}
      onClick={() => setImage(null)}
    >
      <button
        className="journal-lightbox-close"
        type="button"
        aria-label="Close image"
        onClick={() => setImage(null)}
      >
        close
      </button>
      <figure onClick={(event) => event.stopPropagation()}>
        <img src={image.src} alt={image.alt} />
        {image.caption && <figcaption>{image.caption}</figcaption>}
      </figure>
    </div>
  );
}
