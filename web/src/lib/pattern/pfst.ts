import { BUS_WIRE_MAX } from "@/lib/pattern/controls";

// Performance JSON (proposal §7.1) + the packed PFST v1 show table.
//
// A performance is a timed cue list (pattern / four absolute params 0..1000 /
// banner) authored in the Director PWA. **The `.pfs` table is the document**:
// the Director opens and saves it, the panel plays it, and it is what the site
// hands anyone who wants to edit or install one. It carries everything a
// recording is, sparse param patches included, because the cue flags record
// which channels each cue set.
//
// The JSON here is the site's own canonical form — what the database stores,
// what summaries and validation read, and what regenerates the table on the
// way out. It is not a second document to keep in step with the first; it has
// no life outside this server. (It was briefly the editable source, back when
// the Director edited JSON.)
//
// Byte layout matches the Director's show-table.js exactly — verified against
// all four of its demo tables in both directions — so a table encoded here is
// indistinguishable from one it saved.
//
// Layout (device: firmware/patternflow/features/show/core_show.h):
//   header 76 bytes
//     magic[4]="PFST"  version u8=1  flags u8 (bit0 loop)  length u16 s
//     cueCount u16  poolBytes u16  title[32]  id[32] (NUL-padded)
//   string pool  poolBytes (NUL-terminated, offset 0 = "")
//   cues cueCount × 16 bytes
//     t u16 · flags u8 (PATTERN=1 PARAM1..4=2/4/8/16 MESSAGE=32) · reserved
//     patternOff u16 (0xFFFF none) · param[4] u16 · messageOff u16

export const PFST_VERSION = 1;
/**
 * PFST v2 — same 76-byte header, same 16-byte cue, two reinterpretations:
 * cue `t` and the header length are DECISECONDS (0.1 s ticks, so a u16 still
 * holds ~109 minutes), and flag bit 6 (EASE) on a cue means "interpolate the
 * param channels this cue sets linearly toward each channel's next cue".
 * Smoothness is thereby a per-cue property instead of a cue-count cost —
 * dense baking at 0.2 s would burn the 256-cue budget in under a minute of
 * one-lane animation; an eased segment is 2 cues however long it runs.
 * Specified in docs/pfst-v2-spec.md; the device player gates on
 * the version byte, so v1 players reject v2 tables cleanly.
 */
export const PFST_VERSION_2 = 2;
export const PFST_HEADER_BYTES = 76;
export const PFST_CUE_BYTES = 16;
export const PFST_MAX_CUES = 256;
export const PFST_MAX_POOL = 4096;
export const PFST_OFF_NONE = 0xffff;

const FLAG_PATTERN = 1;
const FLAG_PARAM1 = 2;
/** PARAM1|PARAM2|PARAM3|PARAM4 — "this cue touches at least one channel". */
const FLAG_PARAM_ANY = 2 | 4 | 8 | 16;
const FLAG_MESSAGE = 32;
/** v2 only: lerp this cue's set channels toward their next values. */
const FLAG_EASE = 64;

/** Sparse per-channel values: null = this cue does not touch that channel. */
export type SparseParam = [number | null, number | null, number | null, number | null];

export type PerformanceCue = {
  t: number;
  pattern?: string;
  message?: string;
  param?: SparseParam;
  /** v2: interpolate the set channels linearly toward their next cues. */
  ease?: boolean;
};

export type Performance = {
  version: number;
  id: string;
  title: string;
  utcStart: string;
  channel: number;
  length: number;
  loop: boolean;
  patternsZip: string;
  patternsZipSha256: string;
  required: string[];
  timeline: PerformanceCue[];
};

export function clamp1000(n: unknown): number {
  let v = Math.round(Number(n));
  if (!Number.isFinite(v)) v = 500;
  return Math.min(BUS_WIRE_MAX, Math.max(0, v));
}

/** v1 cues sit on whole seconds; v2 cues on the 0.1 s grid. */
function quantizeTime(t: unknown, deciseconds: boolean): number {
  const raw = Number(t);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return deciseconds ? Math.round(raw * 10) / 10 : Math.round(raw);
}

function parseParamField(raw: unknown): SparseParam | null {
  const out: SparseParam = [null, null, null, null];
  if (Array.isArray(raw)) {
    for (let i = 0; i < 4 && i < raw.length; i++) {
      if (raw[i] == null || raw[i] === "") continue;
      out[i] = clamp1000(raw[i]);
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v == null || v === "") continue;
      let i = Number(k);
      if (!Number.isFinite(i)) continue;
      if (i >= 1 && i <= 4) i -= 1;
      else if (i < 0 || i > 3) continue;
      out[i] = clamp1000(v);
    }
  } else {
    return null;
  }
  return out.every((x) => x == null) ? null : out;
}

