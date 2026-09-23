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

// Three cells, one grammar - mono kicker, name, a line of what for. This band
// was a row of bare links for a week in September (the panel slimmed down and
// took the table with it); the table is what reads as "ways in", so it is
// back. Contact sits here rather than in the top nav: this band is already
// the "how to reach us" surface.
const JOIN = [
  {
    kicker: 'Day-to-day help',
    name: 'Discord ↗',
    href: 'https://discord.gg/Vr9QtsxeTk',
    external: true,
    desc: 'Build questions, finished builds, custom patterns.',
  },
  {
    kicker: 'In motion',
    name: 'Instagram ↗',
    href: 'https://www.instagram.com/patternflow.work/',
    external: true,
    desc: 'Send a clean video and it usually goes up as a collab post.',
  },
  {
    kicker: 'Anything else',
    name: 'Contact',
    href: '/contact',
    external: false,
    desc: 'Exhibitions, commissions, and collaboration.',
  },
];

export default function InsidePanel({ content }: InsidePanelProps) {
  const { filter, visibleBuilds } = useBuildSelection();
  const label = BUILD_FILTERS.find((entry) => entry.value === filter)?.label;

  return (
    <div className="panel-content pf-section-panel" id="inside" aria-label={content.title}>
      <div className="panel-header">
        <h2 className="pf-h2">{content.title || 'Inside the work.'}</h2>
        <p className="pf-sub">{content.subtitle}</p>
        <div className={styles.joinBand} aria-label="Ways to join Patternflow">
          {JOIN.map((row) => {
            const inner = (
              <>
                <span className={styles.joinKicker}>{row.kicker}</span>
                <strong>{row.name}</strong>
                <span className={styles.joinDesc}>{row.desc}</span>
              </>
            );
            return row.external ? (
              <a key={row.name} className={styles.joinCell} href={row.href} target="_blank" rel="noreferrer">
                {inner}
              </a>
            ) : (
              <Link key={row.name} className={styles.joinCell} href={row.href}>
                {inner}
              </Link>
            );
          })}
        </div>
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
