'use client';

import Image from 'next/image';
import { builds, formatBuildDate } from './builds';
import { buildPath, useBuildSelection } from './useBuildSelection';
import styles from './BuildIndex.module.css';

// The globe is a canvas, so every pin on it is invisible to a keyboard, a
// screen reader and a crawler. This is the same set of pins as plain links —
// which is also the only way anything on the site points at the /inside/<slug>
// pages that already exist for each of them.
//
// They are real hrefs, so middle-click and cmd-click open the pin's own page.
// A plain click is intercepted instead: navigating for real would remount the
// 3D scene, so it goes through the same select() the markers use, which swaps
// the URL with pushState and leaves the globe alone.
export default function BuildIndex() {
  const { selectedId, select } = useBuildSelection();

  return (
    <ul className={styles.list} aria-label="Every build on the map">
      {builds.map((build) => (
        <li key={build.id}>
          <a
            className={`${styles.item} ${selectedId === build.id ? styles.itemActive : ''}`}
            href={buildPath(build.id)}
            aria-current={selectedId === build.id ? 'true' : undefined}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              select(build.id);
            }}
          >
            {/* The first photo, where there is one. A pin with a face on it
                reads as somebody's build rather than a row in a table — which
                is the whole claim this list is making. */}
            {build.images?.[0] ? (
              <Image
                className={styles.thumb}
                src={build.images[0].src}
                alt={build.images[0].alt}
                width={104}
                height={72}
              />
            ) : (
              <span className={styles.thumbEmpty} aria-hidden="true" />
            )}
            <span className={styles.rowText}>
              <span className={styles.rowHead}>
                <span className={styles.maker}>{build.maker}</span>
                {build.kind === 'collaboration' && (
                  <span className={styles.tag}>Collaboration</span>
                )}
              </span>
              <span className={styles.meta}>
                {build.location.label} · {formatBuildDate(build.date)}
              </span>
              <span className={styles.desc}>{build.description}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
