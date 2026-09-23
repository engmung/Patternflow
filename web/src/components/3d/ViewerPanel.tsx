'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import HeroScene from './HeroScene';
import { useAppStore } from '@/store/useAppStore';

// The hero and the Inside section show the build globe; Build and Pattern
// show the product preview.
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

  // Only two distinct scenes exist: the globe (hero, inside) and the product
  // preview (build, pattern). The hero used to open on the product, with the
  // map a link below the buttons; but the hero's own video already shows the
  // device in motion, and a globe of people who built one is the proof the
  // page never showed first. Switching between tabs that share a scene never
  // swaps the canvas, so we only fade when the scene itself changes.
  const targetScene = homeTab === 'inside' || homeTab === 'hero' ? 'globe' : 'product';
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
