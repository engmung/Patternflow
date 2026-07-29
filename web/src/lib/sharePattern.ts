// Licence + attribution machinery for shared patterns (community publishing
// and downloads). The editor stays clean while editing; the licence header +
// attribution footer are injected only at export time.

export type LicenseOption = { id: string; label: string; spdx: string };

/**
 * What an author can CHOOSE when publishing or editing.
 *
 * Deliberately two. The picker used to offer four (plus MIT and CC0) and every
 * single pattern published took the default — that is not variety, it is a
 * default. Fewer options keep the fork-compatibility rules (see
 * `forkLicenseAllowed`) simple enough to enforce, and make a rights decision
 * taken in two seconds in a modal less dangerous.
 *
 * MIT is a software-distribution licence (warranty/liability clauses) and CC BY
 * says the same thing in language that fits a creative work. CC0 is an
 * irrevocable total waiver of rights — not something to put one dropdown click
 * away from a tired person at 2am.
 */
export const LICENSE_OPTIONS: LicenseOption[] = [
  { id: "cc-by-sa-4.0", label: "CC BY-SA 4.0 (recommended)", spdx: "CC-BY-SA-4.0" },
  { id: "cc-by-4.0", label: "CC BY 4.0", spdx: "CC-BY-4.0" },
];

/**
 * Retired from the picker but still recognised. A copyright grant cannot be
 * withdrawn, so a pattern published under one of these keeps it — we just stop
 * offering it to new work.
 */
export const RETIRED_LICENSE_OPTIONS: LicenseOption[] = [
  { id: "mit", label: "MIT (retired)", spdx: "MIT" },
  { id: "cc0-1.0", label: "CC0 1.0 (retired)", spdx: "CC0-1.0" },
];

export const KNOWN_LICENSES: LicenseOption[] = [...LICENSE_OPTIONS, ...RETIRED_LICENSE_OPTIONS];

export const DEFAULT_LICENSE_ID = "cc-by-sa-4.0";

// Which tool the share came from. Drives the "Made with" attribution so each
// surface points people back to the right place.
export type ShareSource = "pattern-lab" | "live-editor" | "community";

export const SHARE_TOOLS: Record<ShareSource, { label: string; url: string }> = {
  "pattern-lab": { label: "Patternflow Pattern Lab", url: "https://patternflow.work/pattern-lab" },
  "live-editor": { label: "Patternflow Live Editor", url: "https://patternflow.work/pattern" },
  community: { label: "Patternflow Community", url: "https://patternflow.work/community" },
};

export function licenseById(id: string): LicenseOption {
  return KNOWN_LICENSES.find((option) => option.id === id) ?? LICENSE_OPTIONS[0];
}

/**
 * Look up a stored SPDX id for DISPLAY. An unrecognised value is passed through
 * as-is rather than falling back to the default: silently relabelling someone's
 * pattern would be us changing their licence for them.
 */
export function licenseBySpdx(spdx: string): LicenseOption {
  return (
    KNOWN_LICENSES.find((option) => option.spdx === spdx) ?? { id: "custom", label: spdx, spdx }
  );
}

/**
 * Which licences a fork may be published under, given its parent's. A
 * derivative cannot be looser than what it derives from — ShareAlike is the
 * whole point of CC BY-SA, and the publish API used to accept any licence for
 * any fork, which made the platform a party to breaking it.
 */
export function forkLicenseAllowed(parentSpdx: string, childSpdx: string): boolean {
  switch (parentSpdx) {
    // ShareAlike: the adaptation carries the same terms forward.
    case "CC-BY-SA-4.0":
      return childSpdx === "CC-BY-SA-4.0";
    // Attribution-only: a fork may keep it, or add ShareAlike on top.
    case "CC-BY-4.0":
      return childSpdx === "CC-BY-4.0" || childSpdx === "CC-BY-SA-4.0";
    // Permissive (the retired options, and anything we don't recognise): no
    // downstream restriction to honour.
    default:
      return true;
  }
}

/** Licences a fork of this parent may use, for the publish picker. */
export function forkLicenseOptions(parentSpdx: string): LicenseOption[] {
  return LICENSE_OPTIONS.filter((option) => forkLicenseAllowed(parentSpdx, option.spdx));
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

/** Upstream credit for a fork — the pattern this one was adapted from. */
export type ShareLineage = {
  title: string;
  /** Author handle, without the "@". */
  handle: string | null;
  /** Canonical community URL, when there is one. */
  url?: string | null;
};

export type ShareMeta = {
  title: string;
  author: string;
  license: LicenseOption;
  date: string;
  source: ShareSource;
  /**
   * Set on a fork. Both CC licences require a derivative to keep identifying
   * the original creator, and the DB's `parent_id` does not travel with the
   * file — copied code, downloads and compiled .pfm modules all leave the site,
   * so the credit has to live in the source.
   */
  basedOn?: ShareLineage | null;
};

// Top-of-file licence header. SPDX line is kept machine-readable.
export function buildLicenseHeader(meta: ShareMeta): string {
  const lines = [
    "// ===== Patternflow pattern =====",
    `// Title:    ${meta.title || "Untitled pattern"}`,
    `// Author:   ${meta.author || "(unknown)"}`,
  ];
  if (meta.basedOn) {
    const by = meta.basedOn.handle ? ` by @${meta.basedOn.handle}` : "";
    const at = meta.basedOn.url ? ` — ${meta.basedOn.url}` : "";
    lines.push(`// Based on: "${meta.basedOn.title}"${by}${at}`);
  }
  lines.push(
    `// Date:     ${meta.date}`,
    `// SPDX-License-Identifier: ${meta.license.spdx}`,
    "// ===============================",
  );
  return lines.join("\n");
}

// Bottom-of-file attribution. Worded so people know it is not optional.
// "Made with" (not "generated") — Pattern Lab covers AI generation and
// hand-written code alike.
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
