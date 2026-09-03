"use client";

import Link from "next/link";
import PatternCanvas from "./PatternCanvas";
import styles from "./Community.module.css";

// One deck in a listing: a panel — one of the few raised surfaces in the dark
// room — carrying a strip of its first patterns in running order, because the
// order is the work. Static thumbnails only: a page of decks with a live
// sandbox per slot would be dozens of iframes.

import type { DeckCardItem } from "@/lib/community/cardTypes";
export type { DeckCardItem };

/** Cells in the strip — four patterns and an overflow count. */
const STRIP_CELLS = 5;

export default function DeckCard({ deck }: { deck: DeckCardItem }) {
  const shown = deck.preview.slice(0, STRIP_CELLS - 1);
  const more = deck.patternCount - shown.length;
  // The strip is always five cells wide so every deck card is the same height
  // and the grid stays a grid. A short deck fills the rest with empty wells —
  // which is the truth about it: fewer slots, not a broken layout.
  const blanks = Math.max(0, STRIP_CELLS - shown.length - (more > 0 ? 1 : 0));

  return (
    <Link href={`/community/d/${deck.id}`} className={styles.deckCard}>
      <div className={styles.deckStrip}>
        {shown.map((pattern) => (
          <PatternCanvas
            key={pattern.id}
            code={pattern.code}
            title={pattern.title}
            className={styles.deckStripSlot}
          />
        ))}
        {shown.length === 0 && <div className={styles.deckStripEmpty}>empty</div>}
        {/* Sits a shade above the lit wells: it is a count, not a pattern. */}
        {more > 0 && <span className={styles.deckStripMore}>+{more}</span>}
        {shown.length > 0 &&
          Array.from({ length: blanks }, (_, index) => (
            <span key={`blank-${index}`} className={styles.deckStripBlank} aria-hidden="true" />
          ))}
      </div>

      <div className={styles.deckCardMeta}>
        <span className={styles.deckCardTitleRow}>
          <span className={styles.deckCardTitle}>{deck.title}</span>
          <span className={styles.deckCardSlots}>
            {deck.patternCount} slot{deck.patternCount === 1 ? "" : "s"}
          </span>
          {deck.visibility !== "public" && (
            <span className={styles.visChip}>{deck.visibility}</span>
          )}
          <span className={styles.deckCardUser}>
            @{deck.displayUsername ?? deck.username ?? "unknown"}
          </span>
        </span>

        {deck.description && <span className={styles.deckCardDesc}>{deck.description}</span>}

        <span className={styles.deckCardStats}>{deck.createdAt.slice(0, 10)}</span>
      </div>
    </Link>
  );
}
