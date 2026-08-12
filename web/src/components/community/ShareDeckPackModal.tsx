"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Community.module.css";

// Handing a deck to somebody.
//
// Two ways out — an address and a file — and the address is the one that
// matters, so it is shown as text you can read and select rather than hidden
// behind a button that claims it copied something. Copying a link you never
// saw is a small act of faith no interface has earned.
//
// The panel also answers the question the deck page kept provoking: where do
// I bake the pack? Nowhere. It is built the first time anybody asks for it
// and rebuilt whenever the running order changes, so there is no publish step
// to hunt for — a fact worth stating outright, because an absent button reads
// as a missing feature.

export default function ShareDeckPackModal({
  packUrl,
  installUrl,
  onCopyLink,
  onDownload,
  downloadNote,
  onClose,
}: {
  /** Absolute address of the deck's pack. */
  packUrl: string;
  /** One-click install for the viewer's own board, or null before hydration. */
  installUrl: string | null;
  /** Copies the link and warms the build. Returns once the clipboard is set. */
  onCopyLink: () => Promise<boolean>;
  onDownload: () => void;
  /** Progress text while a pack compiles, from the page. */
  downloadNote: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Escape closes it. The other modals here rely on the backdrop alone, which
  // is fine when the content is a form you are filling in — this one is a
  // thing you glance at and leave, so the fastest way out should work.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    const ok = await onCopyLink();
    if (!ok) {
      // Clipboard refused — select the text so the keyboard still works.
      inputRef.current?.select();
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalKicker}>Share</span>
          <span>this deck</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <p className={styles.shareLead}>
            Anyone with this link can put the whole deck on their board — no account needed.
          </p>

          <div className={styles.shareLinkRow}>
            <input
              ref={inputRef}
              className={styles.shareLinkField}
              value={packUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Pack link"
            />
            <button type="button" className={styles.btnAccent} onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className={styles.shareNote}>
            The pack is built the first time someone asks for it, and rebuilt whenever you change
            the running order. There is nothing to publish.
          </p>

          <div className={styles.shareAlt}>
            <button type="button" className={styles.btnSmall} onClick={onDownload}>
              {downloadNote ?? "Download .zip"}
            </button>
            {installUrl && (
              <a className={styles.shareAltLink} href={installUrl}>
                Install on my own board →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
