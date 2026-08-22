"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { authClient } from "@/lib/community/auth-client";
import AuthModal from "@/components/community/AuthModal";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { renderPatternThumb } from "@/lib/community/thumbs";
import { knobSetupFromCode } from "@/lib/community/knobs";
import {
  describeMatrixShape,
  formatMatrix,
  isStockPanelFrame,
  matrixFromCode,
} from "@/lib/patternMatrix";
import SandboxPreview from "@/components/community/SandboxPreview";
import { buildsConfigured, communityApiUrl, COMMUNITY_FETCH_INIT } from "@/lib/community/apiBase";
import {
  COLLECTION_EVENT,
  DECK_DRAG_TYPE,
  collectPattern,
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
  /** "public" | "private" — a chip appears when private,
   *  which only ever happens on the owner's own profile. */
  visibility: string;
  /** Distinct other people whose public decks carry this pattern. */
  deckCount: number;
  /** Whether the signed-in viewer already liked it — lights the card heart.
   *  Optional: surfaces that don't compute it get a heart that assumes no. */
  viewerLiked?: boolean;
};

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

// The card's two corner controls draw their marks as SVG rather than as text.
// A glyph is positioned by its font's metrics — ♥ and + carry different
// ascents and sit at different heights inside an identical box, which is
// exactly the misalignment this pair had — while a viewBox is centred by
// geometry and stays centred in any font, at any size, at any DPI.
const ICON = { viewBox: "0 0 16 16", width: 15, height: 15 } as const;

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg {...ICON} aria-hidden="true" focusable="false">
      <path
        d="M8 13.55 3.05 8.6a3.05 3.05 0 0 1 4.31-4.31L8 4.93l.64-.64a3.05 3.05 0 0 1 4.31 4.31z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusMinusIcon({ minus }: { minus: boolean }) {
  return (
    <svg {...ICON} aria-hidden="true" focusable="false">
      <path
        d={minus ? "M3.6 8h8.8" : "M3.6 8h8.8M8 3.6v8.8"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** How long ago, but only while that is still news.
 *
 *  The wall is newest-first, so an age chip on every card would just be a
 *  gradient nobody reads. Past five days the date in the byline says it
 *  better, and the chip comes off. */
const FRESH_MS = 5 * 24 * 60 * 60 * 1000;

/** The age label has no external store behind it — it is read straight off the
 *  clock — so there is nothing to subscribe to. */
const NO_SUBSCRIPTION = () => () => {};

export function freshAge(iso: string, now: number = Date.now()): string | null {
  const age = now - new Date(iso).getTime();
  if (!Number.isFinite(age) || age < 0 || age > FRESH_MS) return null;
  const hours = Math.floor(age / 3_600_000);
  if (hours < 1) return "new";
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}


/** The deck needs a pattern's firmware header, which a card does not carry. */
async function fetchPatternHeader(patternId: string) {
  const response = await fetch(
    communityApiUrl(`/api/community/patterns/${patternId}/header`),
    COMMUNITY_FETCH_INIT,
  );
  return (await response.json()) as { codeCpp?: string; error?: string };
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

  // "2 h" belongs to the browser's clock, not the server's — they are
  // separated by however long the response spent in flight, and a card that
  // says "1 h" on one side and "2 h" on the other is a hydration mismatch.
  // The server snapshot is null, so the first paint simply has no chip and the
  // client fills it in. (Nothing to subscribe to: the value is read from
  // Date.now() on each render, and equal strings compare equal, so React only
  // re-renders when the label actually changes.)
  const age = useSyncExternalStore(
    NO_SUBSCRIPTION,
    () => freshAge(item.createdAt),
    () => null,
  );

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
  // Liking straight off the card — the count is public, the act needs a
  // session, and the card must stay one link, so the heart swallows its
  // click and the sign-in modal renders through a portal (a modal inside
  // the <Link> would navigate on backdrop clicks).
  const { data: session } = authClient.useSession();
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const [liked, setLiked] = useState(item.viewerLiked ?? false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const toggleLike = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!session) {
      setAuthOpen(true);
      return;
    }
    if (likeBusy) return;
    const previous = { liked, likeCount };
    setLiked(!liked);
    setLikeCount(likeCount + (liked ? -1 : 1));
    setLikeBusy(true);
    try {
      const response = await fetch(
        communityApiUrl(`/api/community/patterns/${item.id}/like`),
        { method: "POST", ...COMMUNITY_FETCH_INIT },
      );
      if (!response.ok) {
        setLiked(previous.liked);
        setLikeCount(previous.likeCount);
        return;
      }
      const payload = (await response.json()) as { liked: boolean; count: number };
      setLiked(payload.liked);
      setLikeCount(payload.count);
    } catch {
      setLiked(previous.liked);
      setLikeCount(previous.likeCount);
    } finally {
      setLikeBusy(false);
    }
  };

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
    // `code` is the .h the deck builds; `js` is the source this card is
    // already rendering, carried so the dock can draw the slot.
    const added = await collectPattern(
      { patternId: item.id, title: item.title, js: item.code },
      fetchPatternHeader,
    );
    if (!added.ok) setDeckNote(added.reason ?? "Deck is full.");
    setDeckBusy(false);
    window.setTimeout(() => setDeckNote(null), 2500);
  };

  // Dragging a card onto the dock is the same act as pressing its "+", so it
  // carries the same three facts. Only patterns that ship a header can be
  // built, so only those offer themselves — the rest drag as ordinary links.
  const canCollect = buildsConfigured() && item.hasCpp;
  const handleDragStart = (event: React.DragEvent) => {
    if (!canCollect) return;
    event.dataTransfer.setData(
      DECK_DRAG_TYPE,
      JSON.stringify({ patternId: item.id, title: item.title, js: item.code }),
    );
    event.dataTransfer.effectAllowed = "copy";
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

  // The live sandbox iframe exists only while the card is anywhere near the
  // viewport. An infinite feed accumulates hundreds of cards, and an iframe
  // is a whole document with a canvas — warming all of them would be
  // hundreds of live frames. Two thresholds with a wide gap between them:
  // approach and the iframe boots (cheap — the sandbox document is
  // immutable-cached); fall far enough behind and it is torn down. The gap is
  // hysteresis, so a card at the boundary does not flap while you scroll past
  // it. A phone keeps a shorter tail: its cards are a third the size, so the
  // desktop's two-and-a-bit screens of slack would be thirty live documents
  // on the device least able to hold them.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    if (!interactive) return; // a phone never plays, so it never boots one
    const el = thumbRef.current;
    if (!el) return;
    const warmObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setWarm(true);
      },
      { rootMargin: "300px 0px" },
    );
    const coolObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => !entry.isIntersecting)) setWarm(false);
      },
      { rootMargin: interactive ? "2400px 0px" : "900px 0px" },
    );
    warmObserver.observe(el);
    coolObserver.observe(el);
    return () => {
      warmObserver.disconnect();
      coolObserver.disconnect();
    };
  }, [interactive]);

  // ── Playing ──
  // Desktop plays on hover: one card at a time, the cursor says which, and
  // because it is asked for it overrides a reduced-motion preference.
  //
  // A phone does not play at all. The wall used to run every card that was on
  // screen — nine to twelve sandboxes at 375x812 — which is nine to twelve
  // whole documents rendering 60fps canvases on the device least able to
  // afford it, and it dropped frames while scrolling. The still is the card
  // there; tapping through to the pattern is where it moves.
  const playing = interactive && isHovered;

  // The still. Rendered once on arrival, and again with the knobs where the
  // cursor left them — not on every wheel tick: while the card plays, the
  // live preview covers the still, so a render per tick was a hundred queued
  // jobs nobody would ever see, each holding the shared iframe for up to five
  // seconds while every other card waited. A request that is overtaken
  // (scrolled away, or superseded before it was drawn) is withdrawn.
  useEffect(() => {
    if (playing) return;
    const controller = new AbortController();
    renderPatternThumb(item.code, knobValues, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok && result.dataUrl) {
        lastThumbRef.current = result.dataUrl;
        setThumb(result.dataUrl);
      } else if (!lastThumbRef.current && result.error !== "Cancelled.") {
        // Keep showing the last good frame if a later re-render fails.
        setFailed(result.error ?? "Render failed.");
      }
    });
    return () => controller.abort();
  }, [item.code, knobValues, playing]);

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

  // The knob overlay only exists while the cursor is on the canvas. When it is
  // not showing there is nothing to dodge, so the deck button stays where the
  // design puts it — bottom-right, the same corner every time. It moves only
  // for the one case the dodge was built for: the overlay sitting on top of it.
  // (Previously it dodged off a state the overlay wasn't even using yet, so it
  // opened at top-right — under the new age chip — and hopped corners as the
  // cursor crossed the middle.)
  const overlayShowing = interactive && isHovered && isScreenHovered;
  const deckBtnEdge = overlayShowing && overlayPos === "bottom" ? styles.deckTop : styles.deckBottom;
  const deckNoteEdge =
    overlayShowing && overlayPos === "bottom" ? styles.deckNoteTop : styles.deckNoteBottom;

  return (
    <>
    <Link
      ref={rootRef}
      href={detailUrl}
      // The detail page is force-dynamic, so a prefetch buys nothing that
      // survives to the click — and the href changes on every wheel tick
      // (the knob values ride in it), so each tick registered a fresh
      // prefetch, and every card entering the viewport another: hundreds of
      // server renders of the community layout for a feed that was only
      // being scrolled. The Pi serving it did not enjoy that.
      prefetch={false}
      className={styles.card}
      onMouseEnter={interactive ? handleCardMouseEnter : undefined}
      onMouseLeave={interactive ? handleCardMouseLeave : undefined}
      onDragStart={handleDragStart}
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
        {/* Badges live ON the canvas now: the card has no border and no
            panel, so there is no furniture left to hang them from — and
            "flashable" is a fact about the pattern, not about its caption. */}
        {item.hasCpp && (
          <span
            className={styles.cardHwBadge}
            title="Hardware ready — ships a .h firmware header"
          >
            .h
          </span>
        )}
        {age && <span className={styles.ageChip}>{age}</span>}

        <div className={rotateThumb ? styles.screenRotator : styles.screenUpright}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={`${item.title} preview`} />
          ) : (
            <div className={styles.cardThumbNote}>{failed ? "render error" : "rendering…"}</div>
          )}

          {/* Live sandbox, booted while the card is near the viewport so a
              hover plays instantly rather than after a document load. Desktop
              only: on a phone the card is the still. */}
          {interactive && warm && (
            <SandboxPreview
              code={item.code}
              knobValues={knobValues}
              knobRanges={knobSetup.ranges}
              running={playing}
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
            className={`${styles.cardDeckBtn} ${deckBtnEdge} ${
              inDeck ? styles.cardDeckBtnOn : ""
            }`}
            title={inDeck ? "In your deck — click to remove" : "Add to your deck"}
            aria-label={inDeck ? "Remove from your deck" : "Add to your deck"}
            onClick={(event) => void toggleDeck(event)}
          >
            {deckBusy ? <span className={styles.cardBtnBusy} /> : <PlusMinusIcon minus={inDeck} />}
          </button>
        )}

        {/* The heart lives beside the deck button (same dodging edge) so both
            card actions read as one cluster; when there is no deck button it
            takes the corner itself. */}
        <button
          type="button"
          className={`${styles.cardDeckBtn} ${
            buildsConfigured() && item.hasCpp ? styles.cardLikeBtnBeside : ""
          } ${deckBtnEdge} ${liked ? styles.cardLikeBtnOn : ""}`}
          title={liked ? "Liked — click to unlike" : "Like this pattern"}
          aria-pressed={liked}
          aria-label={liked ? "Unlike this pattern" : "Like this pattern"}
          onClick={(event) => void toggleLike(event)}
        >
          <HeartIcon filled={liked} />
        </button>
        {deckNote && (
          <span
            className={`${styles.cardDeckNote} ${deckNoteEdge}`}
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

      {/* Caption, under the canvas — no panel, no border. Title on one line,
          handle and counts on the next. */}
      <div className={styles.cardMeta}>
        <div className={styles.cardTitle}>
          <span className={styles.cardTitleText}>{item.title}</span>
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
          {/* Only worth the space when it isn't the stock panel in either
              orientation — that is the assumption a reader already has, and
              nearly every pattern here is composed portrait. */}
          {!isStockPanelFrame(cardMatrix) && (
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
          {/* The count mirrors the heart on the thumbnail, so a like lands in
              both places without a refresh. */}
          <span className={styles.cardStats}>
            {likeCount > 0 && (
              <span title={`${likeCount} likes`}>
                LIK {String(likeCount).padStart(2, "0")}
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
            {/* The age chip on the canvas covers anything recent, so the date
                only earns its place once the chip has gone. */}
            {!age && <span className={styles.cardDate}>{formatDate(item.createdAt)}</span>}
          </span>
        </div>
      </div>
    </Link>
      {authOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <AuthModal onClose={() => setAuthOpen(false)} />,
          document.body,
        )}
    </>
  );
}
