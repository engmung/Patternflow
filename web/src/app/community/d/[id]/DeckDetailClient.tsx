"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PatternCard from "@/components/community/PatternCard";
import ReportModal from "@/components/community/ReportModal";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import {
  deckItems,
  deckReplace,
  openDeckPanel,
  type CollectedPattern,
} from "@/lib/community/deck";
import {
  VISIBILITY_LABELS,
  VISIBILITY_VALUES,
  type Visibility,
} from "@/lib/community/visibility";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/community/validate";
import type { DeckPageItem } from "@/lib/community/serialize";
import { captureEvent } from "@/lib/posthogEvents";
import styles from "@/components/community/Community.module.css";

// The deck page. Every slot renders its pattern's own card — author byline
// included, which is the attribution rule for decks: curation credits the
// curated (#256). "Copy to my deck" makes a shared deck a starting point
// rather than a read-only artifact.

export type DeckView = {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
};

export default function DeckDetailClient({
  deck,
  items,
  isOwner = false,
}: {
  deck: DeckView;
  items: DeckPageItem[];
  isOwner?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const playable = items.filter((item) => item.pattern !== null);

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/decks/${deck.id}`), {
        method: "PATCH",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error — is the community server reachable?");
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Pull each pattern's CURRENT header (the deck stores ids, not code) and
  // load the lot into the working deck, keeping this deck's order. Patterns
  // that lost their header since — or went away — are skipped and counted.
  const loadIntoWorkingDeck = async (): Promise<number> => {
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const collected: CollectedPattern[] = [];
      let skipped = 0;
      for (const item of items) {
        if (!item.pattern) {
          skipped += 1;
          continue;
        }
        try {
          const response = await fetch(
            communityApiUrl(`/api/community/patterns/${item.pattern.id}/header`),
            COMMUNITY_FETCH_INIT,
          );
          const payload = (await response.json()) as { codeCpp?: string };
          if (!response.ok || !payload.codeCpp) {
            skipped += 1;
            continue;
          }
          collected.push({
            patternId: item.pattern.id,
            title: item.pattern.title,
            code: payload.codeCpp,
            // The slot's own source, so a copied deck draws in the dock too.
            js: item.pattern.code,
          });
        } catch {
          skipped += 1;
        }
      }
      if (collected.length === 0) {
        setError("Nothing to copy — none of these patterns has a firmware header right now.");
        return 0;
      }
      deckReplace(collected);
      captureEvent("community_deck_copied", { deck_id: deck.id, patterns: collected.length });
      setNote(
        `Loaded ${collected.length} pattern${collected.length === 1 ? "" : "s"} into your deck` +
          (skipped > 0 ? ` — ${skipped} skipped (missing or no firmware header).` : "."),
      );
      return collected.length;
    } finally {
      setBusy(false);
    }
  };

  /** Both buttons overwrite the visitor's own working deck, which may be an
   *  arrangement they spent time on — so both ask twice. One shared latch:
   *  confirming for one and then pressing the other still only replaces the
   *  deck once, deliberately. */
  const guarded = (run: () => Promise<void>) => async () => {
    if (deckItems().length > 0 && !confirmCopy) {
      setConfirmCopy(true);
      window.setTimeout(() => setConfirmCopy(false), 4000);
      return;
    }
    setConfirmCopy(false);
    await run();
  };

  const copyToMine = guarded(async () => {
    await loadIntoWorkingDeck();
  });

  // Copy, then hand straight to the builder. Two steps under the hood, because
  // the build runs off the working deck — but one press from here, since "put
  // this set on my board" is the reason a shared deck exists at all.
  const sendToBoard = guarded(async () => {
    if ((await loadIntoWorkingDeck()) > 0) openDeckPanel();
  });

  const replaceFromWorkingDeck = async () => {
    const working = deckItems();
    if (working.length === 0) {
      setError("Your working deck is empty — add patterns to it first.");
      return;
    }
    if (!confirmReplace) {
      setConfirmReplace(true);
      window.setTimeout(() => setConfirmReplace(false), 4000);
      return;
    }
    setConfirmReplace(false);
    const ok = await patch({ patternIds: working.map((item) => item.patternId) });
    if (ok) setNote(`Contents replaced with your working deck (${working.length} patterns).`);
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(communityApiUrl(`/api/community/decks/${deck.id}`), {
        method: "DELETE",
        ...COMMUNITY_FETCH_INIT,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Could not delete the deck.");
        return;
      }
      router.push("/community/decks");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.deckPage}>
      <Link href="/community/decks" className={styles.breadcrumb}>
        ← Decks
      </Link>

      <div className={styles.metaBlock}>
        <div className={styles.deckHead}>
          <div className={styles.deckHeadTitle}>
            <h1>{deck.title}</h1>
            <span className={styles.deckByline}>
              <span>
                by{" "}
                <Link href={`/community/u/${deck.username ?? ""}`}>
                  @{deck.displayUsername ?? deck.username ?? "unknown"}
                </Link>
              </span>
              <span>· {items.length} {items.length === 1 ? "slot" : "slots"}</span>
              <span>· {deck.createdAt.slice(0, 10)}</span>
              {deck.visibility !== "public" && (
                <span
                  className={styles.visChip}
                  title={
                    deck.visibility === "private"
                      ? "Private — only you can open this page"
                      : "Unlisted — off the deck feed, anyone with this link can open it"
                  }
                >
                  {deck.visibility}
                </span>
              )}
              {!isOwner && (
                <button
                  type="button"
                  className={styles.reportLink}
                  onClick={() => setReportOpen(true)}
                >
                  Report
                </button>
              )}
            </span>
          </div>

          <span className={styles.ownerBarSpacer} />

          <button
            type="button"
            className={styles.btn}
            disabled={busy || playable.length === 0}
            title="Load these patterns, in this order, into your own working deck"
            onClick={() => void copyToMine()}
          >
            {confirmCopy ? "Press again — this replaces your deck" : "Copy into my deck"}
          </button>
          {/* The deck's whole point: onto a board, in this order. Copying is
              the editing gesture; this is the one it exists for. */}
          <button
            type="button"
            className={styles.btnAccent}
            disabled={busy || playable.length === 0}
            title="Load this deck and build it as loadable modules for your board"
            onClick={() => void sendToBoard()}
          >
            {confirmCopy ? "Press again" : "Send to my board"}
          </button>
        </div>

        {deck.description && <p className={styles.metaDescription}>{deck.description}</p>}

        {isOwner && (
          <div className={styles.ownerBar}>
            <label className={styles.deckVisControl}>
              <span>Who can see it?</span>
              <select
                value={deck.visibility}
                disabled={busy}
                onChange={(event) => void patch({ visibility: event.target.value as Visibility })}
              >
                {VISIBILITY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {VISIBILITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={styles.btn} onClick={() => setEditOpen(true)}>
              Edit details
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={busy}
              title="Overwrite this deck's contents with your current working deck, in its order"
              onClick={() => void replaceFromWorkingDeck()}
            >
              {confirmReplace ? "Press again to replace contents" : "Replace with my working deck"}
            </button>
            <span className={styles.ownerBarSpacer} />
            <button
              type="button"
              className={styles.btnDanger}
              disabled={busy}
              onClick={() => void remove()}
            >
              {confirmDelete ? "Press again to delete" : "Delete deck"}
            </button>
          </div>
        )}

        {note && <div className={styles.formNote}>{note}</div>}
        {error && <div className={styles.formError}>{error}</div>}
      </div>

      <ol className={styles.deckSlots}>
        {items.map((item) => (
          <li key={`${item.position}-${item.patternId}`} className={styles.deckSlot}>
            <span className={styles.deckSlotIndex}>{item.position + 1}</span>
            {item.pattern ? (
              <PatternCard item={item.pattern} />
            ) : (
              <div className={styles.deckGap}>
                <span className={styles.deckGapTitle}>{item.titleSnapshot || "Untitled"}</span>
                <span className={styles.deckGapReason}>
                  {item.gap === "private"
                    ? "made private by its author"
                    : "removed by its author"}
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>

      <p className={styles.profileFootNote}>
        A removed pattern keeps its slot — the arrangement is the deck author&rsquo;s work; the
        pattern was its author&rsquo;s. Open a card for its licence and credits.
      </p>

      {reportOpen && (
        <ReportModal
          targetType="deck"
          targetId={deck.id}
          targetLabel={deck.title}
          onClose={() => setReportOpen(false)}
        />
      )}

      {editOpen && (
        <EditDeckModal
          deckId={deck.id}
          initialTitle={deck.title}
          initialDescription={deck.description}
          onSaved={() => {
            setEditOpen(false);
            router.refresh();
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

// Title and description only — visibility and contents have their own
// controls on the page, where their consequences are visible.
function EditDeckModal({
  deckId,
  initialTitle,
  initialDescription,
  onSaved,
  onClose,
}: {
  deckId: string;
  initialTitle: string;
  initialDescription: string | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = title.trim();
    setError(null);
    if (trimmed.length === 0 || trimmed.length > TITLE_MAX) {
      setError(`Title is required (max ${TITLE_MAX} characters).`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(communityApiUrl(`/api/community/decks/${deckId}`), {
        method: "PATCH",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, description }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save.");
        return;
      }
      onSaved();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>Edit deck details</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Title</span>
            <input
              className={styles.textInput}
              value={title}
              maxLength={TITLE_MAX}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Description (optional)</span>
            <textarea
              className={styles.textInput}
              rows={4}
              value={description}
              maxLength={DESCRIPTION_MAX}
              placeholder="What is this set for — a mood, a place, a night?"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {error && <div className={styles.formError}>{error}</div>}
          <button type="button" className={styles.btnAccent} disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save details"}
          </button>
        </div>
      </div>
    </div>
  );
}
