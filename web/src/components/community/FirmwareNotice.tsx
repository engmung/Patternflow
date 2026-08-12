"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import manifest from "../../../public/flash/manifest.json";
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

const LATEST = manifest.version;
const KEY = "pf-firmware-notice";

/** Read once per render from localStorage, with a server snapshot of "not
 *  dismissed" so the markup matches and the banner never flashes in late. */
function useDismissed(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => {
      try {
        return window.localStorage.getItem(KEY) === LATEST;
      } catch {
        return false; /* private mode */
      }
    },
    () => true, // server: assume dismissed, so nothing appears before hydration
  );
}

export default function FirmwareNotice() {
  const dismissed = useDismissed();
  if (dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, LATEST);
    } catch {
      /* private mode — it will ask again, which is the lesser failure */
    }
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <div className={styles.fwNotice}>
      <span className={styles.fwNoticeTag}>Firmware</span>
      {/* Describes the current firmware rather than one release's diff, so a
          patch bump does not advertise the previous version's changes as new. */}
      <span className={styles.fwNoticeText}>
        <strong>{LATEST}</strong> is out — pattern packs install from a link, a set ships with the
        board, and MQTT has a broker ready to use.
      </span>
      <Link href="/update" className={styles.fwNoticeLink}>
        Update over Wi-Fi →
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
