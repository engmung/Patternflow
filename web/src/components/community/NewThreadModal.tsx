"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import BodyComposer from "./BodyComposer";
import { deckItems } from "@/lib/community/deck";
import { communityPatternUrl } from "@/lib/community/license";
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_PER_PARENT,
  formatBytes,
} from "@/lib/community/workshop";
import type { TerritoryListItem } from "@/lib/community/queries";
import { POST_BODY_MAX, TITLE_MAX } from "@/lib/community/validate";
import styles from "./Community.module.css";

// Starting a thread, in one dialog.
//
// "Also pin me" is checked by default and that is deliberate: writing a thread
// about a direction IS working on it, and asking people to perform the same
// claim twice is how a map ends up with threads and no names on it.
//
// Files go up AFTER the thread exists (see the attachments route) — so a
// rejected file never costs somebody the paragraphs they just wrote.

const ACCEPT = ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(",");

export default function NewThreadModal({
  territories,
  initialCode,
  onClose,
}: {
  territories: TerritoryListItem[];
  initialCode: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [code, setCode] = useState(initialCode);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pin, setPin] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Whatever this person has collected — the working deck is the only pattern
  // index the browser has without a round trip.
  const linkable = picking ? deckItems() : [];

  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)].slice(0, ATTACHMENT_MAX_PER_PARENT));
  };

  const linkPattern = (patternId: string, patternTitle: string) => {
    setBody((current) =>
      `${current}${current.length > 0 && !current.endsWith("\n") ? "\n" : ""}${patternTitle}: ${communityPatternUrl(patternId)}\n`,
    );
    setPicking(false);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(communityApiUrl("/api/community/posts"), {
        method: "POST",
        ...COMMUNITY_FETCH_INIT,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          territoryCode: code,
          pin,
        }),
      });
      const payload = (await response.json()) as { error?: string; id?: string };
      if (!response.ok || !payload.id) {
        setError(payload.error ?? "Could not post.");
        return;
      }

      if (files.length > 0) {
        const form = new FormData();
        form.set("postId", payload.id);
        for (const file of files) form.append("files", file);
        const upload = await fetch(communityApiUrl("/api/community/attachments"), {
          method: "POST",
          ...COMMUNITY_FETCH_INIT,
          body: form,
        });
        if (!upload.ok) {
          // The thread is already up — say so rather than implying it failed.
          const detail = (await upload.json()) as { error?: string };
          setError(
            `Thread posted, but the files did not attach: ${detail.error ?? "upload failed"}. Open it and try again.`,
          );
          setBusy(false);
          return;
        }
      }

      router.push(`/community/workshop/${code.toLowerCase()}/t/${payload.id}`);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.modalCardThread}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalKicker}>New thread</span>
          <span className={styles.fieldHint}>in</span>
          <select
            className={styles.territorySelect}
            value={code}
            aria-label="Territory"
            onChange={(event) => setCode(event.target.value)}
          >
            {territories.map((territory) => (
              <option key={territory.id} value={territory.code}>
                {territory.code} · {territory.title}
              </option>
            ))}
          </select>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <input
            className={styles.postTitleInput}
            value={title}
            maxLength={TITLE_MAX}
            autoFocus
            placeholder="Title — say the thing, not “question about…”"
            aria-label="Thread title"
            onChange={(event) => setTitle(event.target.value)}
          />
          <BodyComposer
            value={body}
            onChange={setBody}
            maxLength={POST_BODY_MAX}
            placeholder="What are you making, what happened, what do you need?"
            label="Thread body"
            grow="modal"
          />

          {files.length > 0 && (
            <div className={styles.fileChips}>
              {files.map((file, index) => (
                <span key={`${file.name}-${index}`} className={styles.fileChip}>
                  ▤ {file.name} <span>{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {picking && (
            <div className={styles.patternPicker}>
              {linkable.length === 0 ? (
                <span className={styles.fieldHint}>
                  Nothing in your deck or saved list yet — paste a pattern link instead, it
                  becomes a link on its own.
                </span>
              ) : (
                linkable.map((item) => (
                  <button
                    key={item.patternId}
                    type="button"
                    onClick={() => linkPattern(item.patternId, item.title)}
                  >
                    {item.title}
                  </button>
                ))
              )}
            </div>
          )}

          <div className={styles.composerRow}>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className={styles.composerLink}
              onClick={() => fileRef.current?.click()}
            >
              ▤ attach files
            </button>
            <button
              type="button"
              className={styles.composerLink}
              onClick={() => setPicking((open) => !open)}
            >
              ▦ link a pattern
            </button>
            <span className={styles.headerSpacer} />
            <label className={styles.pinCheck}>
              <input
                type="checkbox"
                checked={pin}
                onChange={(event) => setPin(event.target.checked)}
              />
              <span aria-hidden="true">{pin ? "✓" : ""}</span>
              also pin me: I&rsquo;m working here
            </label>
          </div>

          {error && <div className={styles.formError}>{error}</div>}
        </div>

        <div className={styles.modalFoot}>
          <span className={styles.headerSpacer} />
          <button type="button" className={styles.mapGhostBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.btnAccent}
            disabled={busy || !canSubmit}
            onClick={() => void submit()}
          >
            {busy ? "Posting…" : `Post to ${code}`}
          </button>
        </div>
      </div>
    </div>
  );
}
