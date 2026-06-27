import Link from "next/link";

export default function HeroJournalLink() {
  return (
    <nav className="hero-top-links" aria-label="Patternflow pages">
      <Link href="/journal">Journal</Link>
      <Link href="/contact" className="contact-link">Contact</Link>
    </nav>
  );
}
