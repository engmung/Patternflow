import RightPanel from "@/components/sections/RightPanel";
import ViewerPanel from "@/components/3d/ViewerPanel";
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
      <ViewerPanel />
      <RightPanel
        initialTab={initialTab}
        buildContent={buildContent}
        patternContent={patternContent}
        insideContent={insideContent}
      />
    </div>
  );
}
