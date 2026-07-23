import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { communityEnabled, communityHomeUrl } from "@/lib/community/db";
import AuthStatus from "@/components/community/AuthStatus";
import styles from "@/components/community/Community.module.css";

export const metadata: Metadata = {
  title: "Community / Patternflow",
  description:
    "Share LED matrix patterns, remix other people's code, and comment — the Patternflow pattern community.",
};

export default async function CommunityLayout({ children }: { children: React.ReactNode }) {
  // Community pages only run where the SQLite database lives (the self-hosted
  // deployment). Everywhere else — e.g. the Vercel site — this path is just an
  // old or mistyped URL, so send the visitor straight to the community host
  // rather than parking them on a page whose only content is another link.
  if (!communityEnabled()) {
    const target = communityHomeUrl();
    let targetHost: string | null = null;
    try {
      targetHost = new URL(target).host;
    } catch {
      targetHost = null;
    }

    // Never redirect to ourselves: on a misconfigured community host (the flag
    // missing but the URL pointing here) that would be an endless loop.
    const host = (await headers()).get("host");
    if (targetHost && targetHost !== host) {
      redirect(`${target.replace(/\/+$/, "")}/community`);
    }

    return (
      <main className={styles.page}>
        <div className={styles.notice}>
          <p>
            The pattern community lives on its own server:{" "}
            <a href={target}>{target.replace(/^https?:\/\//, "")}</a>
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
          {/* No Pattern Lab link here — the feed already has a prominent
              "Make one in Pattern Lab" button, and two of them read as two
              different destinations. */}
          <nav className={styles.headerNav}>
            <AuthStatus />
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}
