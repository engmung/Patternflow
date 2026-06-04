'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { SectionContent } from '@/lib/content';
import { builds } from './InsideGlobe/builds';
import type { GlobeProps } from './InsideGlobe/Globe';
import styles from './InsidePanel.module.css';

interface InsidePanelProps {
  content: SectionContent;
}

const Globe = dynamic<GlobeProps>(() => import('./InsideGlobe/Globe'), { ssr: false });
const DISCORD_URL = 'https://discord.gg/Vr9QtsxeTk';
const INSTAGRAM_URL = 'https://www.instagram.com/patternflow.work/';
const GITHUB_CONTRIBUTING_URL = 'https://github.com/engmung/PatternFlow/blob/main/CONTRIBUTING.md';

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M20.3 4.7A16.7 16.7 0 0 0 16.2 3l-.2.4c-.2.4-.4.8-.5 1.2a15.6 15.6 0 0 0-7 0c-.2-.4-.3-.8-.5-1.2L7.8 3a16.7 16.7 0 0 0-4.1 1.7C1.1 8.6.4 12.4.8 16.2A16.9 16.9 0 0 0 5.9 19l.6-.8.5-.9c-.9-.3-1.7-.7-2.4-1.2l.6-.5c4.6 2.1 9.5 2.1 14.1 0l.6.5c-.8.5-1.6.9-2.4 1.2l.5.9.6.8a16.9 16.9 0 0 0 5.1-2.8c.5-4.3-.7-8-3.4-11.5ZM8.3 14.1c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M7.6 2h8.8A5.6 5.6 0 0 1 22 7.6v8.8a5.6 5.6 0 0 1-5.6 5.6H7.6A5.6 5.6 0 0 1 2 16.4V7.6A5.6 5.6 0 0 1 7.6 2Zm0 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm8.9 2.7a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 .8a11.2 11.2 0 0 0-3.5 21.8c.6.1.8-.3.8-.6v-2c-3.4.7-4.1-1.5-4.1-1.5-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.4-5.5-6a4.6 4.6 0 0 1 1.3-3.3c-.1-.3-.6-1.6.1-3.3 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6.2 0C18 3.7 19 4 19 4c.7 1.7.2 3 .1 3.3a4.7 4.7 0 0 1 1.3 3.3c0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2V22c0 .3.2.7.8.6A11.2 11.2 0 0 0 12 .8Z" />
    </svg>
  );
}

