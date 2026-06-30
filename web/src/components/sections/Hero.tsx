'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import HeroJournalLink from "@/components/journal/HeroJournalLink";
import CrowdSupplyModal from "@/components/crowdsupply/CrowdSupplyModal";
import { captureEvent } from "@/lib/posthogEvents";

export default function Hero() {
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  const [isCrowdSupplyOpen, setIsCrowdSupplyOpen] = useState(false);

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
        <div className="kicker" style={{ marginBottom: '24px' }}>An open-source LED synthesizer played with the fingertips.</div>
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
          Where Paik brought participation into art,
          <br />
          Patternflow puts creation in everyone&apos;s hands.
          <br />
          <br />
          <span style={{ fontWeight: 500 }}>Create and share your own light.</span>
        </p>
        <p className="hero-kit-note">
          All source files and guides are on GitHub.
          <br />
          Build one yourself, or get one.
        </p>
        <div className="hero-cta-row" aria-label="Patternflow actions">
          <a
            className="hero-cta"
            href="https://github.com/engmung/Patternflow"
            target="_blank"
            rel="noopener"
            onClick={() => captureEvent('github_cta_clicked', {
              surface: 'hero',
              destination: 'github_repository',
            })}
          >
            GitHub
          </a>
          <button
            type="button"
            className="hero-cta hero-cta-waitlist"
            onClick={() => {
              setIsCrowdSupplyOpen(true);
              captureEvent('crowd_supply_modal_opened', {
                surface: 'hero',
              });
            }}
          >
            Get One
          </button>
        </div>
      </div>
      {isCrowdSupplyOpen && (
        <CrowdSupplyModal onClose={() => setIsCrowdSupplyOpen(false)} />
      )}
    </section>
  );
}
