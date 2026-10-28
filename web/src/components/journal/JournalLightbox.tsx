"use client";

import { useEffect, useRef, useState } from "react";

type LightboxImage = {
  src: string;
  alt: string;
  caption: string;
};

// focusVisible is in Chromium and Firefox but not yet in TypeScript's DOM types.
function moveFocus(element: HTMLElement, ring: boolean) {
  const options: FocusOptions & { focusVisible: boolean } = { preventScroll: true, focusVisible: ring };
  element.focus(options);
}

export default function JournalLightbox() {
  const [image, setImage] = useState<LightboxImage | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLImageElement | null>(null);

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
      openerRef.current = target;
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

    // Chromium draws the focus ring wherever a script puts the focus, even
    // after a mouse click. The ring waits for the first Tab.
    let tabbed = false;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImage(null);
      } else if (event.key === "Tab") {
        // The close button is the one thing in the window that takes the
        // focus. A Tab that left it went to the links under the backdrop and
        // scrolled the post away from the picture.
        event.preventDefault();
        const close = closeRef.current;
        if (!close) return;
        // focus() on the focused element changes nothing, ring included.
        if (!tabbed) close.blur();
        tabbed = true;
        moveFocus(close, true);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    if (closeRef.current) moveFocus(closeRef.current, false);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      // Back to the picture, so the next Tab carries on from there. An img
      // takes the focus only with a tabindex.
      const opener = openerRef.current;
      if (opener?.isConnected) {
        if (!opener.hasAttribute("tabindex")) opener.tabIndex = -1;
        moveFocus(opener, tabbed);
      }
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
        ref={closeRef}
        className="journal-lightbox-close"
        type="button"
        aria-label="Close image"
        onClick={() => setImage(null)}
      >
        close
      </button>
      <figure onClick={(event) => event.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- whichever journal image was clicked, at the src it already has */}
        <img src={image.src} alt={image.alt} />
        {image.caption && <figcaption>{image.caption}</figcaption>}
      </figure>
    </div>
  );
}
