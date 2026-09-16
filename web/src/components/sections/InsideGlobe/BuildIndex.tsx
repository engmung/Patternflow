'use client';

import { orderedBuilds, matchesBuildFilter } from './builds';
import { buildPath, useBuildSelection } from './useBuildSelection';
import styles from './BuildIndex.module.css';

// Real links keep every entry shareable and crawlable. A normal click updates
// selection in place, preserving the globe; modified clicks open the URL.
export default function BuildIndex() {
  const { selectedId, select, filter, visibleBuilds } = useBuildSelection();

  return (
    <>
      <ul className={styles.list} aria-label="Patternflow around the world">
        {orderedBuilds.map((build) => (
          <li key={build.id} hidden={!matchesBuildFilter(build, filter)}>
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
              <span className={styles.title}>{build.title}</span>
              <span className={styles.meta}>{build.maker} · {build.location.label}</span>
            </a>
          </li>
        ))}
      </ul>
      {visibleBuilds.length === 0 && <p className={styles.empty}>No entries in this category yet.</p>}
    </>
  );
}
