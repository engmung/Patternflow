import Link from "next/link";
import PatternCanvas from "./PatternCanvas";
import type { PatternCardItem } from "./PatternCard";
import styles from "./Community.module.css";

// The stage. Five panels edge to edge at the top of /community: the first says
// what this place is, the other four are patterns, playing.
//
// It is a marquee in the theatre sense, not the scrolling-text one — nothing
// moves except the patterns themselves. The intro panel keeps a dimmed pattern
// behind its text so even the sentence explaining the wall is standing on one.

export default function Marquee({ items }: { items: PatternCardItem[] }) {
  const [backdrop, ...rest] = items;
  const panels = rest.slice(0, 4);

  return (
    <div className={styles.marquee}>
      <div className={`${styles.marqueePanel} ${styles.marqueeIntro}`}>
        {backdrop && (
          <div className={styles.marqueeIntroArt} aria-hidden="true">
            <PatternCanvas code={backdrop.code} title="" className={styles.canvasFill} />
          </div>
        )}
        <div className={styles.marqueeIntroBody}>
          <span className={styles.marqueeKicker}>The wall</span>
          <h1 className={styles.marqueeTitle}>Patterns people made, playing live.</h1>
          <p className={styles.marqueeBody}>
            Every Patternflow plays every pattern here. Hover to play, scroll on a screen to turn
            its knobs, open one to edit its code. No account.
          </p>
          {/* An anchor, not a route: the wall is the rest of this page. */}
          <a href="#wall" className={styles.marqueeLink}>
            Browse the wall <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>

      {panels.map((item) => (
        <Link key={item.id} href={`/community/p/${item.id}`} className={styles.marqueePanel}>
          <PatternCanvas code={item.code} title={item.title} live className={styles.canvasFill} />
          {/* No .h badge here. The marquee is the argument that this place is
              worth looking at, not a spec sheet — the wall two screens down is
              where a badge helps you filter. */}
          <span className={styles.marqueeCaption}>
            <b>{item.title}</b>
            <span>@{item.displayUsername ?? item.username ?? "unknown"}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
