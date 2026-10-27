"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import {
  FIRMWARE_NOTICE_COOKIE as KEY,
  FIRMWARE_NOTICE_VERSION as LATEST,
  firmwareNoticeDismissed,
} from "@/lib/community/firmwareNotice";
import styles from "./Community.module.css";

// "There is a new firmware" — said here, because there is nowhere else to say
// it.
//
// A board checks for updates from its own console, and that check only exists
// in v3.4.0 and later. Everyone on an earlier build sees nothing: the banner
// telling you to update is in the update you have not installed. Nor can this
// site read their version to find out — patternflow.work is https and a board
// is http, and a browser will not let an https page fetch http at all. The
// direction only runs the other way, which is why every device flow works by
// navigating TO the board rather than reaching into it.
//
// So the only place left to mention it is a page they already visit, which is
// this one: the community is where somebody who owns a Patternflow goes.
//
// Dismissal is per version, not forever. Dismiss this and it stays gone until
// there is a different release to mention — it cannot know whether you updated
// (see above), so the honest fallback is to ask once per version and drop it.
//
// The server draws the banner only for someone who will keep it. Until 26
// October only the browser knew about a dismissal, so the server drew nothing
// and the banner arrived at hydration, pushing the whole page down: 119px on
// a phone, CLS 0.141 at 390px. A dismissal now goes into a cookie as well, and
// the layout reads it and passes it in.

function dismissedHere(): boolean {
  if (document.cookie.split("; ").includes(`${KEY}=${LATEST}`)) return true;
  try {
    return firmwareNoticeDismissed(window.localStorage.getItem(KEY));
  } catch {
    return false; /* private mode */
  }
}

/** A year, and only on the community's pages: the notice is drawn nowhere
 *  else, so no other request needs to carry the cookie. */
function remember() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${KEY}=${LATEST}; Path=/community; Max-Age=31536000; SameSite=Lax${secure}`;
  try {
    window.localStorage.setItem(KEY, LATEST);
  } catch {
    /* private mode: the cookie still holds it */
  }
}

/** Read once per render from the cookie and localStorage. The server snapshot
 *  is the cookie as the layout read it, so the markup matches. */
function useDismissed(serverDismissed: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    dismissedHere,
    () => serverDismissed,
  );
}

export default function FirmwareNotice({ serverDismissed }: { serverDismissed: boolean }) {
  const dismissed = useDismissed(serverDismissed);

  // Dismissed before the cookie existed, in localStorage alone: the server
  // drew the banner and it left at hydration. Writing the cookie now keeps
  // that to this one page.
  useEffect(() => {
    if (dismissed && !serverDismissed) remember();
  }, [dismissed, serverDismissed]);

  if (dismissed) return null;

  const dismiss = () => {
    remember();
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <div className={styles.fwNotice}>
      <span className={styles.fwNoticeTag}>Firmware</span>
      <span className={styles.fwNoticeText}>
        <strong>{LATEST}</strong> is out — the firmware split into editions: the core instrument,
        Audio, and Performance. One-click install, switch any time, your settings stay.
      </span>
      <Link href="/editions" prefetch={false} className={styles.fwNoticeLink}>
        Pick an edition →
      </Link>
      <button
        type="button"
        className={styles.fwNoticeClose}
        onClick={dismiss}
        aria-label="Dismiss until the next release"
      >
        ✕
      </button>
    </div>
  );
}
