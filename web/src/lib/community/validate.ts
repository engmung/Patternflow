// Shared input rules for the community — used by both the client forms and the
// API routes (the API is the authority; client checks are UX only).

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export const PASSWORD_MIN = 8;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 2000;
export const CODE_MAX = 100_000; // ~100KB of pattern source
export const CPP_MAX = 200_000; // headers carry baked LUT tables, so allow more
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

/**
 * Firmware header check. We cannot compile ESP32 C++ here, so this is a shape
 * check only — enough to reject a pasted JS file or truncated output, not a
 * guarantee the header builds. The UI says so; the author's own hardware test
 * is the real verification.
 *
 * Returns the cleaned header, `null` to CLEAR the field, or `undefined` when
 * the input is invalid.
 */
export function cleanCpp(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const cpp = raw.trim();
  if (cpp.length === 0) return null; // explicit clear
  if (cpp.length > CPP_MAX) return undefined;
  if (!/^\s*#pragma\s+once\b/m.test(cpp)) return undefined;
  return cpp;
}

/**
 * "Made on" date: YYYY-MM-DD, a real calendar day, not in the future.
 * Returns the value, `null` to clear it, or `undefined` when invalid.
 */
export function cleanMadeOn(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (value.length === 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // Round-trip catches days that don't exist, e.g. 2026-02-31 rolling over.
  if (parsed.toISOString().slice(0, 10) !== value) return undefined;
  // A day of slack so a timezone ahead of the server isn't rejected.
  if (parsed.getTime() > Date.now() + 86_400_000) return undefined;
  return value;
}

export function cleanComment(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.trim();
  if (body.length === 0 || body.length > COMMENT_MAX) return null;
  return body;
}
