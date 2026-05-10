import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { SectionContent } from '@/lib/content';
import styles from './InsidePanel.module.css';

interface InsidePanelProps {
  content: SectionContent;
}

const Globe = dynamic(() => import('./InsideGlobe/Globe'), { ssr: false });

const redditQuotes = [
  {
    quote: "Remember some years ago Teenage Engineering did a simple LED matrix music visualizer thing with IKEA and it was super lame. Your thing is much closer to what it should have been.",
    user: 'u/frumperino',
    subreddit: 'r/arduino',
  },
  {
    quote: 'That is the coolest most useless thing on the planet.',
    user: 'u/NeedleworkerFew5205',
    subreddit: 'r/arduino',
  },
  {
    quote: "Out of 100's of projects in a similar category, yours is the first that I must freaking have.",
    user: 'u/LegendOfVlad',
    subreddit: 'r/arduino',
  },
  {
    quote: 'This is one of those ultra-niche things I just love.',
    user: 'u/zebadrabbit',
    subreddit: 'r/arduino',
  },
  {
    quote: 'More love to this post please!!!',
    user: 'u/ShamanOnTech',
    subreddit: 'r/arduino',
  },
  {
    quote: "So uh... so when are you selling this? Can't wait.",
    user: 'u/C4TT4',
    subreddit: 'r/somethingimade',
  },
  {
    quote: "Another up is not enough. I'm gonna try to build one.",
    user: 'u/Sandisbad',
    subreddit: 'r/arduino',
  },
  {
    quote: "Incredibly cool. I'd love to have this in my home!",
    user: 'u/SawdustedPatios',
    subreddit: 'r/somethingimade',
  },
];

function RedditCommentBand() {
  const items = [...redditQuotes, ...redditQuotes];
  const marqueeRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);

  const applyOffset = () => {
    const track = trackRef.current;
    if (!track) return;

    const loopWidth = track.scrollWidth / 2;
    if (loopWidth <= 0) return;

    offsetRef.current = ((offsetRef.current % loopWidth) + loopWidth) % loopWidth;
    track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
  };

  useEffect(() => {
    const animate = (time: number) => {
      const track = trackRef.current;
      if (track && !pausedRef.current && !draggingRef.current) {
        const loopWidth = track.scrollWidth / 2;
        const delta = previousTimeRef.current ? time - previousTimeRef.current : 0;

        if (loopWidth > 0) {
          offsetRef.current += (loopWidth / 80000) * delta;
          applyOffset();
        }
      }

      previousTimeRef.current = time;
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    draggingRef.current = true;
    pausedRef.current = true;
    dragStartXRef.current = event.clientX;
    dragStartOffsetRef.current = offsetRef.current;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    offsetRef.current = dragStartOffsetRef.current - (event.clientX - dragStartXRef.current);
    applyOffset();
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    pausedRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="pf-block">
      <div
        ref={marqueeRef}
        className={`pf-marquee fade ${styles.commentMarquee}`}
        aria-label="Reddit comments"
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          if (!draggingRef.current) pausedRef.current = false;
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div ref={trackRef} className={`pf-track pf-track-manual ${styles.manualTrack}`}>
          {items.map((item, index) => {
            const quoteNumber = String((index % redditQuotes.length) + 1).padStart(2, '0');
            const isDuplicate = index >= redditQuotes.length;

            return (
              <div
                key={`${item.user}-${index}`}
                className="pf-comment"
                aria-hidden={isDuplicate ? 'true' : undefined}
              >
                <span className="pf-ghost">{quoteNumber}</span>
                <p>{item.quote}</p>
                <div className="pf-comment-meta">
                  <span>{item.user}</span>
                  <span>{item.subreddit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function InsidePanel({ content }: InsidePanelProps) {
  return (
    <div className="panel-content pf-section-panel" id="inside" aria-label={content.title}>
      <div className="panel-header">
        <h2 className="pf-h2">Origin &amp; Open</h2>
        <p className="pf-sub">Everything about Patternflow</p>
      </div>

      <div className={`panel-body ${styles.body}`}>
        <div className="pf-block">
          <span className="pf-kicker">Origin</span>
          <div className="pf-prose">
            <p>
              Two posts on r/arduino brought Patternflow to 150K combined views and 3.5K upvotes.
            </p>
            <p>
              Hundreds of comments asked when it would be available, where to find the files,
              and how to build their own.
            </p>
            <div className={styles.sourceLinks}>
              <a className="pf-link" href="https://www.reddit.com/r/arduino/comments/1so9er5/" target="_blank" rel="noreferrer">
                First r/arduino post
              </a>
              <a className="pf-link" href="https://www.reddit.com/r/arduino/comments/1szettd/" target="_blank" rel="noreferrer">
                Second r/arduino post
              </a>
            </div>
          </div>
        </div>

        <RedditCommentBand />

        <div className="pf-block">
          <span className="pf-kicker">Open source</span>
          <div className="pf-prose">
            <p>
              PCBway reached out right after the first post. Their timing made the first PCB
              possible just when Patternflow needed one.
            </p>
            <p>
              The community was not asking for a product. They were asking for the files.
              So Patternflow was opened: schematics, firmware, case, build guide, all of it
              in the repository. Hardware designs are shared under CC-BY-SA 4.0; firmware
              and web code are MIT.
            </p>
            <p>
              The encouragement in the comments is the reason it stays open. Not a finished
              object but a starting point: build, modify, fork, share.
            </p>
          </div>
        </div>

        <div className="pf-block">
          <span className="pf-kicker">Participation TV</span>
          <div className="pf-prose">
            <p>
              A reinterpretation of Nam June Paik&apos;s Participation TV (1963). Paik brought
              participation into art. Patternflow tries to carry that gesture further, from
              participation into creation.
            </p>
            <p>
              More of the story, from failed prints and broken potentiometers to the first PCB
              and the 30-day build process, is documented in the journal.
            </p>
            <Link className="pf-link" href="/journal">
              Read the journal
            </Link>
          </div>
        </div>

        <div className="pf-block">
          <span className="pf-kicker">Build map</span>
          <div className={styles.globeShell}>
            <Globe />
          </div>
          <p className={styles.tagline}>
            The first one was made in Seoul, April 2026.
            <br />
            The next one could be anywhere.
          </p>
        </div>

        <div className="pf-block">
          <span className="pf-kicker">Share a build</span>
          <div className="pf-prose">
            <p>
              If you build your own, share photos on Discord or open a GitHub issue.
              We will add your build to the map.
            </p>
            <div className={styles.shareLinks}>
              <a className="pf-link" href="https://discord.gg/Vr9QtsxeTk" target="_blank" rel="noreferrer">Discord</a>
              <a className="pf-link" href="https://github.com/engmung/PatternFlow/issues" target="_blank" rel="noreferrer">GitHub issues</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
