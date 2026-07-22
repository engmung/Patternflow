"use client";

import {
  LICENSE_OPTIONS,
  buildSharedHeaderFile,
  buildSharedPatternFile,
  slugifyName,
  type ShareMeta,
} from "@/lib/sharePattern";

// Community downloads reuse the Discord share flow's licence machinery: the
// stored code is clean, and the header + attribution footer are injected here
// from the pattern's own row. Whoever opens the file sees who made it, when,
// and under what licence — without the author having to remember anything.

export type DownloadablePattern = {
  title: string;
  license: string; // SPDX
  createdAt: string; // ISO
  username: string | null;
  displayUsername: string | null;
};

function shareMetaFor(pattern: DownloadablePattern): ShareMeta {
  const handle = pattern.displayUsername ?? pattern.username;
  return {
    title: pattern.title,
    author: handle ? `@${handle}` : "(unknown)",
    license:
      LICENSE_OPTIONS.find((option) => option.spdx === pattern.license) ?? LICENSE_OPTIONS[0],
    // The publication date, not today's — the file records when it was shared.
    date: pattern.createdAt.slice(0, 10),
    source: "community",
  };
}

function triggerDownload(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** The .js as shown, with licence header + attribution wrapped around it. */
export function downloadPatternJs(pattern: DownloadablePattern, code: string) {
  const meta = shareMetaFor(pattern);
  triggerDownload(
    `patternflow_${slugifyName(meta.title)}.js`,
    buildSharedPatternFile(code, meta),
    "text/javascript;charset=utf-8",
  );
}

/** The firmware header, licence-wrapped just like the Discord share flow's .h. */
export function downloadPatternHeader(pattern: DownloadablePattern, cpp: string) {
  const meta = shareMetaFor(pattern);
  triggerDownload(
    `patternflow_${slugifyName(meta.title)}.h`,
    buildSharedHeaderFile(cpp, meta),
    "text/plain;charset=utf-8",
  );
}

/** Preview text for the code panel — exactly what the download will contain. */
export function licensedJsText(pattern: DownloadablePattern, code: string) {
  return buildSharedPatternFile(code, shareMetaFor(pattern));
}

export function licensedHeaderText(pattern: DownloadablePattern, cpp: string) {
  return buildSharedHeaderFile(cpp, shareMetaFor(pattern));
}
