"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { renderPatternThumb } from "@/lib/community/thumbs";
import styles from "./Community.module.css";

// One feed card. The thumbnail is rendered client-side by the shared sandbox
// queue (no stored images anywhere), then cached per code string.

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
  const [thumb, setThumb] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    renderPatternThumb(item.code).then((result) => {
      if (!alive) return;
      if (result.ok && result.dataUrl) setThumb(result.dataUrl);
      else setFailed(result.error ?? "Render failed.");
    });
    return () => {
      alive = false;
    };
  }, [item.code]);

  return (
    <Link href={`/community/p/${item.id}`} className={styles.card}>
      <div className={styles.cardThumb}>
        {thumb ? (
          // Data-URL png rendered by the sandbox — next/image adds nothing here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={`${item.title} preview`} />
        ) : (
          <div className={styles.cardThumbNote}>{failed ? "render error" : "rendering…"}</div>
        )}
      </div>
      <div className={styles.cardMeta}>
        <div className={styles.cardTitle}>
          <span>{item.title}</span>
          {item.parentId && <span className={styles.forkChip}>fork</span>}
        </div>
        <div className={styles.cardByline}>
          {item.displayUsername ?? item.username ?? "unknown"} · {formatDate(item.createdAt)}
        </div>
      </div>
    </Link>
  );
}
