import Link from "next/link";

const contactEmail = "contact@patternflow.work";
const instagramUrl = "https://www.instagram.com/patternflow.work/";

const partnershipRows = [
  {
    index: "01",
    title: "Specification & distribution",
    description:
      "Small-batch wholesale and project specification for LED designers, interior studios, retailers, and curated maker shops.",
    active: true,
  },
  {
    index: "02",
    title: "Installations & integrations",
    description:
      "Standalone instrument, embedded in an interactive environment, or a control surface for displays beyond the built-in panel.",
  },
  {
    index: "03",
    title: "Networked & custom AV",
    description:
      "Streaming to larger surfaces and custom interfaces with existing AV systems. Explored on a custom basis.",
  },
];

const statusRows = [
  {
    index: "01",
    title: "Now in pre-launch on Crowd Supply",
    description:
      "The open-source files are live, and the fully assembled product is in pre-launch on Crowd Supply. Subscribe there to be notified when the campaign opens.",
    active: true,
  },
  {
    index: "02",
    title: "Distribution conversations open",
    description:
      "Retailers, maker shops, studios, and project specifiers can get in touch before the first batch lands.",
    active: true,
  },
  {
    index: "03",
    title: "Longer horizons welcome",
    description:
      "Early conversations can still shape what the next Patternflow becomes.",
  },
];

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
            <h1>Partnerships.</h1>
            <p>
              Open source, built solo, but open to working with galleries,
              studios, retailers, and brand activation crews.
            </p>
          </div>
          <a className="business-contact-link" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
        </header>

        <div className="business-intro-grid">
          <p>
            A few conversations are already underway. Here is what those tend to
            look like, where the project is right now, and how to reach out.
          </p>
          <p>
            Most partnership conversations move at a calm pace. If your project
            has a longer horizon, this is a good moment to be in touch. Early
            conversations shape what comes next.
          </p>
        </div>

        <div className="business-decks">
          <section className="pf-block">
            <div className="pf-head">
              <span className="pf-kicker">Three ways to work together</span>
              <span className="pf-count">Open</span>
            </div>
            {partnershipRows.map((row) => (
              <div className={`pf-row${row.active ? " on" : ""}`} key={row.index}>
                <span className="pf-ghost">{row.index}</span>
                <div className="pf-row-t">{row.title}</div>
                <div className="pf-row-d">{row.description}</div>
              </div>
            ))}
          </section>

          <section className="pf-block">
            <div className="pf-head">
              <span className="pf-kicker">Where Patternflow is</span>
              <span className="pf-count">2026</span>
            </div>
            {statusRows.map((row) => (
              <div className={`pf-row${row.active ? " on" : ""}`} key={row.index}>
                <span className="pf-ghost">{row.index}</span>
                <div className="pf-row-t">{row.title}</div>
                <div className="pf-row-d">{row.description}</div>
              </div>
            ))}
          </section>
        </div>

        <section className="business-contact-block">
          <span className="pf-kicker">Get in touch</span>
          <p>
            Patternflow is based in Hongdae, Seoul. Korean and English both
            welcome.
          </p>
          <div className="business-contact-links">
            <a className="business-email" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
            <a className="business-email" href={instagramUrl} target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
          </div>
          <div className="pf-mono">Usually answered within a few days</div>
        </section>
      </section>
    </main>
  );
}
