"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { PUBLIC_DECKS_MAX, type CollectedPattern } from "@/lib/community/deck";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/community/validate";
import {
  VISIBILITY_HINTS,
  VISIBILITY_LABELS,
  VISIBILITY_VALUES,
  type Visibility,
} from "@/lib/community/visibility";
import { captureEvent } from "@/lib/posthogEvents";
import AuthModal from "./AuthModal";
import styles from "./Community.module.css";

// "Share deck" — publish the working deck as a deck other people can open.
// The working deck stays local and keeps being the scratch list; what is
// shared is a titled snapshot of its ids and order.

export default function ShareDeckModal({
  deck,
  onClose,
}: {
  deck: CollectedPattern[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Sharing is why this modal is open, so the shareable default. The private
  // option is still here — a deck saved to the server survives a cleared
  // browser, which localStorage does not.
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    const trimmed = title.trim();
    setError(null);
    if (trimmed.length === 0 || trimmed.length > TITLE_MAX) {
      setError(`Title is required (max ${TITLE_MAX} characters).`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(communityApiUrl("/api/community/decks"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          description,
          visibility,
          patternIds: deck.map((item) => item.patternId),
        }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        setError(payload.error ?? "Sharing failed.");
        return;
      }
      captureEvent("community_deck_shared", {
        deck_id: payload.id,
        patterns: deck.length,
        visibility,
      });
      router.push(`/community/d/${payload.id}`);
      onClose();
    } catch {
      setError("Network error — is the community server reachable?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>Share deck</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {isPending ? (
          <div className={styles.modalBody}>
            <span className={styles.formNote}>Checking session…</span>
          </div>
        ) : !session ? (
          <AuthModal embedded onClose={() => undefined} />
        ) : (
          <div className={styles.modalBody}>
            <p className={styles.formNote}>
              Sharing {deck.length} pattern{deck.length === 1 ? "" : "s"} in their current order —
              the order they cycle on the device. The shared deck keeps pointing at the community
              patterns; your working deck here stays yours to rearrange.
            </p>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Title</span>
              <input
                className={styles.textInput}
                value={title}
                maxLength={TITLE_MAX}
                autoFocus
                placeholder="What is this set — a mood, a place, a night?"
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Description (optional)</span>
              <textarea
                className={styles.textInput}
                rows={3}
                value={description}
                maxLength={DESCRIPTION_MAX}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Who can see it?</span>
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as Visibility)}
              >
                {VISIBILITY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {VISIBILITY_LABELS[value]}
                  </option>
                ))}
              </select>
              <span className={styles.fieldHint}>
                {VISIBILITY_HINTS[visibility]}
                {visibility === "public" &&
                  ` Public decks are rationed: ${PUBLIC_DECKS_MAX} per account, so a published deck is one you stand behind.`}
              </span>
            </label>

            {error && <div className={styles.formError}>{error}</div>}

            <button
              type="button"
              className={styles.btnAccent}
              disabled={busy}
              onClick={() => void share()}
            >
              {busy ? "Sharing…" : visibility === "public" ? "Publish deck" : "Share deck"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
