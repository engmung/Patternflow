'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import HeroJournalLink from "@/components/journal/HeroJournalLink";
import { captureEvent } from "@/lib/posthogEvents";
import { builds } from "@/components/sections/InsideGlobe/builds";

// How many people have made a Patternflow, by the nearest thing to a count
// there is: the community's membership, which tracks it closely. Rounded and
// said as "around", because it is an estimate; the map figure beside it is
// exact and comes from the data.
const PEOPLE_WHO_MADE_ONE = 40;

export default function Hero() {
  const [isVideoVisible, setIsVideoVisible] = useState(false);

  useEffect(() => {
    // Show the video after 3 seconds (allowing it to initialize and hide controls)
    const showTimer = setTimeout(() => {
      setIsVideoVisible(true);
    }, 3000);

    // Hide the video and return to static image after the video ends (3s delay + 89s video duration = 92s)
    const hideTimer = setTimeout(() => {
      setIsVideoVisible(false);
    }, 92000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <section className="hero">
      <HeroJournalLink />
      <div className="hero-copy">
        <h1>
          <em className="wordmark">Patternflow</em>
        </h1>
        <div className="kicker">An open-source LED synthesizer. Play light with your fingertips.</div>
        {/* The one thing the page never said: what you actually do with it.
            Sits above the video so it reads before the picture, not after. */}
        <p className="hero-spec">Four knobs. The pattern answers as you turn them.</p>
        <div style={{
          /* 14, not 24: the last few pixels that put the CTA row above the
             fold on an 820px-tall laptop. */
          marginBottom: '14px',
          overflow: 'hidden', 
          border: '1px solid var(--pf-rule)',
          position: 'relative',
          paddingBottom: '56.25%',
          height: 0
        }}>
          {/* Static fallback and loading placeholder */}
          <img 
            src="/product_v2.jpg" 
            alt="Patternflow physical device" 
            style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block' 
            }} 
          />
          <iframe 
            src="https://www.youtube.com/embed/OXt-yg_7qdk?autoplay=1&mute=1&controls=0&modestbranding=1&disablekb=1&playsinline=1&rel=0" 
            title="Patternflow Demo Video"
            frameBorder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            allowFullScreen
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'block',
              pointerEvents: 'none',
              opacity: isVideoVisible ? 1 : 0,
              transition: 'opacity 0.6s ease-in-out',
            }}
          />
        </div>
        {/* L3 — the strongest line we have, per the manifesto: a description of
            how the system works, with nothing in it to disbelieve. */}
        <p className="lede">Every Patternflow plays every pattern the community makes.</p>
        {/* L5 does not run in the hero (manifesto §2: depth, not headline, and
            this is the most headline-like surface on the site). This is a
            signpost to it, not a shortened version of it — the line itself is
            unchanged and still runs in full in the README and the journal. */}
        {/* One link, one target: the journal post about Paik is the "why", so
            pointing the work title at an external museum page and the call to
            action at the journal index just split the same destination in two. */}
        <p className="hero-footnote">
          <Link
            href="/journal/nam-june-paik-me-patternflow/en"
            onClick={() => captureEvent('hero_footnote_clicked', {
              surface: 'hero',
              destination: 'journal_nam_june_paik',
            })}
          >
            After Nam June Paik&apos;s <em>Participation TV</em>, 1963 — read why ↗
          </Link>
        </p>
        {/* No buttons. Get One went when the campaign had funded and there
            was nothing left to ask for; Build It lives on the Build tab. What
            closes the column instead is the count: how many people have made
            one, and how many of them are on the globe beside this. */}
        <p className="hero-proof">
          Around {PEOPLE_WHO_MADE_ONE} people have made one so far &mdash;{' '}
          <Link
            href="/inside"
            onClick={() => captureEvent('hero_proof_clicked', {
              surface: 'hero',
              destination: 'inside_build_map',
            })}
          >
            {builds.length} of them are on the map ↗
          </Link>
        </p>
      </div>
    </section>
  );
}
