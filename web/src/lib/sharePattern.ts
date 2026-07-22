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

// Which tool the share came from. Drives the caption link and the "Made with"
// attribution so each surface points people back to the right place. URLs must
// include the scheme — Discord only linkifies full https:// URLs.
export type ShareSource = "pattern-lab" | "live-editor" | "community";

export const SHARE_TOOLS: Record<ShareSource, { label: string; url: string }> = {
  "pattern-lab": { label: "Patternflow Pattern Lab", url: "https://patternflow.work/pattern-lab" },
  "live-editor": { label: "Patternflow Live Editor", url: "https://patternflow.work/pattern" },
  community: { label: "Patternflow Community", url: "https://patternflow.work/community" },
};

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
  source: ShareSource;
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
// "Made with" (not "generated") — Pattern Lab covers AI generation, the
// Experiment layer stack, and hand-written code alike.
export function buildAttributionFooter(meta: ShareMeta): string {
  const tool = SHARE_TOOLS[meta.source];
  return [
    `// ── Made with ${tool.label} · ${tool.url} ──`,
    `// Shared under ${meta.license.spdx}. Attribution is part of this licence —`,
    "// please keep this notice and the author credit above when you reuse,",
    "// remix, or redistribute this pattern. Do not delete it.",
  ].join("\n");
}

// Remove a header/footer we previously injected, so re-sharing an already
// exported file does not stack duplicate blocks. Also strips the header/footer
// the in-app Gemini generation stamps onto patterns (see gemini.ts), so shared
// files carry ONE licence block — the user-titled one from this flow.
export function stripShareWrapping(code: string): string {
  return code
    .replace(/\/\/ ===== Patternflow pattern =====[\s\S]*?\/\/ =+\n?/, "")
    .replace(/\/\/ ── Made with Patternflow[\s\S]*$/, "")
    .replace(/^\s*\/\/ Pattern:[\s\S]*?\/\/ Made with Patternflow Pattern Lab[^\n]*\n?/, "")
    .replace(/\/\/ ---\s*\n\/\/ (Generated at|Made with) [^\n]*patternflow\.work[\s\S]*$/, "")
    .trim();
}

export function buildSharedPatternFile(code: string, meta: ShareMeta): string {
  const body = stripShareWrapping(code);
  return `${buildLicenseHeader(meta)}\n\n${body}\n\n${buildAttributionFooter(meta)}\n`;
}

// Minimal Discord caption. Licence/credit live in the file, so this stays
// light. The try-it link must be a full https:// URL — Discord does not
// linkify bare domains — and points at the tool the share came from.
export function buildShareCaption(meta: {
  title: string;
  author: string;
  videoUrl: string;
  source: ShareSource;
}): string {
  const tool = SHARE_TOOLS[meta.source];
  const parts = [`🎛️ ${meta.title || "New Patternflow pattern"}`];
  if (meta.author) parts.push(`by ${meta.author}`);
  parts.push("");
  if (meta.videoUrl) {
    parts.push(`🎬 ${meta.videoUrl}`);
    parts.push("");
  }
  parts.push(`Code attached (.js) — try it: ${tool.url}`);
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
