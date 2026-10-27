// The URL rule for anything a member wrote, in one testable place.
//
// react-markdown has its own urlTransform and it is not bad, but "the library
// probably strips that" is not a thing to find out from a bug report. This is
// the rule, markdown.test.ts holds it to each case, and PostBody calls it.

/** Characters a browser skips while parsing a scheme. A NUL or a tab inside
 *  `java\tscript:` is the classic way past a naive startsWith check, so they
 *  come out before anything is compared. */
const IGNORED = /[\u0000-\u0020]/g;

/** A browser reads a backslash in an http(s) URL as a slash, so `/\host`,
 *  `\\host` and `\/host` all go to `//host`. The rule reads it the same way. */
const BACKSLASH = /\\/g;

const probeOf = (raw: string) => raw.replace(IGNORED, "").replace(BACKSLASH, "/").toLowerCase();

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

  const probe = probeOf(raw);
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

/**
 * Whether a link safeHref kept opens in this tab: an anchor, a query, or a
 * path from the root of this site. A footnote is `#user-content-…`, and
 * opening the whole page again in a new tab to show it is what happened
 * until 26 October. Everything else opens a new tab, a bare `example.com/x`
 * too: a browser puts it on this site, but whoever wrote it meant that one.
 */
export function opensHere(safe: string): boolean {
  const probe = probeOf(safe);
  if (probe.startsWith("//")) return false;
  return probe.startsWith("/") || probe.startsWith("#") || probe.startsWith("?");
}
