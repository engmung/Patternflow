import Link from "next/link";

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M7.6 2h8.8A5.6 5.6 0 0 1 22 7.6v8.8a5.6 5.6 0 0 1-5.6 5.6H7.6A5.6 5.6 0 0 1 2 16.4V7.6A5.6 5.6 0 0 1 7.6 2Zm0 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm8.9 2.7a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

export default function HeroJournalLink() {
  return (
    <nav className="hero-top-links" aria-label="Patternflow pages">
      <Link href="/journal">Journal</Link>
      <Link href="/contact" className="contact-link">Contact</Link>
      <a
        href="https://www.instagram.com/patternflow.work/"
        target="_blank"
        rel="noopener noreferrer"
        className="instagram-link"
        aria-label="Patternflow Instagram"
      >
        <InstagramIcon />
      </a>
    </nav>
  );
}