function normalizeCue(cue: unknown, deciseconds: boolean): PerformanceCue | null {
  if (!cue || typeof cue !== "object") return null;
  const c = cue as Record<string, unknown>;
  const out: PerformanceCue = { t: quantizeTime(c.t, deciseconds) };
  if (c.pattern != null && String(c.pattern).length) out.pattern = String(c.pattern);
  const param = parseParamField(c.param);
  if (param) out.param = param;
  if (c.message != null) out.message = String(c.message);
  if (deciseconds && c.ease === true && out.param) out.ease = true;
  if (out.pattern == null && out.param == null && out.message == null) return null;
  return out;
}

function cueKindOrder(cue: PerformanceCue): number {
  if (cue.pattern != null) return 0;
  if (cue.param) return 1;
  if (cue.message != null) return 2;
  return 3;
}

/** Same defaulting the Director applies, so both sides agree on the shape. */
export function normalizePerformance(raw: unknown): Performance {
  const base: Performance = {
    version: 1,
    id: "untitled",
    title: "Untitled",
    utcStart: "",
    channel: 0,
    length: 60,
    loop: false,
    patternsZip: "",
    patternsZipSha256: "",
    required: [],
    timeline: [],
  };
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const out = { ...base };
  // Only the two known table versions exist; anything else reads as v1.
  out.version = Number(r.version) === PFST_VERSION_2 ? PFST_VERSION_2 : 1;
  const deciseconds = out.version === PFST_VERSION_2;
  out.id = String(r.id || base.id);
  out.title = String(r.title || base.title);
  out.utcStart = r.utcStart == null ? "" : String(r.utcStart);
  out.channel = Number(r.channel) || 0;
  out.length = deciseconds
    ? Math.max(0.1, Math.round((Number(r.length) || 60) * 10) / 10)
    : Math.max(1, Math.round(Number(r.length) || 60));
  out.loop = !!r.loop;
  out.patternsZip = r.patternsZip == null ? "" : String(r.patternsZip);
  out.patternsZipSha256 = r.patternsZipSha256 == null ? "" : String(r.patternsZipSha256);
  out.required = Array.isArray(r.required) ? r.required.map(String) : [];
  out.timeline = Array.isArray(r.timeline)
    ? r.timeline
        .map((cue) => normalizeCue(cue, deciseconds))
        .filter((c): c is PerformanceCue => c != null)
        .sort((a, b) => (a.t !== b.t ? a.t - b.t : cueKindOrder(a) - cueKindOrder(b)))
    : [];
  return out;
}

/** Timeline extent in seconds. Authoring length wins; never shorter than the last cue. */
export function durationOf(perf: Performance): number {
  let maxCue = 0;
  for (const c of perf.timeline) if (c.t > maxCue) maxCue = c.t;
  return Math.max(perf.length, maxCue);
}

