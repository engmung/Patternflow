'use client';

import { useState, useEffect } from 'react';
import HeroJournalLink from "@/components/journal/HeroJournalLink";
import { captureEvent } from "@/lib/posthogEvents";
import { CROWD_SUPPLY_URL } from "@/lib/crowdSupply";

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
          marginBottom: '24px', 
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
        <p className="lede">
          A reinterpretation of{" "}
          <a
            className="has-tip"
            data-tip="View on MoMA"
            href="https://www.moma.org/artists/4469"
            target="_blank"
            rel="noopener"
            style={{
              color: "inherit",
              textDecoration: "none",
              whiteSpace: "nowrap",
              fontWeight: 500,
            }}
          >
            Nam June Paik
          </a>
          &apos;s
          <br />
          <em>
            <a
              className="has-tip"
              data-tip="Nam June Paik Art Center"
              href="https://njpart.ggcf.kr/mediaObjects/32"
              target="_blank"
              rel="noopener"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              Participation TV
            </a>
          </em>{" "}
          (1963).
          <br />
          Paik let the audience change the image.
          <br />
          Patternflow lets you make it — and give it away.
          <br />
          <br />
          <span style={{ fontWeight: 500 }}>Every Patternflow plays every pattern we make.</span>
        </p>
        <p className="hero-kit-note">
          All source files and guides are on GitHub.
          <br />
          Build one yourself, or get one.
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
      </div>
    </section>
  );
}
