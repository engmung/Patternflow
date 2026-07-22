import { notFound } from "next/navigation";
import { communityEnabled } from "@/lib/community/db";
import { getUserByUsername, listPatternsByUser } from "@/lib/community/queries";
import { toCardItem } from "@/lib/community/serialize";
import PatternCard from "@/components/community/PatternCard";
import styles from "@/components/community/Community.module.css";

// Minimal user page: the patterns this person has shared.

export const dynamic = "force-dynamic";

export default async function CommunityUserPage(props: {
  params: Promise<{ username: string }>;
}) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const { username } = await props.params;
  const profile = await getUserByUsername(username.toLowerCase());
  if (!profile) notFound();

  const items = (await listPatternsByUser(profile.id)).map(toCardItem);

  return (
    <>
      <div className={styles.introRow}>
        <span>
          @{profile.displayUsername ?? profile.username} · {items.length} pattern
          {items.length === 1 ? "" : "s"}
        </span>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>No patterns shared yet.</div>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <PatternCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
