import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { communityEnabled, communityHomeUrl } from "@/lib/community/db";
import { countOpenReports, countUnreadNotifications } from "@/lib/community/queries";
import AuthStatus from "@/components/community/AuthStatus";
import CommunityNav from "@/components/community/CommunityNav";
import DeckDock from "@/components/community/DeckDock";
import DeckPanel from "@/components/community/DeckPanel";
import MobileTabBar from "@/components/community/MobileTabBar";
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

  // Moderators get one extra nav entry with the size of the queue on it. Every
  // other visitor gets no hint that a queue exists.
  const session = await getAuth().api.getSession({ headers: await headers() });
  const isAdmin = isAdminSession(session);
  const openReports = isAdmin ? await countOpenReports() : 0;
  // Read fresh on every page load — that is the whole notification system's
  // idea of "delivery" on a server-rendered site.
  const unread = session ? await countUnreadNotifications(session.user.id) : 0;
  const username =
    (session?.user as { username?: string } | undefined)?.username ?? null;

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.pageHeader}>
          <div className={styles.brandBlock}>
            <Link href="/" className={styles.brand}>
              Patternflow
            </Link>
            <Link href="/community" className={styles.pageTitle}>
              Community
            </Link>
          </div>
          <CommunityNav isAdmin={isAdmin} openReports={openReports} />
          <div className={styles.headerSpacer} />
          <nav className={styles.headerNav}>
            {/* One CTA, not two. Publishing happens in Pattern Lab — there is
                no separate "share" flow here — so the link that makes and the
                link that publishes are the same button. Signed out it drops to
                a plain link: an account is for KEEPING things, and nothing on
                the way to the editor needs one. */}
            {session ? (
              <Link
                href="/pattern-lab"
                className={styles.makeCta}
                title="Open Pattern Lab — make a pattern and publish it here"
              >
                Make<span className={styles.ctaRest}> &amp; publish — Pattern Lab</span> ↗
              </Link>
            ) : (
              <Link href="/pattern-lab" title="Open Pattern Lab editor">
                Pattern Lab ↗
              </Link>
            )}
            <DeckPanel />
            {session && (
              <Link
                href="/community/notifications"
                className={styles.notifyLink}
                data-unread={unread > 0}
                title="Comments on your work, forks, ports, and decks your patterns joined"
              >
                Alerts{unread > 0 ? ` ${unread}` : ""}
              </Link>
            )}
            <AuthStatus />
          </nav>
        </header>

        <div className={styles.pageBody}>{children}</div>

        <footer className={styles.pageFooter}>
          <Link href="/terms">Terms &amp; Privacy</Link>
          <span>·</span>
          <a href="mailto:contact@patternflow.work">Report something</a>
        </footer>

        {/* The deck is assembled while browsing, so it stays on screen while
            you browse. Desktop only — a phone's bottom edge belongs to the
            tab bar, and the header chip carries the count there. It hides
            itself (spacer included) on surfaces with no patterns on them. */}
        <DeckDock />
        <MobileTabBar username={username} />
      </div>
    </main>
  );
}
