'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import HeroJournalLink from "@/components/journal/HeroJournalLink";
import { captureEvent } from "@/lib/posthogEvents";
import { CROWD_SUPPLY_URL } from "@/lib/crowdSupply";
import { builds } from "@/components/sections/InsideGlobe/builds";

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
        <p className="lede">Every Patternflow plays every pattern we make.</p>
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
        {/* Get One leads: it is the action that costs the reader something, so
            it takes the solid weight. The note sits under it — not under both —
            so it is unambiguous which button ships worldwide. */}
        <div className="hero-cta-row" aria-label="Patternflow actions">
          <a
            className="hero-cta hero-cta-primary"
            href={CROWD_SUPPLY_URL}
            target="_blank"
            rel="noopener"
            onClick={() => captureEvent('crowd_supply_clicked', {
              surface: 'hero',
              destination: 'crowd_supply',
              via: 'direct',
            })}
          >
            Get One
          </a>
          <a
            className="hero-cta hero-cta-secondary"
            href="https://github.com/engmung/Patternflow"
            target="_blank"
            rel="noopener"
            onClick={() => captureEvent('github_cta_clicked', {
              surface: 'hero',
              destination: 'github_repository',
            })}
          >
            Build it — GitHub
          </a>
          <p className="hero-cta-note">Crowd Supply · ships worldwide</p>
        </div>
        {/* The hero is all claim and no evidence otherwise. Per the manifesto,
            the build map is the strongest proof there is — a star is interest,
            a pin is someone who actually did it — and the count comes from the
            data so it cannot go stale. Below the buttons on purpose: evidence
            belongs after the ask, and the CTA row keeps its place above the
            fold. */}
        <p className="hero-proof">
          <Link
            href="/inside"
            onClick={() => captureEvent('hero_proof_clicked', {
              surface: 'hero',
              destination: 'inside_build_map',
            })}
          >
            {builds.length} pins on the globe — see who built one ↗
          </Link>
        </p>
      </div>
    </section>
  );
}