export default function InsidePanel({ content }: InsidePanelProps) {
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const selectedBuild = useMemo(
    () => builds.find((build) => build.id === selectedBuildId) ?? null,
    [selectedBuildId],
  );
  const galleryImages = selectedBuild?.images;
  const galleryOpen = galleryIndex !== null && !!galleryImages?.length;

  // Selecting a different pin also closes any open gallery.
  const handleSelectBuild = (id: string | null) => {
    setSelectedBuildId(id);
    setGalleryIndex(null);
  };

  useEffect(() => {
    if (!galleryOpen || !galleryImages) return;
    const count = galleryImages.length;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGalleryIndex(null);
      else if (event.key === 'ArrowRight') setGalleryIndex((i) => (i === null ? i : (i + 1) % count));
      else if (event.key === 'ArrowLeft') setGalleryIndex((i) => (i === null ? i : (i - 1 + count) % count));
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [galleryOpen, galleryImages]);

  return (
    <div className="panel-content pf-section-panel" id="inside" aria-label={content.title}>
      <div className="panel-header">
        <h2 className="pf-h2">{content.title || 'Inside the work.'}</h2>
        <p className="pf-sub">{content.subtitle || 'The build map and how to get involved.'}</p>
      </div>

      <div className={`panel-body ${styles.body}`}>
        <div className="pf-block">
          <span className="pf-kicker">Start anywhere</span>
          <div className="pf-prose">
            <p>
              Patternflow is a way to play light with your fingertips. You do not have to be
              special to make one, and you do not have to start with the most polished version.
            </p>
            <p>
              Start with what you have, ask when you get stuck, and pass help on when you can.
            </p>
          </div>
        </div>

        <div className="pf-block">
          <div className="pf-head">
            <span className="pf-kicker">Build map</span>
            <span className="pf-count">Total: {builds.length}+</span>
          </div>
          <div className={styles.mapLayout}>
            <div className={styles.globeShell}>
              <Globe selectedBuildId={selectedBuildId ?? undefined} onSelectBuild={handleSelectBuild} />
            </div>
            {selectedBuild ? (
              <div className={styles.buildCard} key={selectedBuild.id} aria-live="polite">
                <div className={styles.cardTop}>
                  <dl>
                    <div>
                      <dt>Location</dt>
                      <dd>{selectedBuild.location.label}</dd>
                    </div>
                    <div>
                      <dt>Maker</dt>
                      <dd>{selectedBuild.maker}</dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>{selectedBuild.date}</dd>
                    </div>
                  </dl>
                  {galleryImages && galleryImages.length > 0 && (
                    <button
                      type="button"
                      className={styles.cardThumb}
                      onClick={() => setGalleryIndex(0)}
                      aria-label={`View ${selectedBuild.maker}'s build photos`}
                    >
                      <Image src={galleryImages[0].src} alt={galleryImages[0].alt} fill sizes="82px" />
                      {galleryImages.length > 1 && (
                        <span className={styles.cardThumbBadge}>{galleryImages.length}</span>
                      )}
                    </button>
                  )}
                </div>
                <p>{selectedBuild.description}</p>
              </div>
            ) : (
              <div className={styles.buildCardPlaceholder}>
                <p>The goal is simple: cover this globe with Patternflow.</p>
                <span>Select a point on the globe to explore build details</span>
              </div>
            )}
          </div>
        </div>

        <div className="pf-block">
          <span className="pf-kicker">Join in</span>
          <div className="pf-prose">
            <p>
              Most of the day-to-day help happens in Discord. Instagram is for showing patterns
              in motion. GitHub is where the files, issues, and contribution notes live.
            </p>
          </div>
          <div className={styles.actionList} aria-label="Ways to join Patternflow">
            <a className={styles.actionRow} href={DISCORD_URL} target="_blank" rel="noreferrer">
              <span className={styles.actionIcon} aria-hidden="true">
                <DiscordIcon />
              </span>
              <span className={styles.actionCopy}>
                <strong>Discord</strong>
                <span>
                  Ask build questions, show finished builds, share custom patterns, and find the
                  pattern code from the Instagram posts.
                </span>
              </span>
            </a>
            <a className={styles.actionRow} href={INSTAGRAM_URL} target="_blank" rel="noreferrer">
              <span className={styles.actionIcon} aria-hidden="true">
                <InstagramIcon />
              </span>
              <span className={styles.actionCopy}>
                <strong>Instagram</strong>
                <span>
                  Send a clean video of your pattern. If it fits Patternflow, I&apos;ll usually
                  share it as a collaboration post.
                </span>
              </span>
            </a>
            <a className={styles.actionRow} href={GITHUB_CONTRIBUTING_URL} target="_blank" rel="noreferrer">
              <span className={styles.actionIcon} aria-hidden="true">
                <GitHubIcon />
              </span>
              <span className={styles.actionCopy}>
                <strong>GitHub</strong>
                <span>
                  Start with the contributing notes, then open an issue or pull request for docs,
                  firmware, hardware, or web changes.
                </span>
              </span>
            </a>
          </div>
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
            <li className={styles.storyCurrent}>
              <time>26.5</time>
              <span>
                Patternflow reached <strong>100 GitHub stars</strong>, and the{' '}
                <strong>first collaborator</strong> joined. Preparing for small-run sales, we initiated a precise{' '}
                <strong>BOM cost calculation</strong>, estimating roughly <strong>$120</strong> in pure material cost for the worst-case scenario.
              </span>
            </li>
            <li>
              <time>26.6</time>
              <span>
                Order the first <strong>PCBA batch</strong> and test whether Patternflow can be
                sold in a small, practical run.
              </span>
            </li>
            <li>
              <time>~</time>
              <span>
                Launch properly at the lowest sustainable price, send Patternflow further out
                into the world, collaborate with <strong>more artists</strong>, and earn
                <strong> academic recognition</strong>.
              </span>
            </li>
            <li>
              <time>28</time>
              <span>
                Before I leave for military service, make Patternflow into a
                <strong> community and ecosystem</strong> that can keep growing on its own.
              </span>
            </li>
          </ol>
          <Link className={styles.journalLink} href="/journal">
            Read the journal for the fuller story, including the thoughts and feelings along the way.
          </Link>
        </div>
      </div>

      {galleryIndex !== null && galleryImages && galleryImages.length > 0 && typeof document !== 'undefined' &&
        createPortal(
          <div
            className={styles.gallery}
            role="dialog"
            aria-modal="true"
            aria-label="Build photos"
            onClick={() => setGalleryIndex(null)}
          >
            <button
              className={styles.galleryClose}
              type="button"
              aria-label="Close gallery"
              onClick={() => setGalleryIndex(null)}
            >
              close
            </button>
            <div className={styles.galleryStage} onClick={(event) => event.stopPropagation()}>
              <div className={styles.galleryFrame}>
                {galleryImages.length > 1 && (
                  <button
                    type="button"
                    className={styles.galleryNav}
                    aria-label="Previous photo"
                    onClick={() =>
                      setGalleryIndex((i) => (i === null ? i : (i - 1 + galleryImages.length) % galleryImages.length))
                    }
                  >
                    ‹
                  </button>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.galleryMain}
                  src={galleryImages[galleryIndex].src}
                  alt={galleryImages[galleryIndex].alt}
                />
                {galleryImages.length > 1 && (
                  <button
                    type="button"
                    className={styles.galleryNav}
                    aria-label="Next photo"
                    onClick={() =>
                      setGalleryIndex((i) => (i === null ? i : (i + 1) % galleryImages.length))
                    }
                  >
                    ›
                  </button>
                )}
              </div>
              {galleryImages.length > 1 && (
                <div className={styles.galleryThumbs}>
                  {galleryImages.map((image, index) => (
                    <button
                      key={image.src}
                      type="button"
                      className={`${styles.galleryThumb} ${index === galleryIndex ? styles.galleryThumbActive : ''}`}
                      onClick={() => setGalleryIndex(index)}
                      aria-label={image.alt}
                      aria-current={index === galleryIndex}
                    >
                      <Image src={image.src} alt="" fill sizes="42px" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
