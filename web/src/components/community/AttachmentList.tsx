"use client";

import { communityApiUrl } from "@/lib/community/apiBase";
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

export default function AttachmentList({ files }: { files: AttachmentView[] }) {
  if (files.length === 0) return null;

  const images = files.filter((file) => isImageFilename(file.filename));
  const rest = files.filter((file) => !isImageFilename(file.filename));

  return (
    <>
      {images.length > 0 && (
        <div className={styles.attachImages}>
          {images.map((file) => (
            <a
              key={file.id}
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
            </a>
          ))}
        </div>
      )}
    </>
  );
}
