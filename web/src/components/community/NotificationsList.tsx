"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import PatternCanvas from "./PatternCanvas";
import styles from "./Community.module.css";

// The alerts list. Unread rows keep their marker for this visit — the
// mark-read call fires once after mount, and the refresh after it brings
// every row back read, so the list remembers which ones were unread when
// you arrived. What you came to see stays highlighted until you leave.

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
    // The two moderation rows. They read as what they are — somebody else
    // wrote the .h that still carries your name — and the snippet, when the
    // moderator left one, says why.
    case "header-fix":
      return `edited the firmware header on “${item.targetTitle}”`;
    case "header-drop":
      return `removed the firmware header from “${item.targetTitle}”`;
    // A take-down and its undo. The snippet line under it is the moderator's
    // reason; on a pattern the same words are a comment on the page, which
    // is where to answer them.
    case "hidden":
      return `made “${item.targetTitle}” private — it is off the wall until a moderator restores it`;
    case "restored":
      return `restored “${item.targetTitle}” — it is public again`;
    default:
      return `did something with “${item.targetTitle}”`;
  }
}

export default function NotificationsList({ items }: { items: NotificationView[] }) {
  const router = useRouter();
  const [unreadOnArrival] = useState(
    () => new Set(items.filter((item) => item.unread).map((item) => item.id)),
  );
  // Once per visit. The refresh hands this list new props, and a second
  // mark-read would ask for a second refresh.
  const marked = useRef(false);

  useEffect(() => {
    // The header badge belongs to the community layout, and a layout is not
    // rendered again when you move between the pages under it. Until 26
    // October 2026 "Alerts 1" stayed on this page and on every page after it
    // until a reload. Once the server has marked everything read, refresh:
    // the layout counts again and the badge goes, on whichever page you are
    // on by then. With nothing unread there is no badge to clear. A failed
    // call leaves the badge as it was, which is what is true.
    if (marked.current) return;
    marked.current = true;
    void fetch(communityApiUrl("/api/community/notifications/read"), {
      method: "POST",
      ...COMMUNITY_FETCH_INIT,
    })
      .then((response) => {
        if (response.ok && unreadOnArrival.size > 0) router.refresh();
      })
      .catch(() => undefined);
  }, [router, unreadOnArrival]);

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
            data-unread={item.unread || unreadOnArrival.has(item.id)}
          >
            <span className={styles.notifyMark} aria-hidden="true" />
            {/* Which pattern it happened to, before the sentence saying what.
                Only pattern alerts have one — a deck does not. */}
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
              {/* deck embeds its snippet in the sentence — a second line would
                  say the same thing twice. */}
              {item.snippet && item.type !== "deck" && (
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
