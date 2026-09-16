'use client';

import { useCallback, useMemo } from 'react';
import { builds, buildBySlug, orderedBuilds, matchesBuildFilter, type BuildFilter } from './builds';
import { useAppStore } from '@/store/useAppStore';

export const INSIDE_PATH = '/inside';

// Each pin has its own shareable address, so a build can be linked directly
// — handy when telling someone their build has gone up on the map. The URL
// carries the slug; everything in the app still keys off the id.
export function buildPath(id: string | null): string {
  const build = id ? builds.find((entry) => entry.id === id) : undefined;
  return build ? `${INSIDE_PATH}/${build.slug}` : INSIDE_PATH;
}

export function buildIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/inside\/([^/]+)\/?$/);
  if (!match) return null;
  return buildBySlug(decodeURIComponent(match[1]))?.id ?? null;
}

// Picking a pin, wherever it is picked from. Keeps the store and the URL in
// step; both the globe overlay and the panel's mobile card go through this.
export function useBuildSelection() {
  const selectedId = useAppStore((state) => state.selectedBuildId);
  const setSelectedId = useAppStore((state) => state.setSelectedBuildId);
  const filter = useAppStore((state) => state.insideFilter);
  const setInsideFilter = useAppStore((state) => state.setInsideFilter);
  const visibleBuilds = useMemo(
    () => orderedBuilds.filter((build) => matchesBuildFilter(build, filter)),
    [filter],
  );

  // A shared URL or browser Back may select a pin outside the current filter.
  // Reveal it without changing that URL or creating another history entry.
  const syncSelection = useCallback((id: string | null) => {
    const build = builds.find((entry) => entry.id === id);
    if (build && !matchesBuildFilter(build, useAppStore.getState().insideFilter)) {
      setInsideFilter('all');
    }
    setSelectedId(id);
  }, [setInsideFilter, setSelectedId]);

  const select = useCallback(
    (id: string | null) => {
      syncSelection(id);

      // pushState rather than a router navigation: the 3D scene must not
      // remount, but the link still has to be copyable from the address bar.
      if (typeof window === 'undefined') return;
      const next = buildPath(id);
      if (window.location.pathname !== next) {
        window.history.pushState(null, '', next);
      }
    },
    [syncSelection],
  );

  const setFilter = useCallback((next: BuildFilter) => {
    const selected = builds.find((build) => build.id === useAppStore.getState().selectedBuildId);
    if (selected && !matchesBuildFilter(selected, next)) select(null);
    setInsideFilter(next);
  }, [select, setInsideFilter]);

  return { selectedId, select, syncSelection, filter, setFilter, visibleBuilds };
}
