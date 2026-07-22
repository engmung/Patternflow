// Shared input rules for the community — used by both the client forms and the
// API routes (the API is the authority; client checks are UX only).

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export const PASSWORD_MIN = 8;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 2000;
export const CODE_MAX = 100_000; // ~100KB of pattern source
export const COMMENT_MAX = 2000;

export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = raw.trim();
  if (title.length === 0 || title.length > TITLE_MAX) return null;
  return title;
}

export function cleanDescription(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined; // invalid
  const description = raw.trim();
  if (description.length > DESCRIPTION_MAX) return undefined;
  return description.length === 0 ? null : description;
}

export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.trim().length === 0 || raw.length > CODE_MAX) return null;
  return raw;
}

export function cleanComment(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.trim();
  if (body.length === 0 || body.length > COMMENT_MAX) return null;
  return body;
}
