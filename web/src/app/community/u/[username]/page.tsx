import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { communityEnabled } from "@/lib/community/db";
import { getAuth } from "@/lib/community/auth";
import {
  getUserByUsername,
  likedPatternIds,
  listDecksByUser,
  listPatternsByUser,
} from "@/lib/community/queries";
import { toCardItem, toDeckCardItem } from "@/lib/community/serialize";
import DeckCard from "@/components/community/DeckCard";
import PatternCard from "@/components/community/PatternCard";
import SignOutLink from "@/components/community/SignOutLink";
import { isAdminUsername } from "@/lib/community/admin";
import { PUBLIC_DECKS_MAX } from "@/lib/community/deck";
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

  const session = await getAuth().api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;
  const isSelf = viewerId === profile.id;

  // The owner sees their whole archive, badges marking what is not public;
  // visitors see the public rows only. Same rule for patterns and decks.
  const profileRows = await listPatternsByUser(profile.id, viewerId);
  const likedIds = await likedPatternIds(viewerId, profileRows.map((row) => row.id));
  const items = profileRows.map((item) => toCardItem(item, likedIds));
  const deckItems = (await listDecksByUser(profile.id, viewerId)).map(toDeckCardItem);

  const handle = profile.displayUsername ?? profile.username;
  const hardwareReady = items.filter((item) => item.hasCpp).length;
  const totalLikes = items.reduce((sum, item) => sum + item.likeCount, 0);
  const totalForks = items.reduce((sum, item) => sum + item.forkCount, 0);

  const stats = [
    `${items.length} ${items.length === 1 ? "pattern" : "patterns"}`,
    hardwareReady > 0 ? `${hardwareReady} hardware ready` : null,
    totalLikes > 0 ? `LIK ${String(totalLikes).padStart(2, "0")}` : null,
    totalForks > 0 ? `FRK ${String(totalForks).padStart(2, "0")}` : null,
    `joined ${profile.createdAt.toISOString().slice(0, 10)}`,
  ].filter(Boolean) as string[];

  const publicDecks = deckItems.filter((deck) => deck.visibility === "public").length;
  // Moderators have no public-deck cap; drawing empty slots at them is a lie.
  const unlimitedSlots = isAdminUsername(profile.username);
  const freeSlots = unlimitedSlots ? 0 : Math.max(0, PUBLIC_DECKS_MAX - publicDecks);

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
          <div className={styles.profileSelfActions}>
            <Link href="/pattern-lab" className={styles.btnAccent}>
              Make &amp; publish ↗
            </Link>
            {/* Phone only — the header carries it everywhere else. */}
            <SignOutLink className={styles.profileSignOut} />
          </div>
        )}
      </header>

      {items.length === 0 ? (
        isSelf ? (
          <div className={styles.emptyPanel}>
            <span className={styles.emptyKicker}>Profile · no patterns</span>
            <span className={styles.emptyTitle}>Nobody has seen your work yet.</span>
            <span className={styles.emptyBody}>
              Open Pattern Lab, make something, publish it here — it takes one button from there.
            </span>
            <Link href="/pattern-lab" className={styles.emptyCta}>
              Make &amp; publish — Pattern Lab ↗
            </Link>
          </div>
        ) : (
          <div className={styles.empty}>No patterns shared yet.</div>
        )
      ) : (
        <div className={styles.profileGrid}>
          {items.map((item) => (
            <PatternCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {(deckItems.length > 0 || isSelf) && (
        <>
          <h2 className={styles.profileSectionTitle}>
            Decks
            {isSelf && (
              <span className={styles.profileSlotNote}>
                {unlimitedSlots
                  ? `${publicDecks} public — no limit`
                  : `${publicDecks} of ${PUBLIC_DECKS_MAX} public slots used`}
              </span>
            )}
          </h2>
          <div className={styles.deckGrid}>
            {deckItems.map((deck) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
            {/* The unused slot is drawn, not described: the allowance is
                small, so an empty one is information about what this person
                could still stand behind. */}
            {isSelf && freeSlots > 0 && (
              <span className={styles.deckSlotFree}>
                {freeSlots === 1
                  ? "One public slot left — share a deck from your tray"
                  : `${freeSlots} public slots — share a deck from your tray`}
              </span>
            )}
          </div>
        </>
      )}

      {isSelf && items.length > 0 && (
        <p className={styles.profileFootNote}>
          Open any pattern to edit its details, attach a firmware header, or delete it. Private
          patterns are visible only to you here.
        </p>
      )}
    </div>
  );
}
