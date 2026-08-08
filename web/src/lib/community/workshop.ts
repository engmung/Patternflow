// The map's rules, in one place.
//
// A territory is a DIRECTION somebody could take Patternflow — "OSC over a
// wire", "a laser-cut version", "port it to a bigger panel" — not a milestone.
// That is why this is not derived from /roadmap: the roadmap is what ships and
// when, and a direction can sit open for a year with two people poking at it
// and still deserve a place on the map.

/** Node codes: a letter and a number, like a seat. Uppercase, and part of the
 *  URL — /community/workshop/a3 — so it has to survive a round trip through a path. */
export const TERRITORY_CODE_RE = /^[A-Z][0-9]{1,2}$/;

export const TERRITORY_TITLE_MAX = 60;
export const TERRITORY_DESC_MAX = 240;

/** What someone is doing in a territory, in a few words: "steel front". Short
 *  on purpose — the thread is where the explaining goes. */
export const PIN_NOTE_MAX = 60;

/** A presence status — the speech-bubble line beside somebody's square on the
 *  constellation. Same register as a pin note, deliberately the same cap. */
export const STATUS_MAX = 60;

/** Open questions: dashed chips hanging off a node, so they stay label-length.
 *  Exported because the editor has to enforce the same cap the route does — a
 *  limit only the server knows about is a limit that shows up as a 400. */
export const QUESTIONS_MAX = 4;
export const QUESTION_MAX = 60;

/** The constellation stage, in the design's coordinates. Node positions are
 *  stored against this and scaled to whatever the viewport turns out to be. */
export const STAGE_WIDTH = 1440;
export const STAGE_HEIGHT = 640;

/** Floor plan: a six-column grid, each zone spanning two to six of them. */
export const FLOOR_COLUMNS = 6;
export const SPAN_MIN = 2;
export const SPAN_MAX = 6;

// ── Attachments ──────────────────────────────────────────────────────────────
// The thing that makes a territory somewhere work happens rather than somewhere
// it is described: the DXF, the tolerance notes, the header that finally built.
//
// This is not a file host, and it runs on a Raspberry Pi. The caps are small
// and the allowlist is short — a maker hands over drawings, notes and source,
// and anything bigger belongs in a repo with a link to it.

export const ATTACHMENT_MAX_PER_PARENT = 5;
export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_FILENAME_MAX = 80;

/**
 * How much one person may store, in total, and how much everyone may.
 *
 * The per-parent cap bounds one thread; it does not bound an account, because
 * an account can make more threads. Without these two the only ceiling is the
 * disk the server boots from, and when that fills SQLite stops being able to
 * write — the community does not degrade, it stops.
 *
 * 100 MB is roomy for the real case (a build log with photos is a few MB a
 * thread) and small enough that filling the box takes a deliberate campaign
 * across many accounts rather than one afternoon on one.
 */
export const ATTACHMENT_MAX_PER_USER_BYTES = 100 * 1024 * 1024;

/** The whole community's ceiling. Override per deployment — a Pi on an SD card
 *  and a box with a spare terabyte want different numbers. */
export const ATTACHMENT_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * The largest multipart body worth reading at all.
 *
 * Size is checked per file, but only AFTER formData() has parsed the whole
 * request into memory — so the per-file cap does nothing about a single
 * enormous body. This is the number the route checks against Content-Length
 * before it starts parsing: the most a legitimate upload can be, plus slack
 * for multipart framing.
 */
export const ATTACHMENT_MAX_REQUEST_BYTES =
  ATTACHMENT_MAX_PER_PARENT * ATTACHMENT_MAX_BYTES + 1024 * 1024;

/** Extensions that get through. An allowlist rather than a blocklist: the set
 *  of things a maker actually attaches is small and knowable, and the set of
 *  things a browser can be talked into executing is not. */
export const ATTACHMENT_EXTENSIONS = [
  // drawings and models
  "dxf", "svg", "stl", "step", "stp", "3mf", "f3d",
  // notes and data
  "md", "txt", "csv", "json", "yaml", "yml",
  // source
  "h", "hpp", "c", "cpp", "ino", "js", "py",
  // pictures and documents
  "png", "jpg", "jpeg", "webp", "gif", "pdf",
  // a bundle of the above
  "zip",
] as const;

export function attachmentExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function attachmentAllowed(filename: string): boolean {
  return (ATTACHMENT_EXTENSIONS as readonly string[]).includes(attachmentExtension(filename));
}

