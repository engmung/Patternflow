"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { renderPatternThumb } from "@/lib/community/thumbs";
import { knobSetupFromCode } from "@/lib/community/knobs";
import SandboxPreview from "@/components/community/SandboxPreview";
import styles from "./Community.module.css";

// One feed card. Fixed height with ZERO layout shift on hover.
// Dynamically appends modified knob values to the detail link query string (?k=...)
// so clicking the card opens the detail page with those exact custom knob settings!

export type PatternCardItem = {
  id: string;
  title: string;
  code: string;
  parentId: string | null;
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
};

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function PatternCard({ item }: { item: PatternCardItem }) {
  const knobSetup = knobSetupFromCode(item.code);

  const [thumb, setThumb] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // Hover & Live state
  const [isHovered, setIsHovered] = useState(false);

  // Knob interaction state
  const [knobValues, setKnobValues] = useState<number[]>(knobSetup.values);
  const [activeKnobIdx, setActiveKnobIdx] = useState<number>(0);

  const thumbRef = useRef<HTMLDivElement | null>(null);

  // Initial static thumbnail
  useEffect(() => {
    let alive = true;
    renderPatternThumb(item.code, knobValues).then((result) => {
      if (!alive) return;
      if (result.ok && result.dataUrl) setThumb(result.dataUrl);
      else if (!thumb) setFailed(result.error ?? "Render failed.");
    });
    return () => {
      alive = false;
    };
  }, [item.code, knobValues]);

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // Track mouse X position on thumbnail to select active knob (K1..K4)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!thumbRef.current) return;
    const rect = thumbRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = x / rect.width;
    const idx = Math.min(3, Math.floor(ratio * 4));
    setActiveKnobIdx(idx);
  };

  // Mouse wheel adjusts active knob value
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();

    const [min, max] = knobSetup.ranges[activeKnobIdx] ?? [0, 1];
    const span = Math.max(0.001, max - min);
    const step = span / 25;
    const direction = e.deltaY < 0 ? 1 : -1;

    setKnobValues((prev) => {
      const next = [...prev];
      const current = next[activeKnobIdx] ?? min;
      const updated = Math.max(min, Math.min(max, current + direction * step));
      next[activeKnobIdx] = Number(updated.toFixed(3));
      return next;
    });
  };

  const activeLabel = knobSetup.labels[activeKnobIdx] ?? `Knob ${activeKnobIdx + 1}`;
  const activeValue = knobValues[activeKnobIdx] ?? 0;
  const [activeMin, activeMax] = knobSetup.ranges[activeKnobIdx] ?? [0, 1];
  const activeNorm = (activeValue - activeMin) / Math.max(0.001, activeMax - activeMin);

  // Dynamic detail page URL query carrying modified knob values
  const detailUrl = `/community/p/${item.id}?k=${knobValues.join(",")}`;

  return (
    <Link
      href={detailUrl}
      className={styles.card}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 1:2 Vertical Matrix Display Screen */}
      <div
        ref={thumbRef}
        className={styles.cardThumb}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
      >
        <div className={styles.screenRotator}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={`${item.title} preview`} />
          ) : (
            <div className={styles.cardThumbNote}>{failed ? "render error" : "rendering…"}</div>
          )}

          {/* Pre-warmed Live Sandbox Preview (0ms instant playback on hover) */}
          <SandboxPreview
            code={item.code}
            knobValues={knobValues}
            knobRanges={knobSetup.ranges}
            running={isHovered}
            className={styles.cardHoverIframe}
          />
        </div>

        {/* Sleek Bottom Overlay Knob Control Bar (2 Stacked Lines, Spacious Track Bar) */}
        <div
          className={styles.bottomKnobOverlay}
          style={{
            opacity: isHovered ? 1 : 0,
            pointerEvents: isHovered ? "auto" : "none",
          }}
        >
          {/* Line 1: K1 ~ K4 Zone Buttons */}
          <div className={styles.knobZoneBarInMeta}>
            {knobSetup.labels.map((label, idx) => (
              <div
                key={idx}
                className={`${styles.knobSegmentInMeta} ${
                  idx === activeKnobIdx ? styles.activeKnobSegment : ""
                }`}
                title={`${label}: ${knobValues[idx] ?? 0}`}
              >
                <span>K{idx + 1}</span>
              </div>
            ))}
          </div>

          {/* Line 2: Knob Name, Value, and Spacious Full Track Bar */}
          <div className={styles.metaKnobStatus}>
            <div className={styles.metaKnobInfoRow}>
              <span className={styles.metaKnobLabel}>
                K{activeKnobIdx + 1} {activeLabel.slice(0, 8)}
              </span>
              <strong className={styles.metaKnobVal}>{activeValue}</strong>
            </div>
            <div className={styles.metaKnobTrack}>
              <div
                className={styles.metaKnobFill}
                style={{ width: `${Math.round(activeNorm * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card Footer / Meta Section (Fixed height, 100% stationary) */}
      <div className={styles.cardMeta}>
        <div className={styles.cardTitle}>
          <span className={styles.cardTitleText}>{item.title}</span>
          {item.parentId && <span className={styles.forkChip}>fork</span>}
        </div>

        <div className={styles.cardByline}>
          <span className={styles.userLink}>
            @{item.displayUsername ?? item.username ?? "unknown"}
          </span>
          <span className={styles.cardDate}>{formatDate(item.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}
