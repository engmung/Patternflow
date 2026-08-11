import { headers } from "next/headers";
import type { Metadata } from "next";
import { isAdminSession } from "@/lib/community/admin";
import { getAuth } from "@/lib/community/auth";
import { communityEnabled } from "@/lib/community/db";
import { listDecksByUser, listPublicDecks } from "@/lib/community/queries";
import { PUBLIC_DECKS_MAX } from "@/lib/community/deck";
import { toDeckCardItem } from "@/lib/community/serialize";
import DeckCard from "@/components/community/DeckCard";
import styles from "@/components/community/Community.module.css";

// The shelf. Decks are ordered sets somebody staked a public slot on — two per
// account — so this page is deliberately small next to the wall, and that
// scarcity is what makes "in decks" a ranking signal worth having.
//
// Your own decks come first, private ones included. They were only on your
// profile before, which is the page you visit least: the place you go to think
// about decks is the decks page, and a private deck you cannot find from there
// is a deck you will not finish.
//
// Only decks. A strip of the wall's newest patterns used to sit underneath as
// an argument for why the shelf is worth curating, but the wall is one click
// away in the nav and this page is short — it read as the same feed twice.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Decks / Patternflow Community",
  description:
    "Curated, ordered sets of LED matrix patterns — arranged by the community, buildable onto a board in one go.",
};

export default async function CommunityDecksPage() {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const session = await getAuth().api.getSession({ headers: await headers() });
  const viewerId = session?.user.id ?? null;
  // Moderators have no public-deck cap, so counting slots at them is a lie.
  const unlimitedSlots = isAdminSession(session);

  const [publicDecks, ownDecks] = await Promise.all([
    listPublicDecks(),
    // Passing the viewer as both owner and viewer is what unlocks their
    // private rows — see listDecksByUser.
    viewerId ? listDecksByUser(viewerId, viewerId) : Promise.resolve([]),
  ]);

  const mine = ownDecks.map(toDeckCardItem);
  // The shelf is everyone else's: your own are right above it, and showing
  // them twice makes the page look busier than it is.
  const items = publicDecks.map(toDeckCardItem).filter((deck) => !mine.some((own) => own.id === deck.id));
  const publicSlotsUsed = mine.filter((deck) => deck.visibility === "public").length;

  return (
    <div className={styles.decksPage}>
      <div className={styles.sectionHead}>
        <h1 className={styles.sectionTitle}>Sets people stood behind.</h1>
        <span className={styles.sectionLede}>
          A deck is an ordered set — the order it cycles on the device. Two public decks per
          person; publishing takes everything, a deck takes a decision.
        </span>
      </div>

      {viewerId && mine.length > 0 && (
        <section className={styles.deckSection}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>Your decks</span>
            <span className={styles.profileSlotNote}>
              {unlimitedSlots
                ? `${publicSlotsUsed} public — no limit`
                : `${publicSlotsUsed} of ${PUBLIC_DECKS_MAX} public slots used`}
            </span>
          </div>

          <div className={styles.deckGrid}>
            {mine.map((deck) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
            {!unlimitedSlots && publicSlotsUsed < PUBLIC_DECKS_MAX && (
              <span className={styles.deckSlotFree}>
                {PUBLIC_DECKS_MAX - publicSlotsUsed === 1
                  ? "One public slot left — share a deck from the bar below"
                  : `${PUBLIC_DECKS_MAX - publicSlotsUsed} public slots left — share a deck from the bar below`}
              </span>
            )}
          </div>
        </section>
      )}

      <section className={styles.deckSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionKicker}>
            {mine.length > 0 ? "Everyone else" : "Community decks"}
          </span>
          <span className={styles.sectionLede}>
            {items.length} public deck{items.length === 1 ? "" : "s"}
          </span>
        </div>

        {items.length === 0 ? (
          <div className={styles.emptyPanel}>
            <span className={styles.emptyKicker}>Decks · empty</span>
            <span className={styles.emptyTitle}>Nobody has staked a slot yet.</span>
            <span className={styles.emptyBody}>
              Arrange patterns in your deck — the bar along the bottom — then press “Share
              deck”. The order you choose is the order they cycle on the device.
            </span>
          </div>
        ) : (
          <div className={styles.deckGrid}>
            {items.map((deck) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
