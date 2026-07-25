import RightPanel from "@/components/sections/RightPanel";
import ViewerPanel from "@/components/3d/ViewerPanel";
import { getSectionContent } from "@/lib/content";
import HeroJournalLink from "@/components/journal/HeroJournalLink";
import BuildRouteSync from "@/components/sections/InsideGlobe/BuildRouteSync";

export type HomeTab = 'hero' | 'build' | 'pattern' | 'inside';

interface HomeViewProps {
  initialTab?: HomeTab;
  // Set by /inside/<build-id>, so a shared link opens on that pin.
  initialBuildId?: string | null;
}

export default function HomeView({ initialTab = 'hero', initialBuildId = null }: HomeViewProps) {
  const buildContent = getSectionContent('build');
  const patternContent = getSectionContent('pattern');
  const insideContent = getSectionContent('inside');

  return (
    <div className="app-layout">
      <BuildRouteSync buildId={initialBuildId} />
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
