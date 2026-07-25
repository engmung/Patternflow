'use client';

import { useEffect } from 'react';
import { buildIdFromPath } from './useBuildSelection';
import { useAppStore } from '@/store/useAppStore';

// Seeds the picked pin from the URL the page was served at, and follows the
// browser's back/forward buttons afterwards. Selecting a pin only pushes
// history (see useBuildSelection), so nothing else brings the two back in step.
export default function BuildRouteSync({ buildId }: { buildId: string | null }) {
  const setSelectedId = useAppStore((state) => state.setSelectedBuildId);

  useEffect(() => {
    setSelectedId(buildId);
  }, [buildId, setSelectedId]);

  useEffect(() => {
    const handlePopState = () => {
      setSelectedId(buildIdFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setSelectedId]);

  return null;
}
