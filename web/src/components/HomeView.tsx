import RightPanel from "@/components/sections/RightPanel";
import HeroScene from "@/components/3d/HeroScene";
import { getSectionContent } from "@/lib/content";
import HeroJournalLink from "@/components/journal/HeroJournalLink";

export type HomeTab = 'hero' | 'build' | 'pattern' | 'inside';

export default function HomeView({ initialTab = 'hero' }: { initialTab?: HomeTab }) {
  const buildContent = getSectionContent('build');
  const patternContent = getSectionContent('pattern');
  const insideContent = getSectionContent('inside');

  return (
    <div className="app-layout">
      <div className="mobile-page-links">
        <HeroJournalLink />
      </div>
      <div className="viewer-panel">
        <HeroScene />
      </div>
      <RightPanel
        initialTab={initialTab}
        buildContent={buildContent}
        patternContent={patternContent}
        insideContent={insideContent}
      />
    </div>
  );
}
