import { headers } from "next/headers";
import type { Metadata } from "next";
import { getAuth } from "@/lib/community/auth";
import { communityEnabled } from "@/lib/community/db";
import { listNotifications } from "@/lib/community/queries";
import NotificationsList from "@/components/community/NotificationsList";
import styles from "@/components/community/Community.module.css";

// What happened to your things while you were away: comments on your work,
// threads you joined, forks, and decks your patterns entered. Opening this
// page marks everything read (the client fires that after render — never
// during it, or a link prefetch would eat the unread state).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alerts / Patternflow Community",
  description: "Comments, forks and deck inclusions on your patterns and posts.",
};

export default async function CommunityNotificationsPage() {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return (
      <div className={styles.empty}>
        Sign in to see alerts about your patterns, posts and comments.
      </div>
    );
  }

  const items = (await listNotifications(session.user.id)).map((row) => ({
    id: row.id,
    type: row.type,
    targetType: row.targetType,
    targetId: row.targetId,
    targetTitle: row.targetTitle,
    snippet: row.snippet,
    unread: row.readAt === null,
    createdAt: row.createdAt.toISOString(),
    actor: row.actorDisplayUsername ?? row.actorUsername ?? "unknown",
    patternCode: row.patternCode,
  }));

  return (
    <>
      <div className={styles.notifyHead}>
        <h1>Alerts</h1>
        <p>Comments on your work, forks, ports, and decks your patterns joined.</p>
      </div>
      <NotificationsList items={items} />
    </>
  );
}
