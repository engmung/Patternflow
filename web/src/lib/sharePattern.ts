// Shared logic for the "Share to Discord" flow used by both the Live Editor
// (/pattern) and Pattern Lab. The editor stays clean while editing; the
// licence header + attribution footer are injected only at export time.

export type LicenseOption = { id: string; label: string; spdx: string };

export const LICENSE_OPTIONS: LicenseOption[] = [
  { id: "cc-by-sa-4.0", label: "CC BY-SA 4.0 (recommended)", spdx: "CC-BY-SA-4.0" },
  { id: "cc-by-4.0", label: "CC BY 4.0", spdx: "CC-BY-4.0" },
  { id: "mit", label: "MIT", spdx: "MIT" },
  { id: "cc0-1.0", label: "CC0 1.0 (public domain)", spdx: "CC0-1.0" },
];

export const DEFAULT_LICENSE_ID = "cc-by-sa-4.0";

// Server hosting the patterns channel, plus its display name for instructions.
export const DISCORD_PATTERNS_URL = "https://discord.gg/Vr9QtsxeTk";
export const DISCORD_PATTERNS_CHANNEL = "🌀│patterns";

export function licenseById(id: string): LicenseOption {
  return LICENSE_OPTIONS.find((option) => option.id === id) ?? LICENSE_OPTIONS[0];
}

const AUTHOR_KEY = "patternflow.share.author";

export function loadShareAuthor(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(AUTHOR_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveShareAuthor(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

export function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pattern"
  );
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export type ShareMeta = {
  title: string;
  author: string;
  license: LicenseOption;
  date: string;
};

// Top-of-file licence header. SPDX line is kept machine-readable.
export function buildLicenseHeader(meta: ShareMeta): string {
  return [
    "// ===== Patternflow pattern =====",
    `// Title:   ${meta.title || "Untitled pattern"}`,
    `// Author:  ${meta.author || "(unknown)"}`,
    `// Date:    ${meta.date}`,
    `// SPDX-License-Identifier: ${meta.license.spdx}`,
    "// ===============================",
  ].join("\n");
}

// Bottom-of-file attribution. Worded so people know it is not optional.
export function buildAttributionFooter(meta: ShareMeta): string {
  return [
    "// ── Made with Patternflow · https://patternflow.work ──",
    `// Shared under ${meta.license.spdx}. Attribution is part of this licence —`,
    "// please keep this notice and the author credit above when you reuse,",
    "// remix, or redistribute this pattern. Do not delete it.",
  ].join("\n");
}

// Remove a header/footer we previously injected, so re-sharing an already
// exported file does not stack duplicate blocks.
export function stripShareWrapping(code: string): string {
  return code
    .replace(/\/\/ ===== Patternflow pattern =====[\s\S]*?\/\/ =+\n?/, "")
    .replace(/\/\/ ── Made with Patternflow[\s\S]*$/, "")
    .trim();
}

export function buildSharedPatternFile(code: string, meta: ShareMeta): string {
  const body = stripShareWrapping(code);
  return `${buildLicenseHeader(meta)}\n\n${body}\n\n${buildAttributionFooter(meta)}\n`;
}

// Minimal Discord caption. Licence/credit live in the file, so this stays light
// and is identical on both pages (no live knob values).
export function buildShareCaption(meta: {
  title: string;
  author: string;
  videoUrl: string;
}): string {
  const parts = [`🎛️ ${meta.title || "New Patternflow pattern"}`];
  if (meta.author) parts.push(`by ${meta.author}`);
  parts.push("");
  if (meta.videoUrl) {
    parts.push(`🎬 ${meta.videoUrl}`);
    parts.push("");
  }
  parts.push("Code attached (.js) — load it in the Live Editor at patternflow.work/pattern to try it.");
  parts.push("Licence & credit are in the file header. #patternflow");
  return parts.join("\n");
}

// Appended to a page's existing JS→C++ conversion prompt so the generated
// header is named after the pattern. The licence header itself is injected
// in-app on download (see buildSharedHeaderFile), so the prompt does not need
// to embed it.
export function cppNamingInstruction(meta: ShareMeta): string {
  return [
    "",
    "## Naming",
    `- Name the pattern "${meta.title || "Untitled pattern"}": use it for the NAME string and the namespace.`,
  ].join("\n");
}

// Wrap pasted C++ (the AI's conversion output) with the same licence header and
// attribution footer as the .js file. The header goes right after the first
// `#pragma once` line so the file still starts with it.
export function buildSharedHeaderFile(cppCode: string, meta: ShareMeta): string {
  const header = buildLicenseHeader(meta);
  const footer = buildAttributionFooter(meta);
  const body = stripShareWrapping(cppCode);
  const lines = body.split("\n");
  const pragmaIndex = lines.findIndex((line) => line.trim().startsWith("#pragma once"));
  if (pragmaIndex >= 0) {
    lines.splice(pragmaIndex + 1, 0, "", header);
    return `${lines.join("\n")}\n\n${footer}\n`;
  }
  return `${header}\n\n${body}\n\n${footer}\n`;
}
