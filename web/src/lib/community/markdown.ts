// The URL rule for anything a member wrote, in one testable place.
//
// react-markdown has its own urlTransform and it is not bad, but "the library
// probably strips that" is not a thing to find out from a bug report. This is
// the rule, it is asserted in the smoke test, and PostBody calls it.

/** Characters a browser skips while parsing a scheme. A NUL or a tab inside
 *  `java\tscript:` is the classic way past a naive startsWith check, so they
 *  come out before anything is compared. */
const IGNORED = /[\u0000-\u0020]/g;

/**
 * The href to actually render, or null to render the link as plain text.
 *
 * http and https only. Everything else — `javascript:`, `data:`, `vbscript:`,
 * `file:`, a bare `//host` that inherits the page's scheme — comes back null.
 * Protocol-relative is refused rather than upgraded: it is nearly always a
 * paste artefact, and silently picking a scheme on somebody's behalf is how a
 * page ends up fetching over http from https.
 */
export function safeHref(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;

  const probe = raw.replace(IGNORED, "").toLowerCase();
  if (probe.length === 0) return null;

  if (probe.startsWith("//")) return null;
  // Relative, anchor and query links are fine and stay untouched.
  if (probe.startsWith("/") || probe.startsWith("#") || probe.startsWith("?")) return raw;

  // Anything carrying a scheme has to be one of ours. A bare `example.com/x`
  // has no colon before its first slash and counts as relative, as markdown
  // itself treats it.
  const colon = probe.indexOf(":");
  if (colon === -1) return raw;
  const slash = probe.indexOf("/");
  if (slash !== -1 && slash < colon) return raw; // "path/a:b" — not a scheme

  const scheme = probe.slice(0, colon);
  return scheme === "http" || scheme === "https" ? raw : null;
}
