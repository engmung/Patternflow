"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
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
import { useDeviceHost } from "@/lib/community/deviceHost";
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
  const [packNote, setPackNote] = useState<string | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const { patternsUrl } = useDeviceHost();

  // patternsUrl needs `window` and answers "#" without it. The other callers
  // only render after a build has finished, so they are always past that;
  // this button is in the server-rendered markup, where "#" is what gets
  // written into the HTML and hydration has no state change to correct it.
  // This subscribes to nothing and only differs between server and client,
  // which is precisely the re-render that fills the address in.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const playable = items.filter((item) => item.pattern !== null);

  // The pack endpoint answers 202 while the compile runs — the first person
  // to want a given running order pays a few seconds for it and everyone
  // after that gets a file immediately. Poll rather than spin: a deck that
  // has never been downloaded is exactly the case this handles.
  const packUrl = communityApiUrl(`/api/community/decks/${deck.id}/zip`);
  const downloadPack = async () => {
    setError(null);
    setPackNote("Preparing…");
    const deadline = Date.now() + 90_000;
    try {
      for (;;) {
        const response = await fetch(packUrl, COMMUNITY_FETCH_INIT);
        if (response.ok) {
          setPackNote(null);
          captureEvent("deck_pack_downloaded", { deckId: deck.id, patterns: playable.length });
          // Hand it to the browser as a navigation so it lands in Downloads
          // with the filename the route sets, instead of a blob we name here.
          window.location.href = packUrl;
          return;
        }
        if (response.status !== 202) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setPackNote(null);
          setError(body?.error ?? "The pack could not be built.");
          return;
        }
        if (Date.now() > deadline) {
          setPackNote(null);
          setError("The pack is taking unusually long to build. Try again in a moment.");
          return;
        }
        setPackNote("Building the pack…");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch {
      setPackNote(null);
      setError("Network error — could not reach the community.");
    }
  };

  // What a person sharing a deck actually needs: the address, not the file.
  //
  // The pack has lived at a stable URL since it was built, and the comment on
  // the download button has said "this is also the link you paste somewhere"
  // the whole time — but there was no way to get it out of the page. You
  // could only download the .zip and re-upload it wherever you were sharing,
  // which is the thing hosting it was supposed to remove.
  //
  // Copying also kicks the build off. A deck nobody has downloaded compiles
  // on first request, and that first request should be the person who chose
  // to share it rather than the stranger who clicked their link.
  const copyPackLink = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(new URL(packUrl, window.location.origin).toString());
      setLinkNote("Copied");
      captureEvent("deck_pack_link_copied", { deckId: deck.id });
    } catch {
      setError("Could not reach the clipboard — copy the address bar link instead.");
      return;
    }
    // Fire-and-forget: the link is already on the clipboard and works either
    // way. This only decides whether the recipient waits for a compile.
    void fetch(packUrl, COMMUNITY_FETCH_INIT).catch(() => {});
    setTimeout(() => setLinkNote(null), 2000);
  };

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
          {/* Onto a board, in this order — the thing a deck exists for.
              Two routes to it, and only ever one of them shown.

              A public deck has a pack already built and served from a stable
              URL, so the board fetches it directly: no sign-in, no working
              deck, no build queue. Anything else has no pack to fetch, so it
              goes the long way — into your working deck, where the panel can
              build it once you are signed in. Offering both at once was three
              buttons for one intention. */}
          {deck.visibility === "public" ? (
            <a
              className={styles.btnAccentLink}
              href={
                hydrated && playable.length > 0
                  ? patternsUrl(`/api/community/decks/${deck.id}/zip`)
                  : undefined
              }
              aria-disabled={!hydrated || playable.length === 0}
              title="Open your board's Patterns page with this deck queued — no sign-in needed"
            >
              Install to my board
            </a>
          ) : (
            <button
              type="button"
              className={styles.btnAccent}
              disabled={busy || playable.length === 0}
              title="Load this deck and build it as loadable modules for your board"
              onClick={() => void sendToBoard()}
            >
              {confirmCopy ? "Press again" : "Send to my board"}
            </button>
          )}
        </div>

        {/* Sharing, kept off the main row: it is what the deck's author does
            once, not what a visitor does. The pack itself needs no action —
            it is built on first request and rebuilt whenever the running
            order changes — so this says so rather than implying a button
            somewhere bakes it. */}
        {deck.visibility === "public" && playable.length > 0 && (
          <p className={styles.deckShareRow}>
            <span className={styles.deckShareLabel}>Share this deck</span>
            <button type="button" className={styles.btnSmall} onClick={() => void copyPackLink()}>
              {linkNote ?? "Copy pack link"}
            </button>
            <button type="button" className={styles.btnSmall} onClick={() => void downloadPack()}>
              {packNote ?? "Download .zip"}
            </button>
            <span className={styles.deckShareNote}>
              The pack is built automatically and rebuilt whenever you reorder.
            </span>
          </p>
        )}

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
