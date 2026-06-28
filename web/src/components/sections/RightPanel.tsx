'use client';

import { useState, useRef, useEffect } from 'react';
import Hero from './Hero';
import Sponsor from './Sponsor';
import BuildPanel from './BuildPanel';
import InsidePanel from './InsidePanel';
import PatternPanel from './PatternPanel';
import Footer from '../layout/Footer';
import { SectionContent } from '@/lib/content';
import { useAppStore } from '@/store/useAppStore';
import { captureEvent } from '@/lib/posthogEvents';

type TabType = 'hero' | 'build' | 'inside' | 'pattern';

interface RightPanelProps {
  initialTab?: TabType;
  buildContent: SectionContent;
  patternContent: SectionContent;
  insideContent: SectionContent;
}

const TAB_PATHS: Record<TabType, string> = {
  hero: '/',
  build: '/build',
  pattern: '/pattern',
  inside: '/inside',
};

function tabFromPath(pathname: string): TabType {
  switch (pathname) {
    case '/build':
      return 'build';
    case '/pattern':
      return 'pattern';
    case '/inside':
      return 'inside';
    default:
      return 'hero';
  }
}

export default function RightPanel({ initialTab = 'hero', buildContent, patternContent, insideContent }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [buildPanelKey, setBuildPanelKey] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<TabType>(initialTab);

  // Apply a tab change to local + global state (no URL update).
  const applyTab = (nextTab: TabType) => {
    const prevTab = activeTabRef.current;
    if (prevTab === nextTab) return;

    if (prevTab === 'build' && nextTab !== 'build') {
      const store = useAppStore.getState();
      store.setBuildStep(0);
      store.setIsExploded(true);
      setBuildPanelKey((key) => key + 1);
    }
    activeTabRef.current = nextTab;
    setActiveTab(nextTab);
  };

  const handleTabClick = (tab: TabType) => {
    const prevTab = activeTab;
    const nextTab: TabType = activeTab === tab ? 'hero' : tab;

    applyTab(nextTab);

    // Reflect the active tab in the URL without a full navigation, so the
    // viewer/3D scene never remounts but the link stays shareable.
    if (typeof window !== 'undefined' && window.location.pathname !== TAB_PATHS[nextTab]) {
      window.history.pushState(null, '', TAB_PATHS[nextTab]);
    }

    captureEvent('section_tab_opened', {
      from_section: prevTab,
      to_section: nextTab,
      surface: 'right_panel_nav',
    });
  };

  // Keep the active tab in sync with browser back/forward navigation.
  useEffect(() => {
    const handlePopState = () => {
      applyTab(tabFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the active tab into the store so the sibling 3D viewer panel knows
  // whether it should be visible (it "drops down" on mobile when a tab opens).
  useEffect(() => {
    useAppStore.getState().setHomeTab(activeTab);
  }, [activeTab]);

  // Reset scroll to top on every tab change. On mobile the viewer drops in from
  // the top, so jump the page to the top to reveal it alongside the panel.
  useEffect(() => {
    const panel = contentRef.current;
    if (!panel) return;

    panel.scrollTop = 0;

    if (window.matchMedia('(max-width: 900px)').matches) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeTab]);

  return (
    <div className="right-panel-layout">
      <div className="vertical-nav">
        <button 
          className={`v-tab-btn ${activeTab === 'build' ? 'active' : ''}`}
          onClick={() => handleTabClick('build')}
        >
          {activeTab === 'build' && <span className="close-icon">✕</span>}
          <span className="tab-text" data-mobile-label="1. Build">Build</span>
        </button>

        <button 
          className={`v-tab-btn ${activeTab === 'pattern' ? 'active' : ''}`}
          onClick={() => handleTabClick('pattern')}
        >
          {activeTab === 'pattern' && <span className="close-icon">✕</span>}
          <span className="tab-text" data-mobile-label="2. Pattern">Pattern</span>
        </button>
        <button 
          className={`v-tab-btn ${activeTab === 'inside' ? 'active' : ''}`}
          onClick={() => handleTabClick('inside')}
        >
          {activeTab === 'inside' && <span className="close-icon">✕</span>}
          <span className="tab-text" data-mobile-label="3. Inside">Inside</span>
        </button>
      </div>

      <div className={`content-panel ${activeTab !== 'hero' ? 'bg-white viewer-open' : ''}`} ref={contentRef}>
        <div className="deck-content">
          <div className={`panel-wrapper ${activeTab === 'hero' ? 'active' : ''}`}>
            <Hero />
            <Sponsor />
            <Footer />
          </div>
          <div className={`panel-wrapper ${activeTab === 'build' ? 'active' : ''}`}>
            <BuildPanel key={buildPanelKey} content={buildContent} isActive={activeTab === 'build'} />
          </div>
          <div className={`panel-wrapper ${activeTab === 'pattern' ? 'active' : ''}`}>
            <PatternPanel content={patternContent} />
          </div>
          <div className={`panel-wrapper ${activeTab === 'inside' ? 'active' : ''}`}>
            <InsidePanel content={insideContent} />
          </div>
        </div>
      </div>

      {/* Mobile-only bottom nav. Tapping a section drops the 3D viewer down from
          the top; tapping the active one again returns to the full-screen hero. */}
      <nav className={`mobile-bottom-nav ${activeTab !== 'hero' ? 'is-open' : ''}`} aria-label="Sections">
        {(['build', 'pattern', 'inside'] as const).map((tab) => (
          <button
            key={tab}
            className={`mb-tab ${activeTab === tab ? 'active' : ''}`}
            aria-pressed={activeTab === tab}
            onClick={() => handleTabClick(tab)}
          >
            {tab === 'build' ? 'Build' : tab === 'pattern' ? 'Pattern' : 'Inside'}
          </button>
        ))}
      </nav>
    </div>
  );
}
