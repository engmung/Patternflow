import type { Metadata } from "next";
import { communityEnabled } from "@/lib/community/db";
import { listPublicDecks } from "@/lib/community/queries";
import { toDeckCardItem } from "@/lib/community/serialize";
import DeckCard from "@/components/community/DeckCard";
import styles from "@/components/community/Community.module.css";

// The deck feed: curated, ordered sets somebody chose to stake a public slot
// on. Deliberately small — two public decks per account keeps this a shelf,
// not a firehose, and that scarcity is what makes "in decks" a ranking signal
// worth having on the pattern feed.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Decks / Patternflow Community",
  description:
    "Curated, ordered sets of LED matrix patterns — arranged by the community, buildable onto a board in one go.",
};

export default async function CommunityDecksPage() {
  if (!communityEnabled()) return null; // layout already rendered the notice

  const items = (await listPublicDecks()).map(toDeckCardItem);

  return (
    <div className={styles.decksPage}>
      <div className={styles.introRow}>
        <span>
          Decks are ordered sets — the order they cycle on the device. Open one to play it, or
          copy it into your own deck as a starting point. Each account gets two public decks, so
          what is here is what somebody chose to stand behind.
        </span>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>
          No decks shared yet. Arrange one in the Deck panel above, then press &ldquo;Share
          deck&rdquo;.
        </div>
      ) : (
        <div className={styles.deckGrid}>
          {items.map((deck) => (
            <DeckCard key={deck.id} deck={deck} />
          ))}
        </div>
      )}
    </div>
  );
}
