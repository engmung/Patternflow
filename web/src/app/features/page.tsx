import type { Metadata } from "next";
import Link from "next/link";
import shelf from "../editions/Editions.module.css";
import ShelfTabs from "../editions/ShelfTabs";
import styles from "./Features.module.css";
import Reel from "./Reel";
import { FEATURES, HOME_LABEL, type Feature } from "./features-data";

// /features — the catalogue, as one list.
//
// The shelf (/editions) answers "which firmware do I install". This page
// answers the question underneath it: what can a panel do, one feature at
// a time. Every feature is one row — name, one line, and a tag saying where
// it is — so the whole list fits on a screen; a row opens to the paragraph,
// what it needs, which firmware carries it, the links and the reel. The reel
// is an Instagram embed that loads only when its row is opened.
//
// No headings between rows on purpose. Grouping rows under the firmwares
// that carry them would rebuild the shelf one level up and lose the reason
// features and firmwares are separate things. Where a feature lives is a
// fact on its row, not a category over it.

export const metadata: Metadata = {
  title: "Features / Patternflow",
  description:
    "What a Patternflow panel can do, one feature at a time: a microphone, audio from a browser or phone, OSC, MIDI, a clock, MQTT, sequences, the weather. What each needs, which firmware carries it, and a reel of it running.",
  alternates: { canonical: "/features" },
};

export const dynamic = "force-static";

function Where({ f }: { f: Feature }) {
  if (!f.whereHref) return <>{f.where}</>;
  return f.whereHref.startsWith("http") ? (
    <a href={f.whereHref} target="_blank" rel="noopener">
      {f.where}
    </a>
  ) : (
    <Link href={f.whereHref}>{f.where}</Link>
  );
}

function Row({ f }: { f: Feature }) {
  return (
    <li>
      <details id={f.id} className={styles.row}>
        <summary className={styles.head}>
          <span className={styles.name}>{f.name}</span>
          <span className={styles.tag} data-home={f.home}>
            {HOME_LABEL[f.home]}
          </span>
          <span className={styles.line}>{f.line}</span>
        </summary>
        <div className={styles.body}>
          <div className={styles.text}>
            {f.maintainer ? (
              <p className={shelf.by}>
                by{" "}
                <a href={f.maintainerHref} target="_blank" rel="noopener">
                  {f.maintainer}
                </a>
              </p>
            ) : null}
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
          </div>
          {f.reel ? (
            <Reel reel={f.reel} />
          ) : (
            <p className={styles.noReel}>No reel of this one yet.</p>
          )}
        </div>
      </details>
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
          <ShelfTabs active="features" />
          <p className={shelf.lede}>
            Everything a panel does beyond showing patterns is a feature: a
            piece of firmware that attaches to the core without the core
            knowing it is there. A firmware on{" "}
            <Link href="/editions">the shelf</Link> is a composition of them.
            One row each; open a row for what it needs, which firmware carries
            it, and a reel of it running.
          </p>
        </header>

        <ul className={styles.list}>
          {FEATURES.map((f) => (
            <Row key={f.id} f={f} />
          ))}
        </ul>
        <p className={styles.embedNote}>
          Reels are embedded from Instagram and load when a row is opened; the
          link under each opens the post there.
        </p>

        <section className={shelf.how}>
          <h2>How a feature reaches your panel</h2>
          <p>
            <strong>The tag on the row says which of three ways.</strong> Some
            of it is the core, in every firmware. Most of it is in a firmware
            on <Link href="/editions">the shelf</Link>, and installing one is a
            click that keeps your patterns and settings. The rest is in the
            tree with a recipe: two files naming the features, and{" "}
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
            gets it compiled by CI against every firmware and a row here; a
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
      </div>
    </main>
  );
}
