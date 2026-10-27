import Link from "next/link";
import type { Metadata } from "next";
import styles from "@/components/community/Community.module.css";

// A pattern, deck or profile page calls notFound() for a row that is gone and
// for one its owner made private (a 404, not a 403, so the id is never
// confirmed). Without this file those links fell through to the site's root
// 404, which drops the community header and tabs and links to the landing
// page. Here the layout stays around it and the way on is the wall.

export const metadata: Metadata = {
  title: "Not found / Patternflow Community",
};

export default function CommunityNotFound() {
  return (
    <div className={styles.emptyPanel}>
      <span className={styles.emptyKicker}>404 · not here</span>
      <h1 className={styles.emptyTitle}>Nothing at this address.</h1>
      <p className={styles.emptyBody}>
        Whatever was here has been deleted, or its owner made it private. A mistyped link
        lands here too.
      </p>
      <Link href="/community/patterns" className={styles.emptyCta}>
        Browse patterns →
      </Link>
    </div>
  );
}
