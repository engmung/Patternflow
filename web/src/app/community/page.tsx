import Link from "next/link";
import { communityEnabled } from "@/lib/community/db";
import { listFeed } from "@/lib/community/queries";
import { toCardItem } from "@/lib/community/serialize";
import PatternCard from "@/components/community/PatternCard";
import styles from "@/components/community/Community.module.css";

// The feed. Newest first; thumbnails are rendered client-side from the code
// itself (no image pipeline).

export const dynamic = "force-dynamic";

export default async function CommunityFeedPage() {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const items = (await listFeed()).map(toCardItem);

  return (
    <div className={styles.feedScrollArea}>
      <div className={styles.introRow}>
        <span>
          Patterns shared by the community — hover over any pattern to play live, scroll wheel to turn knobs!
        </span>
        <span className={styles.headerSpacer} />
        <Link href="/pattern-lab" className={styles.btnAccent}>
          Make one in Pattern Lab
        </Link>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>
          Nothing here yet. Open Pattern Lab, make something, hit “Share to Community”.
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <PatternCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