/** Distinct display names the timeline actually selects (for availability checks). */
export function timelinePatternNames(perf: Performance): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cue of perf.timeline) {
    const name = (cue.pattern ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** JSON-facing form: dense param arrays stay arrays, sparse become 1-based objects. */
export function serializePerformance(perf: Performance): Record<string, unknown> {
  return {
    version: perf.version,
    id: perf.id,
    title: perf.title,
    utcStart: perf.utcStart,
    channel: perf.channel,
    length: perf.length,
    loop: perf.loop,
    patternsZip: perf.patternsZip,
    patternsZipSha256: perf.patternsZipSha256,
    required: perf.required,
    timeline: perf.timeline.map((cue) => {
      const out: Record<string, unknown> = { t: cue.t };
      if (cue.pattern != null) out.pattern = cue.pattern;
      if (cue.message != null) out.message = cue.message;
      if (cue.ease === true) out.ease = true;
      if (cue.param) {
        const dense = cue.param.every((v) => v != null);
        if (dense) {
          out.param = cue.param.map((n) => clamp1000(n));
        } else {
          const obj: Record<string, number> = {};
          for (let i = 0; i < 4; i++) {
            if (cue.param[i] != null) obj[String(i + 1)] = clamp1000(cue.param[i]);
          }
          out.param = obj;
        }
      }
      return out;
    }),
  };
}

/**
 * Parse + validate a performance the way the encoder will see it. Returns the
 * normalized performance or the reason it cannot ship — the same limits the
 * device enforces, checked here so the author hears about it at attach time
 * rather than as a silent refusal on the panel.
 */
export function validatePerformance(
  rawJson: string,
): { ok: true; perf: Performance } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  const perf = normalizePerformance(parsed);
  if (perf.timeline.length === 0) {
    return { ok: false, error: "The timeline has no usable cues." };
  }
  if (perf.timeline.length > PFST_MAX_CUES) {
    return { ok: false, error: `Too many cues (${perf.timeline.length}; the device holds ${PFST_MAX_CUES}).` };
  }
  try {
    encodePfst(perf);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Cannot encode show table." };
  }
  return { ok: true, perf };
}

/**
 * Read a PFST table back into a performance.
 *
 * This is the import path, since `.pfs` is what the Director saves and what
 * people therefore have. It is lossless for what a recording IS: the cue flags
 * record exactly which param channels a cue set, so even a sparse patch
 * survives. What it does not carry is show-management dressing (utcStart,
 * channel, patternsZip and its hash, the required list); those come back
 * empty, which is what they are for a recording published here anyway.
 *
 * Round-tripped in performance-smoke against the Director's own saves:
 * decode → encode reproduces the original bytes.
 */
export function decodePfst(bytes: Uint8Array): Performance {
  if (bytes.length < PFST_HEADER_BYTES) throw new Error("not a PFST table (too short)");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x46 || bytes[2] !== 0x53 || bytes[3] !== 0x54) {
    throw new Error("not a PFST table (bad magic)");
  }
  const version = bytes[4];
  if (version !== PFST_VERSION && version !== PFST_VERSION_2) {
    throw new Error(`unsupported PFST version ${version}`);
  }
  // v2 stores times in deciseconds; everything else is byte-identical.
  const tick = version === PFST_VERSION_2 ? 10 : 1;

  const loop = (bytes[5] & 1) === 1;
  const length = view.getUint16(6, true) / tick;
  const cueCount = view.getUint16(8, true);
  const poolLength = view.getUint16(10, true);
  if (cueCount > PFST_MAX_CUES) throw new Error(`too many cues (${cueCount})`);
  if (poolLength > PFST_MAX_POOL) throw new Error(`string pool too large (${poolLength})`);

  const expected = PFST_HEADER_BYTES + poolLength + cueCount * PFST_CUE_BYTES;
  if (bytes.length < expected) throw new Error("PFST table is truncated");

  const readFixed = (at: number, size: number): string => {
    let end = at;
    while (end < at + size && bytes[end] !== 0) end++;
    return new TextDecoder().decode(bytes.subarray(at, end));
  };
  const title = readFixed(12, 32);
  const id = readFixed(44, 32);

  const pool = bytes.subarray(PFST_HEADER_BYTES, PFST_HEADER_BYTES + poolLength);
  const poolString = (offset: number): string => {
    if (offset === PFST_OFF_NONE || offset >= pool.length) return "";
    let end = offset;
    while (end < pool.length && pool[end] !== 0) end++;
    return new TextDecoder().decode(pool.subarray(offset, end));
  };

  const timeline: PerformanceCue[] = [];
  const cueBase = PFST_HEADER_BYTES + poolLength;
  for (let i = 0; i < cueCount; i++) {
    const at = cueBase + i * PFST_CUE_BYTES;
    const flags = bytes[at + 2];
    const cue: PerformanceCue = { t: view.getUint16(at, true) / tick };
    if (version === PFST_VERSION_2 && flags & FLAG_EASE) cue.ease = true;
    if (flags & FLAG_PATTERN) {
      const name = poolString(view.getUint16(at + 4, true));
      if (name) cue.pattern = name;
    }
    if (flags & FLAG_PARAM_ANY) {
      const param: SparseParam = [null, null, null, null];
      for (let c = 0; c < 4; c++) {
        if (flags & (FLAG_PARAM1 << c)) param[c] = view.getUint16(at + 6 + c * 2, true);
      }
      cue.param = param;
    }
    if (flags & FLAG_MESSAGE) {
      cue.message = poolString(view.getUint16(at + 14, true));
    }
    if (cue.pattern == null && cue.param == null && cue.message == null) continue;
    timeline.push(cue);
  }

  // Through normalize so a decoded table lands in exactly the shape a pasted
  // JSON would — same defaults, same cue ordering.
  return normalizePerformance({
    version,
    id,
    title,
    length,
    loop,
    timeline: timeline.map((cue) => ({
      t: cue.t,
      ...(cue.pattern != null ? { pattern: cue.pattern } : {}),
      ...(cue.message != null ? { message: cue.message } : {}),
      ...(cue.param ? { param: cue.param } : {}),
      ...(cue.ease === true ? { ease: true } : {}),
    })),
  });
}

/**
 * Pack a performance into the PFST bytes the device's /show player reads —
 * v1 (whole-second cues) byte-for-byte as always, v2 (deciseconds + EASE)
 * when the performance says so.
 */
