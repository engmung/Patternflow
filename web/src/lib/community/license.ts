import {
  SHARE_TOOLS,
  buildSharedPatternFile,
  licenseBySpdx,
  type LicenseOption,
  type ShareLineage,
  type ShareMeta,
} from "@/lib/pattern/share";

// ─────────────────────────────────────────────────────────────────────────────
// Licence baking.
//
// The stored code carries its own licence header and attribution footer, the
// same block the Discord export writes. Most people copy the code out of the
// page rather than downloading a file, and a licence that only exists in the
// download is a licence most readers never see — so it lives IN the source, as
// it does on Shadertoy.
//
// The block is always rebuilt from the pattern row (never trusted from user
// input): `buildSharedPatternFile` strips any existing wrapping first, so
// re-baking on every edit is idempotent and can't stack duplicate headers or
// preserve someone else's credit.
// ─────────────────────────────────────────────────────────────────────────────

export function licenseOptionFor(spdx: string): LicenseOption {
  return licenseBySpdx(spdx);
}

/** Public URL of a community pattern — used for the fork credit line. */
export function communityPatternUrl(id: string): string {
  return `${SHARE_TOOLS.community.url}/p/${id}`;
}

/** Upstream pattern a fork was adapted from, as stored on the parent row. */
export type ParentCredit = {
  id: string;
  title: string;
  username: string | null;
  displayUsername: string | null;
};

export function lineageFrom(parent: ParentCredit | null | undefined): ShareLineage | null {
  if (!parent) return null;
  return {
    title: parent.title,
    handle: parent.displayUsername ?? parent.username ?? null,
    url: communityPatternUrl(parent.id),
  };
}

export type PatternLicenseMeta = {
  title: string;
  license: string; // SPDX
  /** Author handle, without the "@". */
  handle: string | null;
  /** Publication date (ISO or Date) — stays the original date across edits. */
  date: Date | string;
  /** Set on a fork so the original creator stays credited in the source. */
  basedOn?: ShareLineage | null;
};

function shareMeta(meta: PatternLicenseMeta): ShareMeta {
  const date = typeof meta.date === "string" ? meta.date : meta.date.toISOString();
  return {
    title: meta.title,
    author: meta.handle ? `@${meta.handle}` : "(unknown)",
    license: licenseOptionFor(meta.license),
    date: date.slice(0, 10),
    source: "community",
    basedOn: meta.basedOn ?? null,
  };
}

/** The exact text stored in the database and shown in the editor. */
export function buildStoredPatternCode(code: string, meta: PatternLicenseMeta): string {
  return buildSharedPatternFile(code, shareMeta(meta));
}
