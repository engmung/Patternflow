import type { Metadata } from "next";
import Link from "next/link";
import shelf from "../editions/Editions.module.css";
import styles from "./Features.module.css";
import Reel from "./Reel";
import { GROUPS, IN_THE_TREE, type Feature } from "./features-data";

// /features — the catalogue.
//
// The shelf (/editions) answers "which firmware do I install". This page
// answers the question underneath it: what can a panel do, one feature at
// a time, and what does each one need. A feature is a piece of firmware that
// attaches to the core without the core knowing it exists; a firmware on the
// shelf is a composition of them. Features are the unit somebody develops,
// proposes and maintains, which is why they get a page of their own rather
// than a bullet list on a card.
//
// Each group has a reel — the demo that goes round on Instagram — beside the
// cards, with a caption that says what the reel shows and, where it matters,
// what it does not. A feature nobody has filmed says so.

export const metadata: Metadata = {
  title: "Features / Patternflow",
  description:
    "What a Patternflow panel can do, one feature at a time: sound from a microphone, a browser or OSC; MIDI over Wi-Fi and USB; a clock; MQTT, sequences and the weather. What each needs, which firmware carries it, and a reel of it running.",
  alternates: { canonical: "/features" },
};

export const dynamic = "force-static";

function Where({ f }: { f: Feature }) {
  if (!f.whereHref) return <>{f.where}</>;
  const external = f.whereHref.startsWith("http");
  return external ? (
    <a href={f.whereHref} target="_blank" rel="noopener">
      {f.where}
    </a>
  ) : (
    <Link href={f.whereHref}>{f.where}</Link>
  );
}

function FeatureCard({ f }: { f: Feature }) {
  return (
    <li id={f.id} className={shelf.card}>
      <div className={shelf.cardHead}>
        <h3 className={shelf.name}>{f.name}</h3>
        {/* A byline only where the feature is somebody else's to ask about;
            the rest is the maintainer's own and says nothing, as on the shelf. */}
        {f.maintainer ? (
          <span className={shelf.by}>
            by{" "}
            {f.maintainerHref ? (
              <a href={f.maintainerHref} target="_blank" rel="noopener">
                {f.maintainer}
              </a>
            ) : (
              f.maintainer
            )}
          </span>
        ) : null}
      </div>
      <p className={shelf.summary}>{f.summary}</p>
      <dl className={styles.facts}>
        <dt>Needs</dt>
        <dd>{f.needs.length ? f.needs.join("; ") : "A panel, nothing more."}</dd>
        <dt>Where</dt>
        <dd>
          <Where f={f} />
        </dd>
      </dl>
      <div className={shelf.detailLinks}>
        {f.links.map((l) =>
          l.href.startsWith("http") ? (
            <a key={l.href} href={l.href} target="_blank" rel="noopener">
              {l.label}
            </a>
          ) : (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ),
        )}
      </div>
    </li>
  );
}

export default function FeaturesPage() {
  return (
    <main className={shelf.page}>
      <div className={shelf.doc}>
        <header className={shelf.head}>
          <Link href="/" className={shelf.brand}>
            Patternflow
          </Link>
          <h1 className={shelf.title}>Features</h1>
          <p className={shelf.lede}>
            Everything a panel does beyond showing patterns is a feature: a
            piece of firmware that attaches to the core without the core
            knowing it is there. A firmware on{" "}
            <Link href="/editions">the shelf</Link> is a composition of them.
            Here is each one on its own &mdash; what it needs, which firmware
            carries it, and a reel of it running.
          </p>
          <p className={styles.embedNote}>
            The reels are embedded from Instagram and load when scrolled to; the
            link under each opens the post there.
          </p>
        </header>

        {GROUPS.map((g) => (
          <section key={g.id} id={g.id} className={styles.group}>
            <div className={styles.groupText}>
              <h2 className={styles.groupHead}>{g.title}</h2>
              <p className={styles.groupBlurb}>{g.blurb}</p>
              <ul className={shelf.list}>
                {g.features.map((f) => (
                  <FeatureCard key={f.id} f={f} />
                ))}
              </ul>
            </div>
            <aside className={styles.reelCol}>
              {g.reel ? (
                <Reel reel={g.reel} />
              ) : (
                <p className={styles.noReel}>No reel of this one yet.</p>
              )}
            </aside>
          </section>
        ))}

        <section className={shelf.how}>
          <h2>How a feature reaches your panel</h2>
          <p>
            <strong>Three ways, and the card says which.</strong> Some of it is
            the core, in every firmware. Most of it is in a firmware on{" "}
            <Link href="/editions">the shelf</Link> &mdash; Audio carries the
            sound and MIDI features, Performance carries Simone&rsquo;s &mdash;
            and installing one is a click that keeps your patterns and
            settings. The rest is in the tree with a recipe: two files naming
            the features, and{" "}
            <a
              href="https://github.com/engmung/Patternflow/blob/main/docs/EDITIONS.md#building-an-edition"
              target="_blank"
              rel="noopener"
            >
              one command to build it
            </a>
            .
          </p>
          <h3>Making one</h3>
          <p>
            A feature is a directory and a descriptor of hooks; it adds files
            and edits none of the core&rsquo;s, so it takes every core update
            without a fight. A pull request into{" "}
            <a
              href="https://github.com/engmung/Patternflow/tree/main/firmware/patternflow/features"
              target="_blank"
              rel="noopener"
            >
              features/
            </a>{" "}
            gets it compiled by CI against every firmware and a card here; a
            feature kept in your own repository can be listed the same way,
            pointing there. The guide is{" "}
            <a
              href="https://github.com/engmung/Patternflow/blob/main/FEATURE_GUIDE.md"
              target="_blank"
              rel="noopener"
            >
              FEATURE_GUIDE.md
            </a>
            , and <Link href="/contact">telling me about it</Link> works too.
          </p>
        </section>

        <h2 className={shelf.sectionHead}>In the tree, in no firmware</h2>
        <p className={shelf.sectionNote}>
          Tried, and left where it stopped. Listed so that nobody starts it
          twice without knowing why it stopped.
        </p>
        <ul className={styles.treeList}>
          {IN_THE_TREE.map((f) => (
            <li key={f.id} id={f.id}>
              <span className={styles.treeName}>{f.name}</span>
              <p className={styles.treeSummary}>{f.summary}</p>
              <div className={shelf.detailLinks}>
                {f.links.map((l) => (
                  <a key={l.href} href={l.href} target="_blank" rel="noopener">
                    {l.label}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
