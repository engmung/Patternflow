'use client';

import HeroJournalLink from "@/components/journal/HeroJournalLink";

export default function Hero() {
  return (
    <section className="hero">
      <HeroJournalLink />
      <div className="hero-copy">
        <h1>
          <em className="wordmark">Patternflow</em>
        </h1>
        <div className="kicker">An LED synthesizer.</div>
        <p className="lede">
          Play light patterns with your fingertips.
          <br />
          <a
            className="has-tip"
            data-tip="Opens GitHub"
            href="https://github.com/engmung/PatternFlow"
            target="_blank"
            rel="noopener"
            style={{
              borderBottom: "1px solid var(--ink)",
              paddingBottom: "1px",
            }}
          >
            An open-source
          </a>{" "}
          reinterpretation of{" "}
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
        </p>
        <p className="hero-kit-note">Build it from the files, or wait for the kit.</p>
        <a
          className="hero-cta has-tip"
          data-tip="Reserve a slot"
          href="https://tally.so/r/aQjEQy"
          target="_blank"
          rel="noopener"
        >
          Get notified when the kit ships
        </a>
      </div>
    </section>
  );
}
