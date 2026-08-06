"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A textarea that is as tall as what is in it.
 *
 * A fixed-height box is fine for composing — you start empty and it fills up —
 * and wrong for editing, where the text already exists and the box shows you
 * eight lines of forty. Dragging the resize handle every time you hit Edit is
 * not a feature.
 *
 * Growth is bounded by whatever `max-height` the stylesheet sets: scrollHeight
 * keeps reporting the full content height, the inline height loses to
 * max-height, and the textarea scrolls from there. So the cap is a CSS
 * decision, per context — an inline editor can take the page, a modal cannot.
 *
 * useLayoutEffect rather than useEffect: the height is measured and applied
 * before paint, so opening an editor does not flash at 180px and then jump.
 */
export function useAutoGrow<T extends HTMLTextAreaElement>(value: string) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Collapse first: scrollHeight can only report content TALLER than the
    // current box, so without this the textarea would ratchet upward and never
    // shrink when text is deleted.
    el.style.height = "auto";

    // scrollHeight is content + padding and stops there — no borders. Assigning
    // it straight to a border-box height therefore lands two pixels short of
    // the text, which shows up as a textarea that is permanently scrolled by
    // its own border and clips the last line. Measured, not guessed.
    const style = getComputedStyle(el);
    const height =
      style.boxSizing === "border-box"
        ? el.scrollHeight + (el.offsetHeight - el.clientHeight)
        : el.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    el.style.height = `${height}px`;
  }, [value]);

  return ref;
}
