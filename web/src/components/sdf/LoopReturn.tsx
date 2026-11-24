"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import FantasiaGardenCanvas from "./FantasiaGardenCanvas";
import styles from "./SdfPage.module.css";

type LoopReturnProps = {
  email: string;
  mailtoHref: string;
};

export default function LoopReturn({ email, mailtoHref }: LoopReturnProps) {
  const sentinelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let lastY = window.scrollY;
    let lockedUntil = 0;

    const onScroll = () => {
      const now = performance.now();
      const y = window.scrollY;
      const goingDown = y > lastY;
      lastY = y;

      if (!goingDown || now < lockedUntil) return;

      const el = sentinelRef.current;
      if (!el) return;

      // Once the bottom clone reaches the top of the viewport, snap invisibly
      // back to scrollY = 0 where the identical opening screen lives.
      if (el.getBoundingClientRect().top <= 2) {
        lockedUntil = now + 250;
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        lastY = 0;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      ref={sentinelRef}
      className={styles.opening}
      aria-hidden="true"
    >
      <FantasiaGardenCanvas />
      <div className={styles.openingScrim} />

      <div className={styles.openingTop}>
        <Link href="/" className={styles.wordmark} tabIndex={-1} prefetch={false}>
          Patternflow
        </Link>
        <span className={styles.openingDate}>SDF 2026</span>
      </div>

      <div className={styles.openingBottom}>
        <div className={styles.displayKo}>
          <span className={styles.word1}>인터랙티브</span>
          <span className={styles.word2}>미디어아트를</span>
          <span className={styles.word3}>쉽게,</span>
          <span className={styles.word4}>패턴플로우</span>
        </div>

        <div className={styles.openingFoot}>
          <a href={mailtoHref} className={styles.openingEmail} tabIndex={-1}>
            {email}
          </a>
        </div>
      </div>
    </section>
  );
}
