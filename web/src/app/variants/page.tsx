import type { Metadata } from "next";
import Link from "next/link";
import styles from "./Variants.module.css";
import {
  VARIANTS,
  CORE_NOTE,
  CORE_ALSO,
  type VariantStatus,
} from "./variants-data";

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
    "Patternflow core is the firmware that has to keep working. A variant adds what not everyone wants — show sequencing, MQTT, radio tuning — and you move between them over Wi-Fi without losing your patterns or settings. Three variants are proposed; none has a maintainer yet.",
  alternates: { canonical: "/variants" },
};

export const dynamic = "force-static";

const STATUS_LABEL: Record<VariantStatus, string> = {
  available: "available",
  building: "in progress",
  proposed: "unclaimed",
};

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
        <p className={styles.shelfNote}>
          <em>Nothing here is downloadable yet.</em> Some of this code exists
          already and some of it does not; what none of it has is a person who
          has said yes. Where a name appears below it is a suggestion made in
          public &mdash; the people best placed to own each one &mdash; and
          not a commitment any of them has made. If one of them is you, the
          entry is yours to accept, correct or decline.
        </p>
        <ul className={styles.list}>
          {VARIANTS.map((v) => (
            <li key={v.id} id={v.id} className={styles.item}>
              <div className={styles.itemTop}>
                <h3 className={styles.name}>{v.name}</h3>
                <span className={styles.status} data-s={v.status}>
                  {STATUS_LABEL[v.status]}
                </span>
              </div>

              {/* On an unclaimed entry this must never read as a credit.
                  Naming someone as the maintainer of firmware they have not
                  agreed to build is the one way this page could do real harm
                  to a person, so the byline says which it is. */}
              <p className={styles.by}>
                {v.status === "proposed" ? (
                  v.maintainer ? (
                    <>
                      suggested to{" "}
                      {v.maintainerHref ? (
                        <a href={v.maintainerHref} target="_blank" rel="noopener">
                          {v.maintainer}
                        </a>
                      ) : (
                        v.maintainer
                      )}
                      {" "}&mdash; not yet agreed
                    </>
                  ) : (
                    <>nobody has taken this on</>
                  )
                ) : (
                  <>
                    by{" "}
                    {v.maintainerHref ? (
                      <a href={v.maintainerHref} target="_blank" rel="noopener">
                        {v.maintainer}
                      </a>
                    ) : (
                      v.maintainer
                    )}
                  </>
                )}
              </p>

              <p className={styles.summary}>{v.summary}</p>

              <ul className={styles.adds}>
                {v.adds.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>

              <p className={styles.note}>{v.note}</p>

              <div className={styles.links}>
                <span className={styles.idTag}>
                  reports variant: {v.id}
                </span>
                {v.releases && (
                  <a href={v.releases} target="_blank" rel="noopener">
                    Releases &rarr;
                  </a>
                )}
                {v.source && (
                  <a href={v.source} target="_blank" rel="noopener">
                    Source &rarr;
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>

        <section className={styles.how}>
          <h2>Moving between them</h2>

          <h3>Switching to a variant</h3>
          <p>
            Download that maintainer&rsquo;s firmware <code>.bin</code> from
            their own releases, open your panel&rsquo;s console, and drop it on{" "}
            <code>/update</code>. The panel flashes itself over your network
            and reboots &mdash; the same way a core update works.
          </p>

          <h3>Coming back</h3>
          <p>
            The same way, with a core <code>.bin</code> &mdash; or from{" "}
            <Link href="/update">patternflow.work/update</Link> if the
            console is not reachable. Every listed variant agrees to keep this
            route open. A firmware you cannot leave is not a variant, it is a
            fork, and it does not go on this page.
          </p>

          <h3>What you keep</h3>
          <p>
            Your Wi-Fi networks, your uploaded patterns, and the storage they
            live on. An update rewrites the program only, and listed variants
            keep those settings where core keeps them, so switching does not
            mean setting the panel up again.
          </p>

          <h3>What changes</h3>
          <p>
            Whatever that variant adds or removes &mdash; pages appear or
            disappear from the console accordingly, because the console asks
            the device what it actually has rather than assuming. Patterns are
            the exception by design: every variant runs the same community{" "}
            <code>.pfm</code> modules, so your library works everywhere.
          </p>

          <h3>Building your own</h3>
          <p>
            The rules a variant agrees to are short and all of them are about
            not stranding the person holding the hardware. They are written
            down in{" "}
            <a
              href="https://github.com/engmung/Patternflow/blob/main/docs/rfc-core-and-variants.md"
              target="_blank"
              rel="noopener"
            >
              the RFC
            </a>
            , along with the seam a variant plugs into &mdash; a variant adds
            files, it does not edit core ones, which is what lets it take a
            core update without a merge fight. To get on this shelf &mdash;
            or to claim one of the openings above &mdash; open a pull request
            adding your entry to{" "}
            <a
              href="https://github.com/engmung/Patternflow/blob/main/web/src/app/variants/variants-data.ts"
              target="_blank"
              rel="noopener"
            >
              <code>variants-data.ts</code>
            </a>
            . You write your own description; somebody still reads it before
            it goes up, because a stranger&rsquo;s binary on somebody&rsquo;s
            hardware is what this page is asking people to trust. If a pull
            request is not your thing,{" "}
            <Link href="/contact">get in touch</Link> instead.
          </p>

          <h3>Building your own console</h3>
          <p>
            The pages your panel serves are ordinary HTML files in the
            firmware repository, not markup buried in C++, and they come with
            a mock device so you can open them in a browser and edit them with
            devtools &mdash; no panel, no toolchain, no flashing. Everything
            they do goes through the same <code>/api/</code> endpoints, so a
            console you write yourself has exactly as much reach as the one
            that ships. Start at{" "}
            <a
              href="https://github.com/engmung/Patternflow/blob/main/firmware/patternflow/console/README.md"
              target="_blank"
              rel="noopener"
            >
              firmware/patternflow/console
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
