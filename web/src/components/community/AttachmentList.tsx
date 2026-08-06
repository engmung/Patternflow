"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COMMUNITY_FETCH_INIT, communityApiUrl } from "@/lib/community/apiBase";
import type { AttachmentView } from "@/lib/community/queries";
import { formatBytes, isImageFilename } from "@/lib/community/workshop";
import styles from "./Community.module.css";

// What got handed over, rendered. Raster images show inline — a build photo
// IS the test result, and making people download it to see it defeats the
// point of attaching it. Everything else stays a chip that downloads.
//
// The extension split here only chooses markup. Whether bytes are ever served
// with an image content type is decided server-side from the bytes themselves
// (see the attachments route); a mis-named file just renders as a broken
// image and its chip-shaped truth is one click away.
//
// `canRemove` puts an × on each one. Attaching was one-way until it did: the
// wrong file went up under your name with a permanent URL and stayed there.
// Two clicks, because a file you meant to keep is not recoverable either.

export default function AttachmentList({
  files,
  canRemove = false,
}: {
  files: AttachmentView[];
  canRemove?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (files.length === 0) return null;

  const images = files.filter((file) => isImageFilename(file.filename));
  const rest = files.filter((file) => !isImageFilename(file.filename));

  const remove = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(communityApiUrl(`/api/community/attachments/${id}`), {
        method: "DELETE",
        ...COMMUNITY_FETCH_INIT,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not remove it.");
        return;
      }
      setConfirming(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  };

  /** The × on a thumbnail or a chip. Same two-step either way. */
  const removeButton = (file: AttachmentView, className: string) =>
    canRemove ? (
      <button
        type="button"
        className={className}
        data-confirming={confirming === file.id}
        disabled={busy === file.id}
        title={
          confirming === file.id
            ? `Remove ${file.filename} for good`
            : `Remove ${file.filename}`
        }
        aria-label={
          confirming === file.id ? `Confirm removing ${file.filename}` : `Remove ${file.filename}`
        }
        onClick={(event) => {
          // These sit inside the <a> that opens the file.
          event.preventDefault();
          event.stopPropagation();
          if (confirming === file.id) void remove(file.id);
          else setConfirming(file.id);
        }}
      >
        {busy === file.id ? "…" : confirming === file.id ? "sure?" : "×"}
      </button>
    ) : null;

  return (
    <>
      {images.length > 0 && (
        <div className={styles.attachImages}>
          {images.map((file) => (
            <a
              key={file.id}
              className={styles.attachImage}
              href={communityApiUrl(`/api/community/attachments/${file.id}`)}
              target="_blank"
              rel="noreferrer"
              title={`${file.filename} · ${formatBytes(file.bytes)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- served
                  by our own route with immutable caching; next/image would put
                  an optimizer between a Pi and its own disk */}
              <img
                src={communityApiUrl(`/api/community/attachments/${file.id}`)}
                alt={file.filename}
                loading="lazy"
              />
              {removeButton(file, styles.attachImageRemove)}
            </a>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className={styles.fileChips}>
          {rest.map((file) => (
            <a
              key={file.id}
              className={styles.fileChip}
              href={communityApiUrl(`/api/community/attachments/${file.id}`)}
            >
              ▤ {file.filename} <span>{formatBytes(file.bytes)}</span>
              {removeButton(file, styles.fileChipRemove)}
            </a>
          ))}
        </div>
      )}

      {error && <div className={styles.formError}>{error}</div>}
    </>
  );
}