/**
 * The name shown next to the file. Path separators, control characters and
 * leading dots are stripped: this is a label, and the only thing standing
 * between it and a header injection or a directory traversal is this function.
 */
export function cleanFilename(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const base = raw.split(/[\\/]/).pop() ?? "";
  // Filtered by codepoint rather than by regex: the characters being removed
  // are exactly the ones that do not survive being written into source.
  let kept = "";
  for (const char of base) {
    const code = char.codePointAt(0) ?? 0;
    // C0 controls, DEL, and the double quote that would close the
    // Content-Disposition filename this string ends up inside.
    if (code < 0x20 || code === 0x7f || char === '"') continue;
    kept += char;
  }
  // A leading dot makes it a hidden file, and enough of them is a traversal.
  while (kept.startsWith(".")) kept = kept.slice(1);
  const safe = kept.trim().slice(0, ATTACHMENT_FILENAME_MAX);
  return safe.length > 0 ? safe : null;
}

/**
 * Raster formats a browser may ever see inline. Display-side judgement only —
 * the serving route re-checks the actual bytes before sending anything with
 * an image content type. SVG is deliberately absent: it is a document, and a
 * document on our origin is a script.
 */
export const RASTER_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;

export function isImageFilename(filename: string): boolean {
  return (RASTER_EXTENSIONS as readonly string[]).includes(attachmentExtension(filename));
}

/** Human size for the chip under a thread: "42 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Validation ───────────────────────────────────────────────────────────────

export function cleanTerritoryCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return TERRITORY_CODE_RE.test(code) ? code : null;
}

/** Every cleaner below returns `undefined` for "the caller sent something
 *  unusable" and a value (or null, where null is legal) otherwise — same
 *  convention as validate.ts, so route handlers read the same way. */

export function cleanTerritoryTitle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const title = raw.trim().replace(/\s+/g, " ");
  if (title.length === 0 || title.length > TERRITORY_TITLE_MAX) return undefined;
  return title;
}

export function cleanTerritoryDescription(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const description = raw.trim();
  if (description.length === 0) return null;
  return description.length <= TERRITORY_DESC_MAX ? description : undefined;
}

/** Floor-plan width, in columns of six. */
export function cleanSpan(raw: unknown): number | undefined {
  const span = Math.round(Number(raw));
  if (!Number.isFinite(span) || span < SPAN_MIN || span > SPAN_MAX) return undefined;
  return span;
}

/**
 * A constellation coordinate, clamped rather than rejected: the editor places
 * nodes by clicking a stage, and a click a pixel outside it is a slip, not an
 * error worth refusing a save over.
 */
export function cleanStageCoord(raw: unknown, axis: "x" | "y"): number | undefined {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value)) return undefined;
  const max = axis === "x" ? STAGE_WIDTH : STAGE_HEIGHT;
  return Math.max(0, Math.min(max, value));
}

/**
 * The open-questions textarea: one per line, at most four (parseQuestions reads
 * the same cap, so anything beyond it would be silently invisible).
 *
 * Extra lines are DROPPED but a long line is REFUSED, and the asymmetry is
 * deliberate: the fifth question is still there in the textarea to be moved into
 * a thread, whereas silently trimming a sentence to fit a chip would publish
 * half of what somebody wrote under their name.
 */
export function cleanQuestions(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, QUESTIONS_MAX);
  if (lines.some((line) => line.length > QUESTION_MAX)) return undefined;
  return lines.length > 0 ? lines.join("\n") : null;
}

/** The over-long question, for an error message that says which one. Kept next
 *  to the cleaner so the two cannot drift apart. */
export function overlongQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return (
    raw
      .split("\n")
      .map((line) => line.trim())
      .slice(0, QUESTIONS_MAX)
      .find((line) => line.length > QUESTION_MAX) ?? null
  );
}

export function cleanPinNote(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const note = raw.trim().replace(/\s+/g, " ");
  if (note.length === 0) return null;
  return note.length <= PIN_NOTE_MAX ? note : undefined;
}

/** Same convention: null clears it, undefined means "refuse the save". */
export function cleanStatus(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const status = raw.trim().replace(/\s+/g, " ");
  if (status.length === 0) return null;
  return status.length <= STATUS_MAX ? status : undefined;
}

/** Open questions are stored one per line — they are labels on the map, not
 *  records, so a textarea is the whole editor they need. */
export function parseQuestions(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, QUESTIONS_MAX);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "since Jul 30". Read straight off the ISO string rather than through
 *  toLocaleDateString, which would render differently on the server and in the
 *  browser and hydrate as a mismatch. */
export function formatSince(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}` : "";
}
