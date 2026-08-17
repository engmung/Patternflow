import type { Metadata } from "next";
import Link from "next/link";
import styles from "./Compliance.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// REGULATORY DOCUMENT — NOT A MARKETING PAGE.
//
// The printed safety information in every retail box carries the line:
//
//   "The full text of the EU declaration of conformity is available at the
//    following internet address: https://patternflow.work/compliance"
//
// That is the simplified EU declaration of conformity permitted by Article
// 10(9) + Annex VII of the Radio Equipment Directive (2014/53/EU): the URL
// stands in for the full text on paper, so the URL resolving is itself part
// of the legal requirement.
//
// Consequences for anyone editing this file:
//
//   • The path is exactly /compliance. It is already printed on paper and
//     cannot be changed. No /legal/compliance, no locale prefix, no redirect
//     — this route must answer 200 directly.
//   • English only. The readers are EU market surveillance authorities, the
//     FCC, and customs.
//   • The regulatory wording below is standard text. Fix typos; do not
//     rewrite, paraphrase, or "improve" it.
//   • It must render without JavaScript, so this stays a server component
//     with no client boundary (see `dynamic` below).
//   • Never add noindex, and never disallow it in robots. Public access is
//     the entire point.
//
// Do NOT publish here, ever:
//   • Espressif module test reports (R2111A1079-*) — under NDA. Supplying
//     them to test labs and regulators is permitted; public posting is not.
//   • Espressif module certificates — third-party documents that are not
//     ours to redistribute. The US side is covered by the FCC public
//     database link below.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Compliance / Patternflow",
  description:
    "Regulatory and compliance information for Patternflow products: EU declaration of conformity, FCC radio module certification, WEEE disposal, and manufacturer details.",
  alternates: { canonical: "/compliance" },
};

// Explicit, not incidental. This page has to be readable with JS disabled and
// has to survive a build even if the rest of the app goes dynamic around it.
export const dynamic = "force-static";

const UPDATED = "2026-08-17";
const CONTACT = "contact@patternflow.work";

// The signed declaration does not exist yet — testing is not finished. When it
// is, drop the PDF in `web/public/compliance/` and put its path here; the row
// in the Documents list turns into a link on its own.
const EU_DOC_PDF: string | null = null;

const SPECS: readonly (readonly [string, string])[] = [
  ["Product name", "Patternflow"],
  ["Model", "PATTERNFLOW-01, PATTERNFLOW-01-KIT"],
  ["Hardware version", "v3.0.0"],
  ["Radio module", "Espressif ESP32-S3-WROOM-1-N16R8"],
  ["Frequency band", "2400 – 2483.5 MHz"],
  ["Max RF power", "20 mW (13 dBm) EIRP"],
  ["Power input", "5 V DC, max 2.4 A (12 W)"],
];

export default function CompliancePage() {
  return (
    <main className={styles.page}>
      <article className={styles.doc}>
        <header className={styles.head}>
          <Link href="/" className={styles.brand}>
            Patternflow
          </Link>
          <h1>Compliance</h1>
          <p className={styles.lede}>
            Regulatory and compliance information for Patternflow products.
          </p>
        </header>

        <section>
          <h2>Product</h2>
          {/* Definition list rather than a table: it collapses to stacked rows
              on a narrow screen, so nothing scrolls sideways on a phone. */}
          <dl className={styles.specs}>
            {SPECS.map(([label, value]) => (
              <div key={label} className={styles.specRow}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2>European Union</h2>
          {/* A statement of scope, NOT a claim of conformity. Nothing has been
              declared until the testing is finished and the DoC is signed, and
              claiming otherwise in front of a market surveillance authority is
              an unsupported assertion. Once the declaration is signed, this
              becomes "Patternflow is declared in conformity with:". */}
          <p>The following EU legislation applies to Patternflow:</p>
          <ul>
            <li>Directive 2014/53/EU (Radio Equipment Directive)</li>
            <li>Directive 2011/65/EU as amended by (EU) 2015/863 (RoHS)</li>
          </ul>
          <p>
            <strong>EU Declaration of Conformity</strong> — publication pending completion of
            testing. The signed declaration will be posted on this page. For a copy in the
            meantime, contact <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>

          <h3>Documents</h3>
          <ul className={styles.docs}>
            <li className={styles.docRow}>
              {EU_DOC_PDF ? (
                <a href={EU_DOC_PDF}>EU Declaration of Conformity (PDF)</a>
              ) : (
                <>
                  <span className={styles.docName}>EU Declaration of Conformity (PDF)</span>
                  <span className={styles.docStatus}>Publication pending</span>
                </>
              )}
            </li>
          </ul>
        </section>

        <section>
          <h2>United States</h2>
          <p>This product contains an FCC-certified radio module.</p>
          <p className={styles.marking}>
            <strong>Contains FCC ID: 2AC7Z-ESPS3WROOM1</strong>
          </p>
          <p>
            Grant details are available from the FCC public database:{" "}
            <a href="https://fccid.io/2AC7Z-ESPS3WROOM1">https://fccid.io/2AC7Z-ESPS3WROOM1</a>
          </p>
          <p>
            This equipment has been tested and found to comply with the limits for a Class B
            digital device, pursuant to part 15 of the FCC Rules. The full notice is supplied with
            the product.
          </p>
        </section>

        <section>
          <h2>Disposal (WEEE)</h2>
          <p>
            Do not dispose of this product with household waste. At the end of its life, take it to
            a collection point for electrical and electronic equipment, in accordance with
            Directive 2012/19/EU.
          </p>
        </section>

        <section>
          <h2>Manufacturer</h2>
          <address className={styles.address}>
            Patternflow (SeungHun Lee)
            <br />
            5F Room C, 19 Sinchon-ro 2-gil
            <br />
            Mapo-gu, Seoul 04051, Republic of Korea
            <br />
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </address>
        </section>

        <footer className={styles.foot}>
          <p>Last updated: {UPDATED}</p>
        </footer>
      </article>
    </main>
  );
}
