"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Community.module.css";

// Navigation for a phone. The desktop header puts the section nav under the
// wordmark; a phone has neither the width nor the hover, so the four places
// you can be move to the bottom edge where a thumb reaches them.
//
// The glyphs are drawn from the same squares the rest of the community is made
// of — bars for a running order, an outlined panel for a pattern, a rotated
// one for the board, a filled one for you.

const TABS = [
  {
    href: "/community/decks",
    label: "Decks",
    match: (path: string) =>
      path.startsWith("/community/decks") || path.startsWith("/community/d/"),
    glyph: "bars",
  },
  {
    href: "/community/patterns",
    label: "Patterns",
    match: (path: string) =>
      path === "/community" ||
      path.startsWith("/community/patterns") ||
      path.startsWith("/community/p/"),
    glyph: "square",
  },
  {
    href: "/community/workshop",
    label: "Workshop",
    match: (path: string) =>
      path.startsWith("/community/workshop") || path.startsWith("/community/t/"),
    glyph: "diamond",
  },
] as const;

function Glyph({ kind }: { kind: string }) {
  if (kind === "bars") {
    return (
      <span className={styles.tabGlyphBars} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (kind === "diamond") return <span className={styles.tabGlyphDiamond} aria-hidden="true" />;
  if (kind === "fill") return <span className={styles.tabGlyphFill} aria-hidden="true" />;
  return <span className={styles.tabGlyphSquare} aria-hidden="true" />;
}

export default function MobileTabBar({ username }: { username: string | null }) {
  const pathname = usePathname() ?? "";

  // Signed out there is no "you" to go to, so the slot points at the sign-in
  // surface people already know — their own profile URL does not exist yet.
  const youHref = username ? `/community/u/${username}` : "/community";
  const youActive = username ? pathname === `/community/u/${username}` : false;

  return (
    <nav className={styles.tabBar} aria-label="Community sections">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          data-active={tab.match(pathname)}
          aria-current={tab.match(pathname) ? "page" : undefined}
        >
          <Glyph kind={tab.glyph} />
          {tab.label}
        </Link>
      ))}
      <Link href={youHref} data-active={youActive} aria-current={youActive ? "page" : undefined}>
        <Glyph kind="fill" />
        You
      </Link>
    </nav>
  );
}
