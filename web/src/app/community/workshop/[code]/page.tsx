import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { communityEnabled } from "@/lib/community/db";
import { formatSince } from "@/lib/community/workshop";
import {
  countPosts,
  getTerritoryByCode,
  listPosts,
  listTerritories,
  listTerritoryPins,
} from "@/lib/community/queries";
import NewThreadButton from "@/components/community/NewThreadButton";
import styles from "@/components/community/Community.module.css";

// Every thread in one territory. The workshop drawer shows the first six —
// this is where "all 23" goes, and it pages, because twenty text rows at a
// time is plenty and a pager is honest furniture for an archive.

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type RouteParams = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata(props: RouteParams): Promise<Metadata> {
  if (!communityEnabled()) return {};
  const { code } = await props.params;
  const territory = await getTerritoryByCode(code);
  if (!territory) return {};
  return {
    title: `${territory.code} ${territory.title} / Patternflow Community`,
    description: territory.description ?? `Threads in ${territory.title}.`,
  };
}

export default async function TerritoryPage(props: RouteParams) {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const { code } = await props.params;
  const territory = await getTerritoryByCode(code);
  if (!territory) notFound();

  const { page: rawPage } = await props.searchParams;
  const page = Math.max(0, Number.parseInt(rawPage ?? "0", 10) || 0);

  const [threads, total, pins, territories] = await Promise.all([
    listPosts({ territoryId: territory.id, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    countPosts(territory.id),
    listTerritoryPins(territory.id),
    // The new-thread modal's territory select.
    listTerritories(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** One line of the body for the list, with newlines flattened. */
  const preview = (body: string) => {
    const flat = body.replace(/\s+/g, " ").trim();
    return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
  };

  return (
    <div className={styles.discussionWrap}>
      <Link href={`/community/workshop?z=${territory.code}`} className={styles.backLink}>
        ← The workshop
      </Link>

      <div className={styles.drawerHead}>
        <span className={styles.drawerCode}>{territory.code}</span>
        <span className={styles.drawerTitle}>{territory.title}</span>
        <span className={styles.drawerCounts}>
          {territory.pinCount} working · {total} thread{total === 1 ? "" : "s"}
        </span>
        <span className={styles.headerSpacer} />
        <NewThreadButton territories={territories} initialCode={territory.code} />
      </div>

      {territory.description && <p className={styles.sectionLede}>{territory.description}</p>}

      {pins.length > 0 && (
        <div className={styles.workingRow}>
          <span className={styles.workingLabel}>Working here</span>
          {pins.map((pin) => (
            <span key={pin.userId} className={styles.workingChip}>
              <i aria-hidden="true" />@{pin.displayUsername ?? pin.username ?? "unknown"}
              {pin.note && ` · ${pin.note}`}
              {` · since ${formatSince(pin.createdAt.toISOString())}`}
            </span>
          ))}
        </div>
      )}

      {threads.length === 0 ? (
        <div className={styles.emptyPanel}>
          <span className={styles.emptyKicker}>
            {territory.code} · no threads
          </span>
          <span className={styles.emptyTitle}>Nothing written down yet.</span>
          <span className={styles.emptyBody}>
            Threads are where this direction gets worked out in the open — what you tried, what
            happened, what you need. Pin yourself on the workshop page, or start the first one.
          </span>
        </div>
      ) : (
        <ul className={styles.postList}>
          {threads.map((thread) => (
            <li key={thread.id} className={styles.postRow}>
              <Link
                href={`/community/workshop/${territory.code.toLowerCase()}/t/${thread.id}`}
                className={styles.postRowLink}
              >
                <span className={styles.postRowTitle}>
                  {thread.pinned && <span className={styles.noticeChip}>Notice</span>}
                  {thread.title}
                  {thread.commentCount > 0 && (
                    <span className={styles.postRowCount}>{thread.commentCount}</span>
                  )}
                </span>
                <span className={styles.postRowPreview}>{preview(thread.body)}</span>
              </Link>
              <div className={styles.postRowMeta}>
                <Link
                  href={`/community/u/${thread.username ?? ""}`}
                  className={styles.commentAuthor}
                >
                  @{thread.displayUsername ?? thread.username ?? "unknown"}
                </Link>
                <span className={styles.commentDate}>
                  {thread.createdAt.toISOString().slice(0, 10)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className={styles.paginationBar}>
          <Link
            className={styles.pageBtn}
            href={
              page > 0
                ? `/community/workshop/${territory.code.toLowerCase()}?page=${page - 1}`
                : "#"
            }
            aria-disabled={page === 0}
            data-disabled={page === 0}
            scroll={false}
          >
            ◀ Prev
          </Link>
          <span className={styles.pageIndicator}>
            Page <strong>{page + 1}</strong> of {totalPages}
            <span className={styles.pageMetaTotal}>({total} threads)</span>
          </span>
          <Link
            className={styles.pageBtn}
            href={
              page < totalPages - 1
                ? `/community/workshop/${territory.code.toLowerCase()}?page=${page + 1}`
                : "#"
            }
            aria-disabled={page >= totalPages - 1}
            data-disabled={page >= totalPages - 1}
            scroll={false}
          >
            Next ▶
          </Link>
        </div>
      )}
    </div>
  );
}