export function encodePfst(perf: Performance): Uint8Array {
  const cues = perf.timeline;
  if (cues.length > PFST_MAX_CUES) {
    throw new Error(`too many cues (${cues.length}, max ${PFST_MAX_CUES})`);
  }
  const version = perf.version === PFST_VERSION_2 ? PFST_VERSION_2 : PFST_VERSION;
  const tick = version === PFST_VERSION_2 ? 10 : 1;

  // String pool: offset 0 is the empty string, entries dedupe.
  const poolBytes: number[] = [0];
  const poolMap = new Map<string, number>([["", 0]]);
  const intern = (raw: string): number => {
    const existing = poolMap.get(raw);
    if (existing != null) return existing;
    const off = poolBytes.length;
    for (let i = 0; i < raw.length; i++) poolBytes.push(raw.charCodeAt(i) & 255);
    poolBytes.push(0);
    poolMap.set(raw, off);
    return off;
  };

  const cueBytes = new Uint8Array(cues.length * PFST_CUE_BYTES);
  const cueView = new DataView(cueBytes.buffer);
  cues.forEach((cue, i) => {
    const base = i * PFST_CUE_BYTES;
    const t = Math.min(65535, Math.max(0, Math.round(cue.t * tick)));
    let flags = 0;
    let patternOff = PFST_OFF_NONE;
    let messageOff = PFST_OFF_NONE;
    const param = [0, 0, 0, 0];
    if (cue.pattern != null && cue.pattern.length) {
      flags |= FLAG_PATTERN;
      patternOff = intern(cue.pattern);
    }
    if (cue.param) {
      for (let c = 0; c < 4; c++) {
        if (cue.param[c] == null) continue;
        flags |= FLAG_PARAM1 << c;
        param[c] = clamp1000(cue.param[c]);
      }
    }
    if (cue.message != null) {
      flags |= FLAG_MESSAGE;
      messageOff = intern(cue.message);
    }
    if (version === PFST_VERSION_2 && cue.ease === true && flags & FLAG_PARAM_ANY) {
      flags |= FLAG_EASE;
    }
    cueView.setUint16(base, t, true);
    cueBytes[base + 2] = flags & 255;
    cueBytes[base + 3] = 0;
    cueView.setUint16(base + 4, patternOff, true);
    cueView.setUint16(base + 6, param[0], true);
    cueView.setUint16(base + 8, param[1], true);
    cueView.setUint16(base + 10, param[2], true);
    cueView.setUint16(base + 12, param[3], true);
    cueView.setUint16(base + 14, messageOff, true);
  });

  if (poolBytes.length > PFST_MAX_POOL) {
    throw new Error(`string pool is ${poolBytes.length} bytes (max ${PFST_MAX_POOL})`);
  }

  const pad32 = (str: string): Uint8Array => {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32 && i < str.length; i++) out[i] = str.charCodeAt(i) & 255;
    return out;
  };

  const out = new Uint8Array(PFST_HEADER_BYTES + poolBytes.length + cueBytes.length);
  const view = new DataView(out.buffer);
  out[0] = 0x50; // P
  out[1] = 0x46; // F
  out[2] = 0x53; // S
  out[3] = 0x54; // T
  out[4] = version;
  out[5] = perf.loop ? 1 : 0;
  view.setUint16(6, Math.min(65535, Math.round(durationOf(perf) * tick)), true);
  view.setUint16(8, cues.length, true);
  view.setUint16(10, poolBytes.length, true);
  out.set(pad32(perf.title), 12);
  out.set(pad32(perf.id), 44);
  out.set(Uint8Array.from(poolBytes), PFST_HEADER_BYTES);
  out.set(cueBytes, PFST_HEADER_BYTES + poolBytes.length);
  return out;
}

/**
 * What a listing says about a stored performance without re-validating it.
 * Client-safe (no node imports) — pages and cards share this so "5 cues,
 * 0:30" means the same thing everywhere.
 */
export function summarizePerformanceJson(
  json: string | null,
): { title: string; cues: number; seconds: number } | null {
  if (!json) return null;
  try {
    const perf = JSON.parse(json) as { title?: unknown; length?: unknown; timeline?: unknown[] };
    const timeline = Array.isArray(perf.timeline) ? perf.timeline : [];
    let last = 0;
    for (const cue of timeline) {
      const t = Number((cue as { t?: unknown }).t) || 0;
      if (t > last) last = t;
    }
    return {
      title: String(perf.title || "Untitled"),
      cues: timeline.length,
      seconds: Math.max(Math.round(Number(perf.length) || 0), last),
    };
  } catch {
    return null;
  }
}

/** `<id-or-title>.pfs`, slugged the way the Director names its saves. */
export function pfsFilename(perf: Performance): string {
  const raw = perf.id || perf.title || "performance";
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  return `${slug || "performance"}.pfs`;
}
