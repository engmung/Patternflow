"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import {
  DESCRIPTION_MAX,
  MADE_HOW_LABELS,
  MADE_HOW_VALUES,
  TITLE_MAX,
  CODE_MAX,
  type MadeHow,
} from "@/lib/community/validate";
import {
  VISIBILITY_HINTS,
  VISIBILITY_LABELS,
  VISIBILITY_VALUES,
  type Visibility,
} from "@/lib/community/visibility";
import {
  DEFAULT_LICENSE_ID,
  LICENSE_OPTIONS,
  forkLicenseOptions,
  licenseById,
} from "@/lib/sharePattern";
import { captureEvent } from "@/lib/posthogEvents";
import AuthModal from "./AuthModal";
import styles from "./Community.module.css";

// "Share to Community" — mounted from Pattern Lab. Sign-in appears exactly at
// the save moment (never earlier), per the community's no-login-to-browse rule.

type Props = {
  code: string;
  parentId: string | null;
  parentTitle: string | null;
  /**
   * The parent's SPDX id, when forking. A derivative cannot be looser than what
   * it came from, so the picker only offers what the API would accept — the
   * server enforces the same rule regardless.
   */
  parentLicense?: string | null;
  /**
   * Firmware header to publish alongside the pattern, when the hardware flow
   * already produced one. Publishing with it is what makes a pattern show up
   * as hardware-ready straight away instead of needing a second trip through
   * "Add firmware header".
   */
  codeCpp?: string | null;
  onClose: () => void;
};

export default function PublishModal({
  code,
  parentId,
  parentTitle,
  parentLicense,
  codeCpp,
  onClose,
}: Props) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [madeHow, setMadeHow] = useState<MadeHow>("ai-assisted");
  // Public by default — the wall is the point. Private is for work that is
  // not ready to be somebody else's business yet.
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const licenseChoices = parentLicense ? forkLicenseOptions(parentLicense) : LICENSE_OPTIONS;
  // Default to the recommended licence, unless the parent's terms rule it out.
  const [licenseId, setLicenseId] = useState(
    licenseChoices.some((option) => option.id === DEFAULT_LICENSE_ID)
      ? DEFAULT_LICENSE_ID
      : (licenseChoices[0]?.id ?? DEFAULT_LICENSE_ID),
  );

  const publish = async () => {
    const trimmed = title.trim();
    setError(null);
    if (code.length > CODE_MAX) {
      // The server says the same thing, but after a round trip that costs
      // one of five publishes a minute — and without the likely cause.
      setError(
        `This pattern is ${Math.round(code.length / 1000)} KB of code; the community takes up to ${
          CODE_MAX / 1000
        } KB. Imported images as pixel layers are the usual reason — hide or delete one and share again.`,
      );
      return;
    }
    if (trimmed.length === 0 || trimmed.length > TITLE_MAX) {
      setError(`Title is required (max ${TITLE_MAX} characters).`);
      return;
    }
    if (description.length > DESCRIPTION_MAX) {
      setError(`Description is too long (max ${DESCRIPTION_MAX} characters).`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(communityApiUrl("/api/community/patterns"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          description,
          code,
          codeCpp: codeCpp ?? undefined,
          license: licenseById(licenseId).spdx,
          madeHow,
          visibility,
          parentId,
        }),
      });
      // A proxy's HTML error page or a bare 403 is not JSON; reading it as
      // JSON threw and surfaced as "network error", which it is not.
      const payload = (await response
        .json()
        .catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        setError(payload.error ?? `Publishing failed (HTTP ${response.status}).`);
        return;
      }
      captureEvent("community_publish", {
        pattern_id: payload.id,
        is_fork: Boolean(parentId),
        license: licenseById(licenseId).spdx,
        made_how: madeHow,
        code_length: code.length,
        with_header: Boolean(codeCpp),
      });
      router.push(`/community/p/${payload.id}`);
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
          <span>Share to Community</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {isPending ? (
          <div className={styles.modalBody}>
            <span className={styles.formNote}>Checking session…</span>
          </div>
        ) : !session ? (
          // The login gate appears here, at the save moment.
          <AuthModal embedded onClose={() => undefined} />
        ) : (
          <div className={styles.modalBody}>
            {parentId && (
              <p className={styles.formNote}>
                Publishing as a fork of <strong>{parentTitle ?? "a community pattern"}</strong> — the
                original stays linked from your post, and its author is credited in your pattern&apos;s
                header.
              </p>
            )}

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
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>How was it made?</span>
              <select
                value={madeHow}
                onChange={(event) => setMadeHow(event.target.value as MadeHow)}
              >
                {MADE_HOW_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {MADE_HOW_LABELS[value]}
                  </option>
                ))}
              </select>
              <span className={styles.fieldHint}>
                Shown on your pattern. Using AI is not a mark against anything here — Pattern Lab
                is built for it. Saying so plainly is what makes the answer worth having, and it
                is recorded now because nobody can reconstruct it later.
              </span>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>License</span>
              <select value={licenseId} onChange={(event) => setLicenseId(event.target.value)}>
                {licenseChoices.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className={styles.fieldHint}>
                {licenseId === "cc-by-4.0"
                  ? "Anyone may use and adapt your pattern, including commercially, as long as they credit you. Their versions can be released under any license."
                  : "Anyone may use and adapt your pattern, including commercially, as long as they credit you — and their versions have to stay under this same license."}
                {parentLicense && licenseChoices.length === 1
                  ? " This is fixed by the license of the pattern you forked."
                  : ""}
              </span>
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
                {visibility !== "public" && " You can change this any time from the pattern's page."}
              </span>
            </label>

            {error && <div className={styles.formError}>{error}</div>}

            <button
              type="button"
              className={styles.btnAccent}
              disabled={busy}
              onClick={() => void publish()}
            >
              {busy ? "Publishing…" : visibility === "public" ? "Publish to the wall" : "Save privately"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
