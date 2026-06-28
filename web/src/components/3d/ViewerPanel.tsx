'use client';

import HeroScene from './HeroScene';
import { useAppStore } from '@/store/useAppStore';

// Wraps the 3D scene so it can react to the active home tab.
// On desktop the panel is always shown (sticky left column). On mobile it stays
// hidden while the hero is full-screen and only "drops down" once a section tab
// (Build / Pattern / Inside) is opened from the bottom nav.
export default function ViewerPanel() {
  const homeTab = useAppStore((state) => state.homeTab);
  const isOpen = homeTab !== 'hero';

  return (
    <div className={`viewer-panel ${isOpen ? 'is-open' : ''}`}>
      <HeroScene />
    </div>
  );
}
