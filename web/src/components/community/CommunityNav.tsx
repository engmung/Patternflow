"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Community.module.css";

// Which half of the community you are in. Two surfaces that look nothing alike
// — a wall of live previews, and a list of text — so without this the header is
// the only thing telling you where you landed.

const SECTIONS = [
  {
    href: "/community",
    label: "Patterns",
    // A profile page is a list of somebody's patterns, so it belongs here too.
    match: (path: string) =>
      path === "/community" || path.startsWith("/community/p/") || path.startsWith("/community/u/"),
  },
  {
    href: "/community/discussions",
    label: "Discussions",
    match: (path: string) => path.startsWith("/community/discussions"),
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
        <Link
          href="/community/reports"
          data-active={pathname.startsWith("/community/reports")}
          aria-current={pathname.startsWith("/community/reports") ? "page" : undefined}
        >
          Reports{openReports > 0 ? ` (${openReports})` : ""}
        </Link>
      )}
    </nav>
  );
}
