import type { Metadata } from "next";
import Link from "next/link";
import styles from "./Editions.module.css";
import EditionCard from "./EditionCard";
import { EDITIONS } from "./editions-data";

const OFFICIAL = EDITIONS.filter((v) => v.tier === "official");
const COMMUNITY = EDITIONS.filter((v) => v.tier === "community");

// /editions — the shelf (was /variants until 2026-09; that URL redirects here).
//
// One panel, more than one firmware. The default is not a skeleton somebody
// builds on: it is everything, and it is what ships on the board. The others
// exist because of something the default cannot carry — a part that is not on
// the board yet, a setting that should not be universal, a build somebody
// needs to stop moving — and each card says which.
//
// Two tiers, and the distinction matters more than the list does. Official
// is what the maintainer thinks Patternflow is about - built from this
// repository, so a change to the core has to compile against all of them
// before it lands. Community is everything else: somebody else's work on
// their own terms, or something from this tree that is fun without being
// the point. The difference is not quality; it is what Patternflow is, and
// who to ask when it breaks.
//
// The console links here, and a panel running anything but the default says
// so in its own header.

export const metadata: Metadata = {
  title: "Firmware / Patternflow",
  description:
    "One panel, more than one firmware. The default does everything and is what ships on the board; the others exist for what it cannot carry. Switching takes one click over Wi-Fi and your patterns, networks and settings come with you.",
  alternates: { canonical: "/editions" },
};

export const dynamic = "force-static";

export default function EditionsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.doc}>
        <header className={styles.head}>
          <Link href="/" className={styles.brand}>
            Patternflow
          </Link>
          <h1 className={styles.title}>Firmware</h1>
          <p className={styles.lede}>
            One panel, more than one firmware. The first is what ships on the
            board and does everything; the rest exist for what it cannot carry.
            Switching is one click, and your patterns, Wi-Fi networks and
            settings come with you.
          </p>
        </header>

        <h2 className={styles.sectionHead}>Official</h2>
        <p className={styles.sectionNote}>
          What I think Patternflow is about &mdash; the firmwares I like enough
          to stand behind as the thing itself. Built from the Patternflow
          repository and published here, where a change to the core has to
          compile against every one of these before it lands.
        </p>
        <ul className={styles.list}>
          {OFFICIAL.map((v) => (
            <EditionCard key={v.id} edition={v} />
          ))}
        </ul>

        <h2 className={styles.sectionHead}>Community</h2>
        <p className={styles.sectionNote}>
          Everything else. Somebody else&rsquo;s firmware, their repository,
          their release schedule &mdash; or something from this tree that is
          good fun without being what Patternflow is for. Not a lesser thing;
          a different one, and the difference is who to ask when it breaks.
        </p>
        <ul className={styles.list}>
          {COMMUNITY.map((v) => (
            <EditionCard key={v.id} edition={v} />
          ))}
          {/* Always the last slot, however many cards sit before it. A list
              of finished things reads as a catalogue; a list with a gap at
              the end reads as a place where things keep arriving, and the
              difference is whether anybody thinks to build one. */}
          {(
            <li className={styles.makeCard}>
              <span className={styles.plus} aria-hidden="true">
                +
              </span>
              <div>
                <h3 className={styles.name}>Make your own</h3>
                <p className={styles.makeBody}>
                  A firmware of your own is two files saying which features it
                  has and what it calls itself. It adds files; it never edits
                  core ones, so it can take a core update without a fight.
                </p>
                <p className={styles.makeBody}>
                  Made one? It goes on this shelf. Open a pull request, or just{" "}
                  <Link href="/contact">tell me about it</Link> &mdash; there is
                  no process yet and this is early days, so whichever is easier
                  for you is the right one.
                </p>
                <div className={styles.detailLinks}>
                  <a
                    href="https://github.com/engmung/Patternflow/blob/main/docs/EDITIONS.md"
                    target="_blank"
                    rel="noopener"
                  >
                    How a firmware is put together
                  </a>
                  <a
                    href="https://github.com/engmung/Patternflow/blob/main/docs/rfc-core-and-variants.md"
                    target="_blank"
                    rel="noopener"
                  >
                    The rules
                  </a>
                </div>
              </div>
            </li>
          )}
        </ul>

        <section className={styles.how}>
          <h2>What switching costs you</h2>
          <p>
            <strong>Nothing.</strong> Your patterns, your Wi-Fi networks, your
            settings &mdash; an update rewrites the program only. And every
            firmware here can be left again the same way you arrived, which is
            the one rule that gets you listed. A firmware you cannot leave is a
            fork, not a firmware for this panel.
          </p>
        </section>

      </div>
    </main>
  );
}
