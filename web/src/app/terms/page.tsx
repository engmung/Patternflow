import type { Metadata } from "next";
import Link from "next/link";
import styles from "./Terms.module.css";

// Terms of use + privacy notice, deliberately as one page. Two documents means
// two things to keep in sync, and a solo-run community will keep one honest
// long before it keeps two.
//
// Written to be read, not to be survived. Every clause here exists because
// something in the product needs it — the hosting grant covers what the site
// actually does with a pattern (render it, thumbnail it, compile it), and the
// retention numbers match what the code actually stores.

export const metadata: Metadata = {
  title: "Terms & Privacy / Patternflow",
  description:
    "Terms of use and privacy notice for the Patternflow community: who owns what, what we do with your patterns, how to report something, and what data we keep.",
};

const UPDATED = "29 July 2026";
const CONTACT = "contact@patternflow.work";

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <article className={styles.doc}>
        <header className={styles.head}>
          <Link href="/" className={styles.brand}>
            Patternflow
          </Link>
          <h1>Terms &amp; Privacy</h1>
          <p className={styles.updated}>Last updated {UPDATED}</p>
        </header>

        <p className={styles.lede}>
          This covers the Patternflow community — publishing patterns, commenting, and the
          accounts behind both. The short version: <strong>your patterns stay yours</strong>, you
          choose their licence, we host and display them, and we can remove things that break
          these terms.
        </p>

        <section>
          <h2>1. Who runs this</h2>
          <p>
            Patternflow is operated by Seunghun Lee, an individual based in the Republic of Korea.
            Contact: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </section>

        <section>
          <h2>2. Your account</h2>
          <ul>
            <li>You need an account to publish, comment, or report. Browsing needs nothing.</li>
            <li>
              An account is a username and a password. An email address is optional and is only
              ever used to help you recover access — we send no marketing, and we never verify it.
            </li>
            <li>You are responsible for what happens under your account. Keep the password to yourself.</li>
            <li>You must be old enough to enter into this agreement where you live.</li>
          </ul>
        </section>

        <section>
          <h2>3. Your patterns stay yours</h2>
          <p>
            You keep the copyright in everything you publish. There is no copyright assignment and
            no contributor licence agreement.
          </p>
          <p>
            When you publish, you choose the licence the public gets — currently{" "}
            <strong>CC&nbsp;BY-SA&nbsp;4.0</strong> (the default) or <strong>CC&nbsp;BY&nbsp;4.0</strong>.
            Both let anyone use and adapt your work, including commercially, as long as they credit
            you; CC BY-SA additionally requires their versions to carry the same licence. That
            choice is a licence to the world, and{" "}
            <strong>a licence once given cannot be taken back</strong> — deleting a pattern stops us
            distributing it, but it does not undo anyone&apos;s existing rights.
          </p>
          <p>
            See the <a href="https://github.com/engmung/Patternflow/blob/main/docs/LICENSE-SUMMARY.md">
              licence summary
            </a>{" "}
            for how this fits with the rest of the project.
          </p>
        </section>

        <section>
          <h2>4. What you let us do</h2>
          <p>
            So that the site can function, you grant Patternflow a non-exclusive, worldwide,
            royalty-free licence to host, store, display, and transmit what you publish, and to:
          </p>
          <ul>
            <li>render it in the browser preview and generate thumbnail images from it,</li>
            <li>compile it into firmware images and loadable pattern modules on request,</li>
            <li>distribute those build artifacts to the person who asked for them,</li>
            <li>show excerpts of it in listings, search results, and link previews.</li>
          </ul>
          <p>
            This licence exists only to run the service and ends when you remove the content,
            except for copies already distributed and for backups that age out normally. It does
            not let us sell your work or licence it to anyone else.
          </p>
        </section>

        <section>
          <h2>5. What you promise</h2>
          <p>By publishing something here you confirm that:</p>
          <ul>
            <li>you made it, or you otherwise have the right to publish it under the licence you chose,</li>
            <li>it does not infringe anyone else&apos;s copyright, trademark, or other rights,</li>
            <li>
              if it is a fork, you have kept the original author&apos;s credit — the site writes this
              into the source for you, and removing it is a breach of the upstream licence, not just
              of these terms,
            </li>
            <li>
              it contains no code intended to damage, mislead, or take control of anyone&apos;s device
              or browser.
            </li>
          </ul>
        </section>

        <section>
          <h2>6. What is not allowed</h2>
          <ul>
            <li>Publishing work that is not yours to publish.</li>
            <li>Malicious code, or anything designed to break other people&apos;s hardware.</li>
            <li>Harassment, abuse, or content that is unlawful where it is read.</li>
            <li>Bulk-publishing low-effort output to flood the feed.</li>
            <li>Automated scraping or requests that degrade the service for everyone else.</li>
          </ul>
        </section>

        <section>
          <h2>7. Reporting something</h2>
          <p>
            Every pattern, deck, post and comment has a <strong>Report</strong> control. If you are not a
            member — a rights holder sending a takedown notice, for example — email{" "}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Please include a link to the content, what
            is wrong with it, and for a copyright claim a link to the original and enough contact
            detail for us to reply.
          </p>
          <p>
            Reports are read by a person. We may remove content, and we keep a record of reports so
            that repeated problems from the same account are visible. Accounts that repeatedly
            infringe other people&apos;s rights will be suspended.
          </p>
        </section>

        <section>
          <h2>8. Removal and account closure</h2>
          <p>
            We may remove content or suspend an account that breaks these terms. Where it is
            reasonable to do so we will say why.
          </p>
          <p>
            You can delete your own patterns, decks, firmware ports, posts and comments at any
            time. To close your account,
            email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
          <p className={styles.callout}>
            <strong>What closing your account does not do:</strong> patterns you have already
            published stay up, shown as by a deleted user, with the author credit that was written
            into the source at publication time. This is not us keeping your data — it is because
            the licence you granted is irrevocable, other people have built on those patterns, and
            deleting them would break work that is legitimately theirs. Your account details are
            removed.
          </p>
        </section>

        <section>
          <h2>9. Privacy</h2>
          <h3>What we store</h3>
          <ul>
            <li>
              <strong>Account</strong> — username, a hashed password, and an email address if you
              chose to give one. Passwords are never stored in a readable form.
            </li>
            <li>
              <strong>Sessions</strong> — a session token, plus the IP address and browser
              user-agent of the sign-in. This is for security and abuse handling, not analytics.
            </li>
            <li>
              <strong>What you publish</strong> — patterns, decks, firmware ports, comments,
              posts, likes, and build requests.
            </li>
            <li>
              <strong>Alerts</strong> — a note when someone comments on your work, forks a pattern
              of yours, or puts one in a public deck. Shown only inside the site; nothing is ever
              emailed.
            </li>
          </ul>

          <h3>How long we keep it</h3>
          <ul>
            <li>
              <strong>Sessions</strong> — deleted when they expire, and in any case within{" "}
              <strong>90 days</strong>.
            </li>
            <li>
              <strong>Firmware build artifacts</strong> — <strong>30 days</strong>. They can always
              be rebuilt.
            </li>
            <li>
              <strong>Alerts</strong> — <strong>90 days</strong>, read or unread, and sooner when
              what they point at is deleted.
            </li>
            <li>
              <strong>Account and published content</strong> — until you remove them, subject to
              section 8.
            </li>
            <li>
              <strong>Reports</strong> — kept after the reported content is gone, because that
              record is the only way a repeat problem is visible.
            </li>
          </ul>
          <p>
            These are not aspirations. A job runs daily and deletes what is past its window; the
            code is in the open, in <code>web/src/lib/community/retention.ts</code>.
          </p>

          <h3>Who else sees it</h3>
          <p>
            The community runs on hardware operated by us. We do not sell personal data and we do
            not share it with advertisers. We use privacy-respecting analytics on the main site to
            count page views; it does not identify you.
          </p>

          <h3>Your rights</h3>
          <p>
            Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> to see, correct, export, or delete
            your personal data. Depending on where you live you may have further rights under local
            law — including the Korean Personal Information Protection Act (PIPA) or the GDPR — and
            those apply regardless of anything else in this document.
          </p>
        </section>

        <section>
          <h2>10. No warranty</h2>
          <p>
            This is a free service run by one person. It is provided as-is, without warranties of
            any kind. Patterns are code written by other people: they run in a sandbox in your
            browser, but firmware you build and flash runs on your own hardware at your own risk.
          </p>
          <p>
            <strong>Patternflow is not a party to any licence between you and someone whose pattern
            you use.</strong> That licence is between the two of you, and its terms come from the
            licence the author chose.
          </p>
          <p>
            Nothing here excludes liability that cannot lawfully be excluded, including for death,
            personal injury, fraud, or wilful misconduct.
          </p>
        </section>

        <section>
          <h2>11. Photosensitivity</h2>
          <p>
            Patternflow patterns are rapidly changing light. They can trigger seizures in people
            with photosensitive epilepsy. Stop immediately if you feel unwell.
          </p>
        </section>

        <section>
          <h2>12. Changes</h2>
          <p>
            These terms will change as the community grows. Significant changes will be announced
            in the community and on <a href="https://discord.gg/Vr9QtsxeTk">Discord</a> before they
            take effect. The date at the top always reflects the current version.
          </p>
        </section>

        <section>
          <h2>13. Governing law</h2>
          <p>
            These terms are governed by the laws of the Republic of Korea, and disputes go to the
            Seoul Central District Court. If you use this service as a consumer somewhere else, you
            keep whatever mandatory protections your local law gives you — this clause does not take
            those away.
          </p>
        </section>

        <footer className={styles.foot}>
          <p>
            Questions about any of this: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
          <p>
            <Link href="/community">← Back to the community</Link>
          </p>
        </footer>
      </article>
    </main>
  );
}
