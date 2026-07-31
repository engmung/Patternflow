"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { renderPatternThumb } from "@/lib/community/thumbs";
import { knobSetupFromCode } from "@/lib/community/knobs";
import { describeMatrixShape, matrixFromCode } from "@/lib/patternMatrix";
import styles from "./Community.module.css";

// One deck in a listing: a short strip of its first patterns, in running
// order, because the order is the work. Static thumbnails only — a deck list
// with live sandboxes per slot would be dozens of iframes for one page.

export type DeckCardItem = {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
  patternCount: number;
  /** First few patterns in running order. */
  preview: { id: string; title: string; code: string }[];
};

function StripThumb({ code, title }: { code: string; title: string }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const rotate = describeMatrixShape(matrixFromCode(code)) === "landscape";

  useEffect(() => {
    let alive = true;
    renderPatternThumb(code, knobSetupFromCode(code).values).then((result) => {
      if (alive && result.ok && result.dataUrl) setThumb(result.dataUrl);
    });
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className={styles.deckStripSlot} title={title}>
      <div className={rotate ? styles.screenRotator : styles.screenUpright}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={`${title} preview`} />
        ) : (
          <div className={styles.cardThumbNote}>…</div>
        )}
      </div>
    </div>
  );
}

export default function DeckCard({ deck }: { deck: DeckCardItem }) {
  const shown = deck.preview.slice(0, 3);
  const more = deck.patternCount - shown.length;

  return (
    <Link href={`/community/d/${deck.id}`} className={styles.deckCard}>
      <div className={styles.deckStrip}>
        {shown.map((pattern) => (
          <StripThumb key={pattern.id} code={pattern.code} title={pattern.title} />
        ))}
        {shown.length === 0 && <div className={styles.deckStripEmpty}>empty</div>}
        {more > 0 && <span className={styles.deckStripMore}>+{more}</span>}
      </div>
      <div className={styles.cardMeta}>
        <div className={styles.cardTitle}>
          <span className={styles.cardTitleText}>{deck.title}</span>
          {deck.visibility !== "public" && (
            <span className={styles.visChip}>{deck.visibility}</span>
          )}
        </div>
        <div className={styles.cardByline}>
          <span className={styles.userLink}>
            @{deck.displayUsername ?? deck.username ?? "unknown"}
          </span>
          <span className={styles.cardStats}>
            <span>
              {deck.patternCount} {deck.patternCount === 1 ? "pattern" : "patterns"}
            </span>
            <span className={styles.cardDate}>{deck.createdAt.slice(0, 10)}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
