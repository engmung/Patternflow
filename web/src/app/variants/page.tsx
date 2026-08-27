import type { Metadata } from "next";
import Link from "next/link";
import styles from "./Variants.module.css";
import VariantCard from "./VariantCard";
import { VARIANTS, CORE_NOTE, CORE_ALSO } from "./variants-data";

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

        <section className={styles.core}>
          <span className={styles.coreTag}>You are probably running this</span>
          <p className={styles.coreBody}>{CORE_NOTE}</p>
          <p className={styles.coreAlso}>{CORE_ALSO}</p>
        </section>

        <h2 className={styles.sectionHead}>The shelf</h2>
        {VARIANTS.length === 0 ? (
          <p className={styles.shelfNote}>
            <em>There are no variants yet.</em> The seam they plug into is
            built and in the firmware, but nobody has published one, and this
            page is not going to list firmwares that do not exist or name
            people who have not agreed to maintain them. When somebody does,
            they go here. Until then the rest of this page is the useful part:
            what a variant is, what it has to promise you, and how you would
            move to one and back.
          </p>
        ) : null}
        <ul className={styles.list}>
          {VARIANTS.map((v) => (
            <VariantCard key={v.id} variant={v} />
          ))}
        </ul>

        <section className={styles.how}>
          <h2>Moving between them</h2>

          <p>
            One click above, if the image is served from here. Otherwise
            download the maintainer&rsquo;s <code>.bin</code> and drop it on
            your panel&rsquo;s <code>/update</code> page &mdash; the same way a
            core update works.
          </p>
          <p>
            <strong>You keep everything.</strong> Your patterns, your Wi-Fi
            networks, your settings. An update rewrites the program only.
          </p>
          <p>
            <strong>You can always come back.</strong> A core <code>.bin</code>
            from <Link href="/update">patternflow.work/update</Link>, the same
            way. A firmware you cannot leave is not a variant, it is a fork,
            and it does not go on this page.
          </p>
          <p>
            Console pages appear and disappear with whatever the firmware
            actually has &mdash; it asks the device rather than assuming.
            Patterns are the exception by design: every variant runs the same
            community <code>.pfm</code> modules, so your library works
            everywhere.
          </p>

          <h3>Building one</h3>
          <p>
            A variant is a few directories and one file saying which of them
            this firmware has. It adds files; it never edits core ones, which
            is what lets it take a core update without a merge fight.{" "}
            <a
              href="https://github.com/engmung/patternflow-audio"
              target="_blank"
              rel="noopener"
            >
              patternflow-audio
            </a>{" "}
            is meant to be read as the example, and{" "}
            <a
              href="https://github.com/engmung/Patternflow/blob/main/docs/rfc-core-and-variants.md"
              target="_blank"
              rel="noopener"
            >
              the RFC
            </a>{" "}
            has the rules &mdash; all of them about not stranding the person
            holding the hardware.
          </p>
          <p>
            To get listed, open a pull request adding your entry to{" "}
            <a
              href="https://github.com/engmung/Patternflow/blob/main/web/src/app/variants/variants-data.ts"
              target="_blank"
              rel="noopener"
            >
              <code>variants-data.ts</code>
            </a>
            , or <Link href="/contact">get in touch</Link>. Somebody reads it
            before it goes up.
          </p>
        </section>
      </div>
    </main>
  );
}
