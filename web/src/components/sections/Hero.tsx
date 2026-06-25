'use client';

import HeroJournalLink from "@/components/journal/HeroJournalLink";
import { captureEvent } from "@/lib/posthogEvents";

export default function Hero() {
  return (
    <section className="hero">
      <HeroJournalLink />
      <div className="hero-copy">
        <h1>
          <em className="wordmark">Patternflow</em>
        </h1>
        <div className="kicker" style={{ marginBottom: '24px' }}>An open-source LED synthesizer played with the fingertips.</div>
        <div style={{ marginBottom: '24px', overflow: 'hidden', border: '1px solid var(--pf-rule)' }}>
          <img 
            src="/product_v2.jpg" 
            alt="Patternflow physical device" 
            style={{ width: '100%', height: 'auto', display: 'block' }} 
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
          Build one now, or join the waitlist.
        </p>
        <div className="hero-cta-row" aria-label="Patternflow actions">
          <a
            className="hero-cta"
            href="https://github.com/engmung/PatternFlow"
            target="_blank"
            rel="noopener"
            onClick={() => captureEvent('github_cta_clicked', {
              surface: 'hero',
              destination: 'github_repository',
            })}
          >
            GitHub
          </a>
          <a
            className="hero-cta hero-cta-waitlist"
            href="https://tally.so/r/aQjEQy"
            target="_blank"
            rel="noopener"
            onClick={() => captureEvent('kit_waitlist_clicked', {
              surface: 'hero',
              destination: 'tally_waitlist',
            })}
          >
            Waitlist
          </a>
        </div>
      </div>
    </section>
  );
}
