import type { Metadata } from "next";
import Link from "next/link";
import styles from "./Variants.module.css";
import VariantCard from "./VariantCard";
import { VARIANTS } from "./variants-data";

// /variants — the shelf.
//
// The firmware is being split: a small core that has to keep working, and
// variants around it that carry the things not everybody wants. That split
// only helps anyone if the variants can be found, so this page is part of the
// split rather than a nice-to-have — see docs/rfc-core-and-variants.md §2.7.
//
// Deliberately a hand-curated list with no listing process. It is short, and
// its whole value is that a person looked before putting a name on it.
//
// The console links here, and a device that is running a variant says so on
// its own home page. Nothing here is mirrored or re-hosted: every download
// link points at that maintainer's own releases.

export const metadata: Metadata = {
  title: "Firmware variants / Patternflow",
  description:
    "Patternflow core is the firmware that has to keep working. A variant adds what not everyone wants, and you move between firmwares over Wi-Fi without losing your patterns or settings. No variants exist yet — this is what one would be, and how to build one.",
  alternates: { canonical: "/variants" },
};

export const dynamic = "force-static";

export default function VariantsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.doc}>
        <header className={styles.head}>
          <Link href="/" className={styles.brand}>
            Patternflow
          </Link>
          <h1 className={styles.title}>Firmware variants</h1>
          <p className={styles.lede}>
            One panel, more than one firmware. Core is the one that has to keep
            working; a variant adds what not everyone wants. You can move
            between them over Wi-Fi, and your patterns, Wi-Fi networks and
            settings come with you.
          </p>
        </header>

        <ul className={styles.list}>
          {VARIANTS.map((v) => (
            <VariantCard key={v.id} variant={v} />
          ))}

          {/* An empty slot, on purpose. A list of things somebody else made
              reads as a catalogue; a list with a gap at the end reads as a
              place where things keep arriving, and the difference is whether
              anyone thinks to build one. */}
          <li className={styles.makeCard}>
            <span className={styles.plus} aria-hidden="true">
              +
            </span>
            <div>
              <h3 className={styles.name}>Make your own</h3>
              <p className={styles.makeBody}>
                A few directories and one file saying which of them your
                firmware has. It adds files; it never edits core ones, so it
                can take a core update without a fight.
              </p>
              <p className={styles.makeBody}>
                Made one? It goes on this shelf. Open a pull request, or just{" "}
                <Link href="/contact">tell me about it</Link> &mdash; there is
                no process yet and this is early days, so whichever is easier
                for you is the right one.
              </p>
              <div className={styles.detailLinks}>
                <a
                  href="https://github.com/engmung/patternflow-audio"
                  target="_blank"
                  rel="noopener"
                >
                  Read the example
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
        </ul>

        <section className={styles.how}>
          <h2>What switching costs you</h2>
          <p>
            <strong>Nothing.</strong> Your patterns, your Wi-Fi networks, your
            settings &mdash; an update rewrites the program only. And every
            firmware on this shelf can be left again the same way you arrived,
            which is the one rule that gets you listed. A firmware you cannot
            leave is a fork, not a variant.
          </p>
        </section>

      </div>
    </main>
  );
}
