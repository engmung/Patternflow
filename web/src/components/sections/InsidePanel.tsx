'use client';

import Link from 'next/link';
import { SectionContent } from '@/lib/content';
import BuildCard from './InsideGlobe/BuildCard';
import BuildIndex from './InsideGlobe/BuildIndex';
import { builds } from './InsideGlobe/builds';
import styles from './InsidePanel.module.css';

interface InsidePanelProps {
  content: SectionContent;
}

const DISCORD_URL = 'https://discord.gg/Vr9QtsxeTk';
const INSTAGRAM_URL = 'https://www.instagram.com/patternflow.work/';

// One grammar — no icons. The old version put 30px brand glyphs in a list while
// every other row on the site is a hairline with a mono label.
//
// Contact sits here rather than in the top nav: this band is already the "how
// to reach us" surface, and almost nothing arrives through the form.
const JOIN = [
  {
    kicker: 'Day-to-day help',
    name: 'Discord ↗',
    href: DISCORD_URL,
    external: true,
    desc: 'Build questions, finished builds, custom patterns.',
  },
  {
    kicker: 'In motion',
    name: 'Instagram ↗',
    href: INSTAGRAM_URL,
    external: true,
    desc: 'Send a clean video and it usually goes up as a collab post.',
  },
  // No GitHub row: the hero's second CTA is "Build it — GitHub" and carries far
  // more weight than a cell down here could. CONTRIBUTING.md is linked from the
  // README, which is where someone heading for it already is.
  {
    kicker: 'Anything else',
    name: 'Contact',
    href: '/contact',
    external: false,
    desc: 'Exhibitions, commissions, and collaboration.',
  },
];

export default function InsidePanel({ content }: InsidePanelProps) {
  return (
    <div className="panel-content pf-section-panel" id="inside" aria-label={content.title}>
      <div className="panel-header">
        <h2 className="pf-h2">{content.title || 'Inside the work.'}</h2>
        {/* The count comes from builds.ts so it can never disagree with the
            list below it; content/inside.md owns the sentence after it, so the
            file stays live rather than holding a subtitle nothing reads. */}
        <p className="pf-sub">
          {builds.length} pins on the globe so far. {content.subtitle}
        </p>
      </div>

      <div className={`panel-body ${styles.body}`}>
        <p className={styles.declaration}>
          Start with what you have, ask when you get stuck, and pass help on when you can.
        </p>

        <div className="pf-block">
          <span className="pf-kicker">On the map — the ledger for the globe</span>
          {/* Legend for the globe's own markers, so the two read as one thing.
              Circles here because the map draws circles; this describes the
              map rather than being UI chrome. */}
          <div className={styles.legend}>
            <span className={styles.legendBuild}>Build</span>
            <span className={styles.legendCollab}>Collaboration</span>
          </div>
          {/* Mobile only — the details for the pin picked on the globe above,
              which has no room to show them at 44vh. */}
          <BuildCard />
          {/* Every pin as a link, for keyboards, screen readers and crawlers. */}
          <BuildIndex />
          <p className={styles.mapNote}>
            Made one? Share it in Discord and I&apos;ll add your pin. A ring instead of a dot
            marks a collaboration.
          </p>
        </div>

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

        <div className="pf-block">
          <span className="pf-kicker">Story</span>
          <ol className={styles.storyList}>
            <li>
              <time>26.1</time>
              <span>
                <a href="https://origin.patternflow.work/" target="_blank" rel="noreferrer">
                  Patternflow: Origin
                </a>{' '}
                began as my first work as a <strong>new media artist</strong>, built around
                <strong> 3D-printed forms</strong> and the seed of what became Patternflow.
              </span>
            </li>
            <li>
              <time>26.3</time>
              <span>
                The Origin pattern was tested on a <strong>physical LED matrix</strong> with{' '}
                <strong>four knobs</strong>.
              </span>
            </li>
            <li>
              <time>26.4</time>
              <span>
                Instagram and the{' '}
                <a href="https://www.reddit.com/r/arduino/comments/1so9er5/built_a_4knob_generative_pattern_controller_with/" target="_blank" rel="noreferrer">
                  <strong>Arduino subreddit</strong>
                </a>{' '}
                responded strongly, so Patternflow turned into an{' '}
                <a href="https://www.reddit.com/r/arduino/comments/1szettd/12_days_later_pcb_done_rotary_encoders_done_fully/" target="_blank" rel="noreferrer">
                  <strong>open-source project</strong>
                </a>
                . The first PCB was made with <strong>PCBWay sponsorship</strong>.
              </span>
            </li>
            <li>
              <time>26.5</time>
              <span>
                Patternflow reached <strong>100 GitHub stars</strong>, and the{' '}
                <strong>first collaborator</strong> joined. A precise{' '}
                <strong>BOM cost calculation</strong> went in ahead of small-run sales.
              </span>
            </li>
            <li>
              <time>26.6</time>
              <span>
                The <strong>Crowd Supply pre-launch page</strong> went live, backed by{' '}
                <strong>countless refinements toward mass production</strong>. Instagram also passed{' '}
                <strong>1,000 followers</strong>.
              </span>
            </li>
            <li>
              <time>26.7</time>
              <span>
                Shipped <strong>v3.0.0</strong> — snap-fit enclosure,{' '}
                <strong>browser firmware compilation</strong>, and Web Serial flashing. The{' '}
                <strong>Community</strong> opened, Crowd Supply passed{' '}
                <strong>150 subscribers</strong>, and <strong>USB-C power went back on hold</strong>.
              </span>
            </li>
            <li className={styles.storyCurrent}>
              <time>26.8</time>
              <span>
                Taking the <strong>Crowd Supply campaign</strong> to launch, and putting a real
                foundation under the{' '}
                <Link href="/community">
                  <strong>Community</strong>
                </Link>
                .
              </span>
            </li>
            <li>
              <time>~</time>
              <span>
                Keep the price as low as it can sustainably go, send Patternflow further out into
                the world, collaborate with <strong>more artists</strong>, and earn{' '}
                <strong>academic recognition</strong>.
              </span>
            </li>
            <li>
              <time>28</time>
              <span>
                Grow Patternflow into a <strong>self-sustaining community and ecosystem</strong>,
                then move on to the <strong>next project</strong>.
              </span>
            </li>
          </ol>
          <div className={styles.storyLinks}>
            <Link className={styles.storyLinkCell} href="/journal">
              <span className={styles.storyLinkLabel}>Journal</span>
              <span className={styles.storyLinkText}>
                Read the fuller story, including the thoughts and feelings along the way.
              </span>
            </Link>
            <Link className={styles.storyLinkCell} href="/roadmap">
              <span className={styles.storyLinkLabel}>
                Project map
                <span className={styles.wipTag}>Work in progress</span>
              </span>
              <span className={styles.storyLinkText}>
                Every thread on one timeline — what shipped, what is planned, and how it connects.
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
