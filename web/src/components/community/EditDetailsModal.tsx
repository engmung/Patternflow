"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DESCRIPTION_MAX,
  MADE_HOW_LABELS,
  MADE_HOW_VALUES,
  TITLE_MAX,
  type MadeHow,
} from "@/lib/community/validate";
import { LICENSE_OPTIONS, forkLicenseOptions, licenseBySpdx } from "@/lib/sharePattern";
import { captureEvent } from "@/lib/posthogEvents";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import styles from "./Community.module.css";

// Author-only: edit the pattern's title, description and licence. Saving
// rebuilds the licence header inside the source, so the credit block and the
// pattern's actual metadata never drift apart.

export default function EditDetailsModal({
  patternId,
  initialTitle,
  initialDescription,
  initialLicense,
  initialMadeOn,
  initialMadeHow,
  parentLicense,
  onClose,
}: {
  patternId: string;
  initialTitle: string;
  initialDescription: string | null;
  initialLicense: string; // SPDX
  initialMadeOn: string | null; // YYYY-MM-DD
  initialMadeHow: string | null;
  /** Parent's SPDX id when this pattern is a fork — narrows what it may become. */
  parentLicense?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [license, setLicense] = useState(initialLicense);
  const [madeOn, setMadeOn] = useState(initialMadeOn ?? "");
  const [madeHow, setMadeHow] = useState<MadeHow | "">(
    (initialMadeHow as MadeHow | null) ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // What this pattern may be relicensed to. The pattern's CURRENT licence is
  // always included even when it is no longer offered (MIT, CC0): a retired
  // option must stay selectable, or opening this modal to fix a typo in the
  // title would silently relicense the pattern to whatever sits first in the
  // list.
  const licenseChoices = (() => {
    const offered = parentLicense ? forkLicenseOptions(parentLicense) : LICENSE_OPTIONS;
    return offered.some((option) => option.spdx === initialLicense)
      ? offered
      : [licenseBySpdx(initialLicense), ...offered];
  })();

  const save = async () => {
    const trimmed = title.trim();
    setError(null);
    if (trimmed.length === 0 || trimmed.length > TITLE_MAX) {
      setError(`Title is required (max ${TITLE_MAX} characters).`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(communityApiUrl(`/api/community/patterns/${patternId}`), {
        method: "PATCH",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, description, license, madeOn, madeHow }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save.");
        return;
      }
      captureEvent("community_edit_details", { pattern_id: patternId, license });
      router.refresh();
      onClose();
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
          <span>Edit pattern details</span>
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
            <span className={styles.fieldLabel}>Description</span>
            <textarea
              className={styles.textInput}
              rows={4}
              value={description}
              maxLength={DESCRIPTION_MAX}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Made on (optional)</span>
            <input
              className={styles.textInput}
              type="date"
              value={madeOn}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setMadeOn(event.target.value)}
            />
            <span className={styles.fieldHint}>
              When you actually made it, if that differs from the day you shared it. This is the
              date written into the licence header.
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>How was it made?</span>
            <select value={madeHow} onChange={(event) => setMadeHow(event.target.value as MadeHow)}>
              {/* Blank stays available: patterns published before this field
                  existed have no answer, and inventing one for them would be
                  worse than leaving it unsaid. */}
              <option value="">Not stated</option>
              {MADE_HOW_VALUES.map((value) => (
                <option key={value} value={value}>
                  {MADE_HOW_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Licence</span>
            <select value={license} onChange={(event) => setLicense(event.target.value)}>
              {licenseChoices.map((option) => (
                <option key={option.spdx} value={option.spdx}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className={styles.fieldHint}>
              The licence header inside the code is rewritten to match.
              {parentLicense && licenseChoices.length === 1
                ? " Fixed by the licence of the pattern this was forked from."
                : ""}
            </span>
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
