"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/community/validate";
import { DEFAULT_LICENSE_ID, LICENSE_OPTIONS, licenseById } from "@/lib/sharePattern";
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
   * Firmware header to publish alongside the pattern, when the hardware flow
   * already produced one. Publishing with it is what makes a pattern show up
   * as hardware-ready straight away instead of needing a second trip through
   * "Add firmware header".
   */
  codeCpp?: string | null;
  onClose: () => void;
};

export default function PublishModal({ code, parentId, parentTitle, codeCpp, onClose }: Props) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [licenseId, setLicenseId] = useState(DEFAULT_LICENSE_ID);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    const trimmed = title.trim();
    setError(null);
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
          parentId,
        }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        setError(payload.error ?? "Publishing failed.");
        return;
      }
      captureEvent("community_publish", {
        pattern_id: payload.id,
        is_fork: Boolean(parentId),
        license: licenseById(licenseId).spdx,
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
                original stays linked from your post.
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
              <span className={styles.fieldLabel}>License</span>
              <select value={licenseId} onChange={(event) => setLicenseId(event.target.value)}>
                {LICENSE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className={styles.fieldHint}>
                Publishing shares your pattern under this license, credited to your username.
              </span>
            </label>

            {error && <div className={styles.formError}>{error}</div>}

            <button
              type="button"
              className={styles.btnAccent}
              disabled={busy}
              onClick={() => void publish()}
            >
              {busy ? "Publishing…" : "Publish to feed"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
