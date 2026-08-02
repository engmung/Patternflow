"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { renderPatternThumb } from "@/lib/community/thumbs";
import { knobSetupFromCode } from "@/lib/community/knobs";
import {
  DEFAULT_MATRIX,
  describeMatrixShape,
  formatMatrix,
  matrixFromCode,
  matrixesEqual,
} from "@/lib/patternMatrix";
import SandboxPreview from "@/components/community/SandboxPreview";
import { buildsConfigured, communityApiUrl, COMMUNITY_FETCH_INIT } from "@/lib/community/apiBase";
import {
  COLLECTION_EVENT,
  deckAdd,
  deckHas,
  deckRemove,
} from "@/lib/community/deck";
import styles from "./Community.module.css";

// One feed card.
// 1. Live 60fps pattern plays continuously while hovering anywhere on the card.
// 2. Knob overlay appears only while cursor is directly over the matrix screen (with top/bottom dodging).
// 3. Moving cursor over the card title/footer completely hides the knob overlay for a 100% clean view of the live pattern!

export type PatternCardItem = {
  id: string;
  title: string;
  code: string;
  parentId: string | null;
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
  likeCount: number;
  forkCount: number;
  /** Ships a verified firmware header — flashable as-is. */
  hasCpp: boolean;
  /** "public" | "unlisted" | "private" — a chip appears when not public,
   *  which only ever happens on the owner's own profile. */
  visibility: string;
  /** Distinct other people whose public decks carry this pattern. */
  deckCount: number;
};

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function PatternCard({
  item,
  // false = static thumbnail card (mobile): no live sandbox iframe, no knob
  // overlay — hover doesn't exist there, and dozens of iframes cost real
  // battery. The card is just a tappable preview linking to the detail page.
  interactive = true,
}: {
  item: PatternCardItem;
  interactive?: boolean;
}) {
  const knobSetup = knobSetupFromCode(item.code);
  // These cards show the pattern as it looks on a device standing upright, so
  // a landscape pattern gets turned a quarter-turn. One composed for a portrait
  // frame is already upright and must be left alone.
  const cardMatrix = matrixFromCode(item.code);
  const rotateThumb = describeMatrixShape(cardMatrix) === "landscape";

  const [thumb, setThumb] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // Hover & Live state
  const [isHovered, setIsHovered] = useState(false);
  const [isScreenHovered, setIsScreenHovered] = useState(false);
  const [overlayPos, setOverlayPos] = useState<"bottom" | "top">("bottom");

  // Knob interaction state
  const [knobValues, setKnobValues] = useState<number[]>(knobSetup.values);
  const [activeKnobIdx, setActiveKnobIdx] = useState<number>(0);

  // Deck membership, kept in step with every other deck surface on the page.
  const [inDeck, setInDeck] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [deckNote, setDeckNote] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setInDeck(deckHas(item.id));
    sync();
    window.addEventListener(COLLECTION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(COLLECTION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [item.id]);

  // The deck holds the .h, which the feed does not carry — a header can be
  // 200 KB and most cards are never added. Fetch it on the press instead.
  const toggleDeck = async (event: React.MouseEvent) => {
    // The whole card is a link to the detail page.
    event.preventDefault();
    event.stopPropagation();
    if (deckBusy) return;
    if (inDeck) {
      deckRemove(item.id);
      return;
    }
    setDeckBusy(true);
    setDeckNote(null);
    try {
      const response = await fetch(
        communityApiUrl(`/api/community/patterns/${item.id}/header`),
        COMMUNITY_FETCH_INIT,
      );
      const payload = (await response.json()) as { codeCpp?: string; error?: string };
      if (!response.ok || !payload.codeCpp) {
        setDeckNote(payload.error ?? "Could not read the header.");
        return;
      }
      const added = deckAdd({ patternId: item.id, title: item.title, code: payload.codeCpp });
      if (!added.ok) setDeckNote(added.reason ?? "Deck is full.");
    } catch {
      setDeckNote("Network error.");
    } finally {
      setDeckBusy(false);
      window.setTimeout(() => setDeckNote(null), 2500);
    }
  };

  const thumbRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLAnchorElement | null>(null);
  // Mirrors `thumb` so the effect can ask "do we already have one?" without
  // depending on it — depending on the state would restart the render whenever
  // a thumbnail arrives, and reading it from the closure would read a stale one.
  const lastThumbRef = useRef<string | null>(null);

  // A card is a dead zone for page scroll: the wheel belongs to the knobs
  // there, and a feed that lurches while you are mid-turn is unusable. Scroll
  // the page from the gaps between cards. Native and non-passive, because
  // preventDefault is the whole point; Ctrl+wheel still passes through — that
  // is the wall's resize gesture, handled above the card.
  useEffect(() => {
    if (!interactive) return;
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [interactive]);

  // The live sandbox iframe mounts only once the card has been near the
  // viewport, and stays mounted after. An infinite feed accumulates hundreds
  // of cards; pre-warming every one of them would be hundreds of iframes.
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    if (!interactive || nearViewport) return;
    const el = thumbRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNearViewport(true);
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [interactive, nearViewport]);

  // Initial static thumbnail
  useEffect(() => {
    let alive = true;
    renderPatternThumb(item.code, knobValues).then((result) => {
      if (!alive) return;
      if (result.ok && result.dataUrl) {
        lastThumbRef.current = result.dataUrl;
        setThumb(result.dataUrl);
      } else if (!lastThumbRef.current) {
        // Keep showing the last good frame if a later re-render fails.
        setFailed(result.error ?? "Render failed.");
      }
    });
    return () => {
      alive = false;
    };
  }, [item.code, knobValues]);

  const handleCardMouseEnter = () => {
    setIsHovered(true);
  };

  const handleCardMouseLeave = () => {
    setIsHovered(false);
    setIsScreenHovered(false);
    setOverlayPos("bottom");
  };

  const handleThumbMouseEnter = () => {
    setIsScreenHovered(true);
  };

  const handleThumbMouseLeave = () => {
    setIsScreenHovered(false);
  };

  // Track mouse X position (for knob selection K1..K4) & Y position (for dynamic dodging top/bottom)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!thumbRef.current) return;
    const rect = thumbRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    // Select active knob (0..3) based on X quadrant
    const xRatio = x / rect.width;
    const idx = Math.min(3, Math.floor(xRatio * 4));
    setActiveKnobIdx(idx);

    // Dynamic dodging: move overlay to top if cursor is on bottom half of screen, and vice versa
    const yRatio = y / rect.height;
    if (yRatio > 0.55) {
      setOverlayPos("top");
    } else if (yRatio < 0.45) {
      setOverlayPos("bottom");
    }
  };

  // Mouse wheel adjusts active knob value. With Ctrl held it is the feed's
  // zoom gesture instead — let it bubble to the wall.
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey) return;
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
      ref={rootRef}
      href={detailUrl}
      className={styles.card}
      onMouseEnter={interactive ? handleCardMouseEnter : undefined}
      onMouseLeave={interactive ? handleCardMouseLeave : undefined}
    >
      {/* 1:2 Vertical Matrix Display Screen */}
      <div
        ref={thumbRef}
        className={styles.cardThumb}
        onMouseEnter={interactive ? handleThumbMouseEnter : undefined}
        onMouseLeave={interactive ? handleThumbMouseLeave : undefined}
        onMouseMove={interactive ? handleMouseMove : undefined}
        onWheel={interactive ? handleWheel : undefined}
      >
        <div className={rotateThumb ? styles.screenRotator : styles.screenUpright}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={`${item.title} preview`} />
          ) : (
            <div className={styles.cardThumbNote}>{failed ? "render error" : "rendering…"}</div>
          )}

          {/* Live sandbox, pre-warmed once the card nears the viewport so the
              first hover still plays instantly. */}
          {interactive && nearViewport && (
            <SandboxPreview
              code={item.code}
              knobValues={knobValues}
              knobRanges={knobSetup.ranges}
              running={isHovered}
              className={styles.cardHoverIframe}
            />
          )}
        </div>

        {/* Straight into the deck, without opening the pattern. Only
            for patterns that ship a header, since that is what the deck
            builds. Sits over the thumbnail's corner so it never reflows the
            card, and swallows the click so the card link does not fire. */}
        {/* Follows the cursor to the half it is in, which is the opposite of
            where the knob overlay dodges to — so the thing you are reaching for
            comes to you and the two never land on top of each other. */}
        {buildsConfigured() && item.hasCpp && (
          <button
            type="button"
            className={`${styles.cardDeckBtn} ${
              overlayPos === "top" ? styles.deckBottom : styles.deckTop
            } ${inDeck ? styles.cardDeckBtnOn : ""}`}
            title={inDeck ? "In your deck — click to remove" : "Add to your deck"}
            aria-label={inDeck ? "Remove from your deck" : "Add to your deck"}
            onClick={(event) => void toggleDeck(event)}
          >
            {deckBusy ? "…" : inDeck ? "−" : "+"}
          </button>
        )}
        {deckNote && (
          <span
            className={`${styles.cardDeckNote} ${
              overlayPos === "top" ? styles.deckNoteBottom : styles.deckNoteTop
            }`}
          >
            {deckNote}
          </span>
        )}

        {/* Dynamic Dodging Knob Overlay Bar (Visible ONLY when cursor is on matrix screen) */}
        {interactive && (
          <div
            className={`${styles.knobOverlay} ${
              overlayPos === "top" ? styles.overlayTop : styles.overlayBottom
            }`}
            style={{
              opacity: isHovered && isScreenHovered ? 1 : 0,
              pointerEvents: isHovered && isScreenHovered ? "auto" : "none",
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
        )}
      </div>

      {/* Card Footer / Meta Section (Clean Shot Mode: hides knob UI when hovered here!) */}
      <div className={styles.cardMeta}>
        <div className={styles.cardTitle}>
          <span className={styles.cardTitleText}>{item.title}</span>
          {item.hasCpp && (
            <span className={styles.hwChip} title="Hardware ready — ships a .h firmware header">
              .h
            </span>
          )}
          {item.visibility !== "public" && (
            <span
              className={styles.visChip}
              title={
                item.visibility === "private"
                  ? "Private — only you can open it"
                  : "Unlisted — off the feed, anyone with the link"
              }
            >
              {item.visibility}
            </span>
          )}
          {item.parentId && <span className={styles.forkChip}>fork</span>}
          {/* Only worth the space when it isn't the stock panel — that is the
              assumption a reader already has. */}
          {!matrixesEqual(cardMatrix, DEFAULT_MATRIX) && (
            <span
              className={styles.frameChip}
              title={`Composed for a ${formatMatrix(cardMatrix)} frame`}
            >
              {formatMatrix(cardMatrix)}
            </span>
          )}
        </div>

        <div className={styles.cardByline}>
          <span className={styles.userLink}>
            @{item.displayUsername ?? item.username ?? "unknown"}
          </span>
          {/* Counts only — liking happens on the detail page, so the card stays
              a single link and its hover/knob interactions are unaffected. */}
          <span className={styles.cardStats}>
            {item.likeCount > 0 && (
              <span title={`${item.likeCount} likes`}>
                LIK {String(item.likeCount).padStart(2, "0")}
              </span>
            )}
            {item.forkCount > 0 && (
              <span title={`Forked ${item.forkCount} times`}>
                FRK {String(item.forkCount).padStart(2, "0")}
              </span>
            )}
            {item.deckCount > 0 && (
              <span title={`In ${item.deckCount} ${item.deckCount === 1 ? "person's" : "people's"} published decks`}>
                DCK {String(item.deckCount).padStart(2, "0")}
              </span>
            )}
            <span className={styles.cardDate}>{formatDate(item.createdAt)}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
