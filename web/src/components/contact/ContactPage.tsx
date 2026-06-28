import Link from "next/link";

const contactEmail = "contact@patternflow.work";
const instagramUrl = "https://www.instagram.com/patternflow.work/";

export default function ContactPage() {
  return (
    <main className="business-page">
      <header className="business-head">
        <Link className="business-lockup" href="/">
          Patternflow
        </Link>
        <div className="business-meta">Contact / 2026</div>
      </header>

      <section className="business-panel">
        <header className="business-hero">
          <div>
            <h1>Get in touch.</h1>
            <p>
              Open to working with museums, galleries, and fellow artists —
              exhibitions, collaborations, and commissions are all welcome.
            </p>
          </div>
        </header>

        <section className="business-contact-block">
          <span className="pf-kicker">Reach out</span>
          <div className="business-contact-links">
            <a className="business-email" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
            <a
              className="business-email"
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram
            </a>
          </div>
        </section>
      </section>
    </main>
  );
}
