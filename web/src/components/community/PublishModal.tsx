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
//
// Two jobs, because they are the same form: publishing something new, and
// UPDATING a post whose author reopened it in the lab (`editOf`). Without the
// second one the only way to revise a published pattern was to publish a fork
// of your own work and delete the original, which threw away its likes,
// comments and fork lineage every time.

type Props = {
  code: string;
  parentId: string | null;
  parentTitle: string | null;
  /**
   * The author's own published pattern, reopened for revision. When set, this
   * modal PATCHes that pattern instead of creating one — see the lab's
   * "editing …" badge and lib/lab/types.ts.
   */
  editOf?: {
    id: string;
    title: string;
    description: string | null;
    visibility: string;
    /** Ships the author's own .h, which a code change detaches. */
    hasCpp: boolean;
    /** Live community ports, which a code change sends stale. */
    portCount: number;
  } | null;
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
  /**
   * Canonical performance JSON of the lab's Director show, when one exists.
   * Publishing attaches it to the new pattern over the same rail the
   * pattern page's "Publish a performance" uses.
   */
  performanceJson?: string | null;
  onClose: () => void;
};

export default function PublishModal({
  code,
  parentId,
  parentTitle,
  parentLicense,
  editOf,
  codeCpp,
  performanceJson,
  onClose,
}: Props) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  // Updating opens with what is already published — an empty title on a post
  // that has one reads as "name this", which it is not.
  const [title, setTitle] = useState(editOf?.title ?? "");
  const [description, setDescription] = useState(editOf?.description ?? "");
  const [madeHow, setMadeHow] = useState<MadeHow>("ai-assisted");
  // Public by default — the wall is the point. Private is for work that is
  // not ready to be somebody else's business yet.
  const [visibility, setVisibility] = useState<Visibility>(() => {
    const published = editOf?.visibility;
    // Checked against the list rather than cast: the value travelled through
    // sessionStorage, and an unrecognised one would leave the select showing
    // nothing while quietly submitting it.
    return VISIBILITY_VALUES.includes(published as Visibility)
      ? (published as Visibility)
      : "public";
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [includeShow, setIncludeShow] = useState(true);

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
      // Updating touches only what this form shows. Licence and "how was it
      // made" are deliberately absent from the body as well as from the form:
      // they are properties of the work, not of this revision, and the pattern
      // page's Edit details owns them.
      const response = await fetch(
        communityApiUrl(
          editOf ? `/api/community/patterns/${editOf.id}` : "/api/community/patterns",
        ),
        {
          method: editOf ? "PATCH" : "POST",
          ...COMMUNITY_FETCH_INIT,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editOf
              ? { title: trimmed, description, code, visibility }
              : {
                  title: trimmed,
                  description,
                  code,
                  codeCpp: codeCpp ?? undefined,
                  license: licenseById(licenseId).spdx,
                  madeHow,
                  visibility,
                  parentId,
                },
          ),
        },
      );
      // A proxy's HTML error page or a bare 403 is not JSON; reading it as
      // JSON threw and surfaced as "network error", which it is not.
      const payload = (await response
        .json()
        .catch(() => ({}))) as { id?: string; error?: string };
      // A PATCH answers { ok: true } and the id was known all along.
      const patternId = editOf ? editOf.id : payload.id;
      if (!response.ok || !patternId) {
        setError(
          payload.error ??
            `${editOf ? "Updating" : "Publishing"} failed (HTTP ${response.status}).`,
        );
        return;
      }
      // The show rides along on the pattern-page rail. Best effort: the
      // pattern is already live, and the page's "Publish a performance"
      // can always attach one later if this leg fails.
      const withShow = Boolean(performanceJson && includeShow);
      if (withShow) {
        await fetch(communityApiUrl(`/api/community/patterns/${patternId}/performance`), {
          method: "POST",
          ...COMMUNITY_FETCH_INIT,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ performanceJson, note: "" }),
        }).catch(() => undefined);
      }
      captureEvent(editOf ? "community_update_pattern" : "community_publish", {
        pattern_id: patternId,
        is_fork: Boolean(parentId),
        license: licenseById(licenseId).spdx,
        made_how: madeHow,
        code_length: code.length,
        with_header: Boolean(codeCpp),
        with_show: withShow,
      });
      router.push(`/community/p/${patternId}`);
      // The page is server-rendered, so an update lands on a cached copy of
      // what it just replaced without this.
      if (editOf) router.refresh();
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
          <span>{editOf ? "Update your pattern" : "Share to Community"}</span>
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
            {parentId && !editOf && (
              <p className={styles.formNote}>
                Publishing as a fork of <strong>{parentTitle ?? "a community pattern"}</strong> — the
                original stays linked from your post, and its author is credited in your pattern&apos;s
                header.
              </p>
            )}

            {editOf && (
              <p className={styles.formNote}>
                Replacing the code of <strong>{editOf.title}</strong>. It stays the same post — same
                page, same likes, comments and forks — so nothing has to be deleted and reposted.
                The version you opened is parked under <strong>Recent ▾</strong> if you want it
                back.
              </p>
            )}

            {/* Said before the button, not after: it is the one consequence of
                updating that this modal cannot undo. Unconditional in edit
                mode, and correctly so — the embedded @stack annotation is
                rebuilt on every export (fresh layer ids, a new timestamp), so
                an update always counts as a code change even if you touched
                nothing. */}
            {editOf && (editOf.hasCpp || editOf.portCount > 0) && (
              <p className={styles.warnNote}>
                {editOf.hasCpp && (
                  <>
                    Your firmware header comes off — it was verified against the code being
                    replaced. Attach a fresh <code>.h</code> from the pattern&apos;s page once you
                    have built the new one.{" "}
                  </>
                )}
                {editOf.portCount > 0 && (
                  <>
                    {editOf.portCount === 1
                      ? "The community port on this pattern"
                      : `The ${editOf.portCount} community ports on this pattern`}{" "}
                    {editOf.portCount === 1 ? "was" : "were"} verified against it too, so{" "}
                    {editOf.portCount === 1 ? "it stays" : "they stay"} listed marked &ldquo;for an
                    older version&rdquo; until somebody ports the new code.
                  </>
                )}
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

            {/* Licence and provenance describe the WORK, not this revision, and
                the pattern page's Edit details already owns both. Offering them
                again here would either re-ask a settled question or quietly
                relicense a pattern people have already forked. */}
            {editOf ? (
              <p className={styles.fieldHint}>
                Licence and &ldquo;how it was made&rdquo; stay as published — change those from
                <strong> Edit details</strong> on the pattern&apos;s page.
              </p>
            ) : (
              <>
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
              </>
            )}

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

            {performanceJson && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  <input
                    type="checkbox"
                    checked={includeShow}
                    onChange={(event) => setIncludeShow(event.target.checked)}
                  />{" "}
                  Include the Director show
                </span>
                <span className={styles.fieldHint}>
                  The timeline publishes as this pattern&rsquo;s performance — the pattern page
                  offers its .pfs, and deck zips carry it to the panel.
                  {editOf &&
                    " It is added as another recording; earlier ones stay, and the pattern page picks which represents it."}
                </span>
              </label>
            )}

            {error && <div className={styles.formError}>{error}</div>}

            <button
              type="button"
              className={styles.btnAccent}
              disabled={busy}
              onClick={() => void publish()}
            >
              {editOf
                ? busy
                  ? "Updating…"
                  : "Update this pattern"
                : busy
                  ? "Publishing…"
                  : visibility === "public"
                    ? "Publish to the wall"
                    : "Save privately"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
