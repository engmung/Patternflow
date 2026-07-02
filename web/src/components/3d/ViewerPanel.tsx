'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import HeroScene from './HeroScene';
import { useAppStore } from '@/store/useAppStore';

// The Inside section swaps the product preview for the interactive build globe.
const GlobeViewer = dynamic(
  () => import('@/components/sections/InsideGlobe/GlobeViewer'),
  { ssr: false },
);

const FADE_MS = 200;

// Wraps the 3D scene so it can react to the active home tab.
// On desktop the panel is always shown (sticky left column). On mobile it stays
// hidden while the hero is full-screen and only "drops down" once a section tab
// (Build / Pattern / Inside) is opened from the bottom nav.
export default function ViewerPanel() {
  const homeTab = useAppStore((state) => state.homeTab);
  const isOpen = homeTab !== 'hero';

  // Only two distinct scenes exist: the product preview (hero/build/pattern) and
  // the globe (inside). Switching between build/pattern/hero never swaps the
  // canvas, so no transition there — we only fade when the scene itself changes.
  const targetScene = homeTab === 'inside' ? 'globe' : 'product';
  const [shownScene, setShownScene] = useState(targetScene);
  // Fading whenever the shown scene lags behind the target; the timeout below
  // swaps the scene, which ends the fade without extra state.
  const fading = targetScene !== shownScene;

  // Fade the current scene out, swap while invisible, then fade the new one in.
  // Keeping a single scene mounted at a time preserves the original (cheap)
  // memory profile — this is a fade-through, not a true overlapping crossfade.
  useEffect(() => {
    if (targetScene === shownScene) return;
    const timer = setTimeout(() => {
      setShownScene(targetScene);
    }, FADE_MS);
    return () => clearTimeout(timer);
  }, [targetScene, shownScene]);

  return (
    <div className={`viewer-panel ${isOpen ? 'is-open' : ''}`}>
      <div className={`viewer-fade ${fading ? 'is-fading' : ''}`}>
        {shownScene === 'globe' ? <GlobeViewer /> : <HeroScene />}
      </div>
    </div>
  );
}
