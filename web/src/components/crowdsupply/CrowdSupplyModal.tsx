"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { captureEvent } from "@/lib/posthogEvents";
import styles from "./CrowdSupplyModal.module.css";

const CROWD_SUPPLY_URL = "https://www.crowdsupply.com/engmung/patternflow";

type Props = {
  onClose: () => void;
};

export default function CrowdSupplyModal({ onClose }: Props) {
  // Closing without continuing = funnel drop-off; tag how they bailed so the
  // PostHog funnel can break down where opened-but-didn't-click users leave.
  const handleDismiss = useCallback(
    (reason: "escape" | "overlay" | "close_button" | "maybe_later") => {
      captureEvent("crowd_supply_modal_dismissed", { surface: "hero", reason });
      onClose();
    },
    [onClose],
  );

  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleDismiss("escape");
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [handleDismiss]);

  const handleContinue = () => {
    captureEvent("crowd_supply_clicked", {
      surface: "hero",
      destination: "crowd_supply",
      via: "modal_continue",
    });
  };

  // Portal to body so the fixed overlay escapes any transformed ancestor
  // and covers the full viewport (not just the hero panel).
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="About Crowd Supply"
      onClick={() => handleDismiss("overlay")}
    >
      <div className={styles.card} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={styles.close}
          onClick={() => handleDismiss("close_button")}
          aria-label="Close"
        >
          ×
        </button>

        <div className={styles.inner}>
          <h2 className={styles.title}>One quick stop.</h2>

          <p className={styles.lead}>
            &ldquo;Get One&rdquo; takes you to <strong>Crowd Supply</strong> — run by{" "}
            <strong>Mouser</strong>, one of the world&apos;s largest electronics distributors. They
            handle the launch and ship Patternflow worldwide.
          </p>

          <p className={styles.subhead}>Two quick things before you go:</p>

          <ul className={styles.reasons}>
            <li>
              <span className={styles.mark}>—</span>
              <span>
                <b>You&apos;re not buying yet.</b>{" "}You&apos;ll tap <em>&ldquo;Subscribe&rdquo;</em>{" "}
                to follow Patternflow and hear when it&apos;s out. Free, no card.
              </span>
            </li>
            <li>
              <span className={styles.mark}>—</span>
              <span>
                <b>No pressure.</b>{" "}It stays available after launch, too.
              </span>
            </li>
          </ul>

          <div className={styles.actions}>
            <a
              className={styles.primary}
              href={CROWD_SUPPLY_URL}
              target="_blank"
              rel="noopener"
              onClick={handleContinue}
            >
              Continue to Crowd Supply →
            </a>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => handleDismiss("maybe_later")}
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
