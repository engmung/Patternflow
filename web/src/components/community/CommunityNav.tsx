"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Community.module.css";

// Which half of the community you are in. Two surfaces that look nothing alike
// — a wall of live previews, and a list of text — so without this the header is
// the only thing telling you where you landed.

const SECTIONS = [
  {
    href: "/community/patterns",
    label: "Patterns",
    // The home page is the wall with a marquee over it, and a profile is a
    // list of somebody's patterns — both belong under this heading.
    match: (path: string) =>
      path === "/community" ||
      path.startsWith("/community/patterns") ||
      path.startsWith("/community/p/") ||
      path.startsWith("/community/u/"),
  },
  {
    href: "/community/decks",
    label: "Decks",
    match: (path: string) =>
      path.startsWith("/community/decks") || path.startsWith("/community/d/"),
  },
  {
    href: "/community/workshop",
    label: "Workshop",
    // Threads live inside a territory, so a thread page is still the map.
    match: (path: string) =>
      path.startsWith("/community/workshop") || path.startsWith("/community/t/"),
  },
  {
    href: "/community/atlas",
    label: "Atlas",
    // The other map: workshop charts the hardware's directions, this charts
    // pattern-technique space — with a generation prompt on every point.
    match: (path: string) => path.startsWith("/community/atlas"),
  },
];

export default function CommunityNav({
  isAdmin = false,
  openReports = 0,
}: {
  isAdmin?: boolean;
  openReports?: number;
}) {
  const pathname = usePathname() ?? "";

  return (
    <nav className={styles.sectionNav} aria-label="Community sections">
      {SECTIONS.map((section) => {
        const active = section.match(pathname);
        return (
          <Link
            key={section.href}
            href={section.href}
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            {section.label}
          </Link>
        );
      })}
      {/* Moderators only, and only worth a slot in the nav because an unread
          queue is the one thing here that goes stale by being ignored. */}
      {isAdmin && (
        <>
          <Link
            href="/community/reports"
            data-active={pathname.startsWith("/community/reports")}
            aria-current={pathname.startsWith("/community/reports") ? "page" : undefined}
          >
            Reports{openReports > 0 ? ` (${openReports})` : ""}
          </Link>
          <Link
            href="/community/featured"
            data-active={pathname.startsWith("/community/featured")}
            aria-current={pathname.startsWith("/community/featured") ? "page" : undefined}
            title="Choose the patterns across the top of the community home page"
          >
            Marquee
          </Link>
          <Link
            href="/community/territories"
            data-active={pathname.startsWith("/community/territories")}
            aria-current={pathname.startsWith("/community/territories") ? "page" : undefined}
            title="Draw the directions the workshop is made of"
          >
            Territories
          </Link>
        </>
      )}
    </nav>
  );
}
