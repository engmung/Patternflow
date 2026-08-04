"use client";

import { useEffect, useRef, useState } from "react";
import { renderPatternThumb } from "@/lib/community/thumbs";
import { knobSetupFromCode } from "@/lib/community/knobs";
import { describeMatrixShape, matrixFromCode } from "@/lib/patternMatrix";
import SandboxPreview from "./SandboxPreview";
import styles from "./Community.module.css";

// A pattern, rendered into its well — the smallest unit the community is made
// of. The wall card has its own (it also owns knobs, a deck button and a
// dodging overlay); this is the plain one every other surface uses: the
// marquee, deck strips, alert rows.
//
// Two modes. Static paints one frame and stops, which is what a 22×44px chip
// in an alert row wants. `live` boots the sandbox iframe when the canvas comes
// near the viewport and runs it while hovered — a whole document per canvas,
// so it is opt-in and never applied to a list of dozens.

export default function PatternCanvas({
  code,
  title,
  live = false,
  className,
}: {
  code: string;
  title: string;
  /** Play on hover. Costs a sandbox iframe — use it where there are a few. */
  live?: boolean;
  /** The well. Defaults to a filled 1:2 slot. */
  className?: string;
}) {
  const rotate = describeMatrixShape(matrixFromCode(code)) === "landscape";
  const [thumb, setThumb] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [warm, setWarm] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    renderPatternThumb(code, knobSetupFromCode(code).values).then((result) => {
      if (alive && result.ok && result.dataUrl) setThumb(result.dataUrl);
    });
    return () => {
      alive = false;
    };
  }, [code]);

  // Boot the sandbox a little before it is reachable, so the first hover
  // plays instantly rather than showing a blank frame while it loads.
  useEffect(() => {
    if (!live) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setWarm(true);
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [live]);

  return (
    <div
      ref={ref}
      className={className ?? styles.canvasWell}
      onMouseEnter={live ? () => setHovered(true) : undefined}
      onMouseLeave={live ? () => setHovered(false) : undefined}
    >
      <div className={rotate ? styles.screenRotator : styles.screenUpright}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={`${title} preview`} />
        ) : (
          <div className={styles.cardThumbNote} aria-hidden="true" />
        )}
        {live && warm && (
          <SandboxPreview
            code={code}
            knobValues={knobSetupFromCode(code).values}
            knobRanges={knobSetupFromCode(code).ranges}
            running={hovered}
            className={styles.cardHoverIframe}
          />
        )}
      </div>
    </div>
  );
}
