import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { communityEnabled } from "@/lib/community/db";
import { getAuth } from "@/lib/community/auth";
import { getUserByUsername, listPatternsByUser } from "@/lib/community/queries";
import { toCardItem } from "@/lib/community/serialize";
import PatternCard from "@/components/community/PatternCard";
import styles from "@/components/community/Community.module.css";

// A person's shared patterns. Unlike the feed — which is one fixed row — a
// profile is a normal scrolling list: it is a complete archive, not a browse
// surface, so wrapping and scrolling are the right behaviour here.

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ username: string }> };

export async function generateMetadata(props: RouteParams): Promise<Metadata> {
  if (!communityEnabled()) return {};
  const { username } = await props.params;
  const profile = await getUserByUsername(username.toLowerCase());
  if (!profile) return {};
  const handle = profile.displayUsername ?? profile.username;
  return {
    title: `@${handle} / Patternflow Community`,
    description: `LED matrix patterns shared by @${handle}.`,
  };
}

export default async function CommunityUserPage(props: RouteParams) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const { username } = await props.params;
  const profile = await getUserByUsername(username.toLowerCase());
  if (!profile) notFound();

  const items = (await listPatternsByUser(profile.id)).map(toCardItem);

  const session = await getAuth().api.getSession({ headers: await headers() });
  const isSelf = session?.user.id === profile.id;

  const handle = profile.displayUsername ?? profile.username;
  const hardwareReady = items.filter((item) => item.hasCpp).length;
  const totalLikes = items.reduce((sum, item) => sum + item.likeCount, 0);
  const totalForks = items.reduce((sum, item) => sum + item.forkCount, 0);

  const stats = [
    `${items.length} ${items.length === 1 ? "pattern" : "patterns"}`,
    hardwareReady > 0 ? `${hardwareReady} hardware ready` : null,
    totalLikes > 0 ? `♥ ${totalLikes}` : null,
    totalForks > 0 ? `⑂ ${totalForks}` : null,
    `joined ${profile.createdAt.toISOString().slice(0, 10)}`,
  ].filter(Boolean) as string[];

  return (
    <div className={styles.profilePage}>
      <header className={styles.profileHeader}>
        <div>
          <h1 className={styles.profileName}>
            @{handle}
            {isSelf && <span className={styles.selfChip}>you</span>}
          </h1>
          <p className={styles.profileMeta}>{stats.join(" · ")}</p>
        </div>
        <span className={styles.headerSpacer} />
        {isSelf && (
          <Link href="/pattern-lab" className={styles.btnAccent}>
            Make one in Pattern Lab
          </Link>
        )}
      </header>

      {items.length === 0 ? (
        <div className={styles.empty}>
          {isSelf
            ? "You haven't shared anything yet. Make something in Pattern Lab, then hit “Share to Community”."
            : "No patterns shared yet."}
        </div>
      ) : (
        <div className={styles.profileGrid}>
          {items.map((item) => (
            <PatternCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {isSelf && items.length > 0 && (
        <p className={styles.profileFootNote}>
          Open any pattern to edit its details, attach a firmware header, or delete it.
        </p>
      )}
    </div>
  );
}
