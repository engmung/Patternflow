import styles from "./Features.module.css";
import type { Reel as ReelData } from "./features-data";

// An Instagram post, embedded by its permalink.
//
// Instagram serves a self-contained page at <permalink>embed/ that needs no
// script of theirs on this site, which keeps the page static and keeps their
// JavaScript out of it. The frame is lazy, so nothing is fetched from
// Instagram until the reel scrolls into view — and the permalink under it is
// the way out when an embed is blocked, or when a phone would rather open
// the app.
export default function Reel({ reel }: { reel: ReelData }) {
  return (
    <figure className={styles.reel}>
      <iframe
        className={styles.reelFrame}
        src={`${reel.url}embed/`}
        title="Reel on Instagram"
        loading="lazy"
        allow="encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <figcaption className={styles.reelCap}>
        {reel.caption}{" "}
        <a href={reel.url} target="_blank" rel="noopener">
          Open on Instagram
        </a>
      </figcaption>
    </figure>
  );
}
