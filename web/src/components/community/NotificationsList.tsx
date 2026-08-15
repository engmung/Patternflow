"use client";

import Link from "next/link";
import { useEffect } from "react";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import PatternCanvas from "./PatternCanvas";
import styles from "./Community.module.css";

// The alerts list. Unread rows keep their marker for this visit — the
// mark-read call fires once after mount and nothing re-renders, so what you
// came to see stays highlighted until you leave.

export type NotificationView = {
  id: string;
  type: string;
  targetType: string;
  targetId: string;
  targetTitle: string;
  snippet: string | null;
  unread: boolean;
  createdAt: string; // ISO
  actor: string;
  /** Source of the pattern involved, when there is one, for the row's canvas. */
  patternCode?: string | null;
};

function targetHref(item: NotificationView): string {
  // A thread's real URL carries its territory code, which this row does not
  // know — /community/t/[id] resolves it.
  if (item.targetType === "post") return `/community/t/${item.targetId}`;
  if (item.targetType === "deck") return `/community/d/${item.targetId}`;
  return `/community/p/${item.targetId}`;
}

/** The sentence, minus the actor handle that leads every row. */
function describe(item: NotificationView): string {
  switch (item.type) {
    case "comment":
      return `commented on “${item.targetTitle}”`;
    case "thread":
      return `also commented on “${item.targetTitle}”`;
    case "fork":
      return `published a fork of “${item.targetTitle}”`;
    case "deck":
      return `put “${item.snippet ?? "your pattern"}” in their deck “${item.targetTitle}”`;
    case "port":
      return `added a firmware port to “${item.targetTitle}” — open it to pick or replace`;
    case "pin":
      return `pinned your port of “${item.targetTitle}”`;
    case "performance":
      return `published a performance of “${item.targetTitle}” — open it to pick or replace`;
    case "perf-pin":
      return `pinned your performance of “${item.targetTitle}”`;
    case "territory":
      // The snippet carries where ("A1 · Wired control — OSC"), because that
      // is the reason this row exists: you are pinned there.
      return `started “${item.targetTitle}” in ${item.snippet ?? "a territory you're pinned in"}`;
    default:
      return `did something with “${item.targetTitle}”`;
  }
}

export default function NotificationsList({ items }: { items: NotificationView[] }) {
  useEffect(() => {
    // Fire-and-forget: the badge clears on the next server-rendered page.
    void fetch(communityApiUrl("/api/community/notifications/read"), {
      method: "POST",
      ...COMMUNITY_FETCH_INIT,
    }).catch(() => undefined);
  }, []);

  if (items.length === 0) {
    return (
      <div className={styles.emptyPanel}>
        <span className={styles.emptyKicker}>Alerts · empty</span>
        <span className={styles.emptyTitle}>Nothing yet.</span>
        <span className={styles.emptyBody}>
          Alerts arrive when someone comments on, forks, ports, or decks your work. Publish
          something and give them a reason.
        </span>
        <Link href="/pattern-lab" className={styles.emptyCta}>
          Make &amp; publish — Pattern Lab ↗
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.notifyList}>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={targetHref(item)}
            className={styles.notifyRow}
            data-unread={item.unread}
          >
            <span className={styles.notifyMark} aria-hidden="true" />
            {/* Which pattern it happened to, before the sentence saying what.
                Only pattern alerts have one — a deck or a board post does not. */}
            {item.patternCode && (
              <span className={styles.notifyThumb}>
                <PatternCanvas
                  code={item.patternCode}
                  title={item.targetTitle}
                  className={styles.canvasFill}
                />
              </span>
            )}
            <span className={styles.notifyBody}>
              <span className={styles.notifySentence}>
                <strong>@{item.actor}</strong> {describe(item)}
              </span>
              {/* deck and territory embed their snippet in the sentence — a
                  second line would say the same thing twice. */}
              {item.snippet && item.type !== "deck" && item.type !== "territory" && (
                <span className={styles.notifySnippet}>{item.snippet}</span>
              )}
            </span>
            <span className={styles.notifyDate}>{item.createdAt.slice(0, 10)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
