import Link from "next/link";
import type { Metadata } from "next";
import { communityEnabled, communityHomeUrl } from "@/lib/community/db";
import AuthStatus from "@/components/community/AuthStatus";
import styles from "@/components/community/Community.module.css";

export const metadata: Metadata = {
  title: "Community / Patternflow",
  description:
    "Share LED matrix patterns, remix other people's code, and comment — the Patternflow pattern community.",
};

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  // Community pages only run where the SQLite database lives (the self-hosted
  // deployment). Everywhere else — e.g. the Vercel site — they point visitors
  // at the community host instead of crashing on a missing database.
  if (!communityEnabled()) {
    return (
      <main className={styles.page}>
        <div className={styles.notice}>
          <p>
            The pattern community lives on its own server:{" "}
            <a href={communityHomeUrl()}>{communityHomeUrl().replace(/^https?:\/\//, "")}</a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.pageHeader}>
          <Link href="/" className={styles.brand}>
            Patternflow
          </Link>
          <Link href="/community" className={styles.pageTitle}>
            Community
          </Link>
          <div className={styles.headerSpacer} />
          <nav className={styles.headerNav}>
            <Link href="/pattern-lab">Pattern Lab</Link>
            <AuthStatus />
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}
