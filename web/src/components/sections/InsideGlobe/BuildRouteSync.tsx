'use client';

import { useEffect } from 'react';
import { buildIdFromPath, useBuildSelection } from './useBuildSelection';

// Seeds the picked pin from the URL the page was served at, and follows the
// browser's back/forward buttons afterwards. Selecting a pin only pushes
// history (see useBuildSelection), so nothing else brings the two back in step.
export default function BuildRouteSync({ buildId }: { buildId: string | null }) {
  const { syncSelection } = useBuildSelection();

  useEffect(() => {
    syncSelection(buildId);
  }, [buildId, syncSelection]);

  useEffect(() => {
    const handlePopState = () => {
      syncSelection(buildIdFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncSelection]);

  return null;
}
