"use client";

import Link from "next/link";
import { useEffect } from "react";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
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
};

function targetHref(item: NotificationView): string {
  if (item.targetType === "post") return `/community/discussions/${item.targetId}`;
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
      <div className={styles.empty}>
        Nothing yet. When someone comments on your work, forks a pattern of yours, or puts one in
        a public deck, it shows up here.
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
            <span className={styles.notifyBody}>
              <span className={styles.notifySentence}>
                <strong>@{item.actor}</strong> {describe(item)}
              </span>
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
