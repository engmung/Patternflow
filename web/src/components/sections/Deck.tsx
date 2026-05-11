'use client';

import { useState } from 'react';
import BuildPanel from './BuildPanel';
import InsidePanel from './InsidePanel';
import PatternPanel from './PatternPanel';
import { SectionContent } from '@/lib/content';

type TabType = 'build' | 'inside' | 'pattern';

interface DeckProps {
  buildContent: SectionContent;
  patternContent: SectionContent;
  insideContent: SectionContent;
}

export default function Deck({ buildContent, patternContent, insideContent }: DeckProps) {
  const [activeTab, setActiveTab] = useState<TabType>('build');

  return (
    <div className="deck-wrap">
      <div className="tab-bar">
        <button 
          className={`tab-btn ${activeTab === 'build' ? 'active' : ''}`}
          onClick={() => setActiveTab('build')}
        >
          Build your own
        </button>
        <button 
          className={`tab-btn ${activeTab === 'inside' ? 'active' : ''}`}
          onClick={() => setActiveTab('inside')}
        >
          Inside the work
        </button>
        <button 
          className={`tab-btn ${activeTab === 'pattern' ? 'active' : ''}`}
          onClick={() => setActiveTab('pattern')}
        >
          Create Pattern
        </button>
      </div>

      <div className="deck-content" id="deck">
        {activeTab === 'build' && <BuildPanel content={buildContent} isActive />}
        {activeTab === 'inside' && <InsidePanel content={insideContent} />}
        {activeTab === 'pattern' && <PatternPanel content={patternContent} />}
      </div>
    </div>
  );
}
