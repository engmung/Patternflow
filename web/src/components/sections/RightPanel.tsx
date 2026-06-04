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
  buildContent: SectionContent;
  patternContent: SectionContent;
  insideContent: SectionContent;
}

export default function RightPanel({ buildContent, patternContent, insideContent }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('hero');
  const [buildPanelKey, setBuildPanelKey] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleTabClick = (tab: TabType) => {
    const nextTab: TabType = activeTab === tab ? 'hero' : tab;

    if (activeTab === 'build' && nextTab !== 'build') {
      const store = useAppStore.getState();
      store.setBuildStep(0);
      store.setIsExploded(true);
      setBuildPanelKey((key) => key + 1);
    }

    setActiveTab(nextTab);

    captureEvent('section_tab_opened', {
      from_section: activeTab,
      to_section: nextTab,
      surface: 'right_panel_nav',
    });
  };

  // Reset scroll to top on every tab change
  useEffect(() => {
    const panel = contentRef.current;
    if (!panel) return;

    panel.scrollTop = 0;

    if (window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(() => {
        const stickyOffset = window.innerHeight * 0.3 + 94;
        const panelTop = panel.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({
          top: Math.max(0, panelTop - stickyOffset),
          behavior: 'auto',
        });
      });
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

      <div className={`content-panel ${activeTab !== 'hero' ? 'bg-white' : ''}`} ref={contentRef}>
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
    </div>
  );
}
