'use client';

import Link from 'next/link';
import { SectionContent } from '@/lib/content';
import BuildCard from './InsideGlobe/BuildCard';
import BuildIndex from './InsideGlobe/BuildIndex';
import { BUILD_FILTERS, builds } from './InsideGlobe/builds';
import { useBuildSelection } from './InsideGlobe/useBuildSelection';
import styles from './InsidePanel.module.css';

interface InsidePanelProps {
  content: SectionContent;
}

export default function InsidePanel({ content }: InsidePanelProps) {
  const { filter, visibleBuilds } = useBuildSelection();
  const label = BUILD_FILTERS.find((entry) => entry.value === filter)?.label;

  return (
    <div className="panel-content pf-section-panel" id="inside" aria-label={content.title}>
      <div className="panel-header">
        <h2 className="pf-h2">{content.title || 'Inside the work.'}</h2>
        <p className="pf-sub">{content.subtitle}</p>
        <nav className={styles.contactLinks} aria-label="Ways to join Patternflow">
          <a href="https://discord.gg/Vr9QtsxeTk" target="_blank" rel="noreferrer">Discord ↗</a>
          <a href="https://www.instagram.com/patternflow.work/" target="_blank" rel="noreferrer">Instagram ↗</a>
          <Link href="/contact">Contact ↗</Link>
        </nav>
      </div>

      <div className={`panel-body ${styles.body}`}>
        <BuildCard />
        <div className={styles.listHeading}>
          <span className="pf-kicker">{filter === 'all' ? 'Around the world' : label}</span>
          <span className={styles.count} role="status">
            {filter === 'all' ? `${builds.length} entries` : `${visibleBuilds.length} of ${builds.length} entries`}
          </span>
        </div>
        <BuildIndex />
        <p className={styles.mapNote}>
          Made something with Patternflow, or used it somewhere?{' '}
          <a href="https://discord.gg/Vr9QtsxeTk" target="_blank" rel="noreferrer">Send a link or a photo</a>
          {' '}and I&apos;ll add it here.
        </p>
        <nav className={styles.footerLinks} aria-label="More from Patternflow">
          <Link href="/journal">Journal ↗</Link>
          <Link href="/roadmap">Project map ↗</Link>
        </nav>
      </div>
    </div>
  );
}
