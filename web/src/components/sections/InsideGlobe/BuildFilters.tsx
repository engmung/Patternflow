'use client';

import { BUILD_FILTERS } from './builds';
import { useBuildSelection } from './useBuildSelection';
import styles from './BuildFilters.module.css';

export default function BuildFilters() {
  const { filter, setFilter } = useBuildSelection();
  return (
    <div className={styles.filters} role="group" aria-label="Filter map and list">
      {BUILD_FILTERS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={filter === value}
          onClick={() => setFilter(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
