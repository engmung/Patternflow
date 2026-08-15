// Performance JSON (proposal §7.1) + the packed PFST v1 show table.
//
// A deck may carry one performance: a timed cue list (pattern / four
// absolute params 0..1000 / banner) authored in the Director PWA. The JSON
// is the editable source and travels in the pack for re-editing; the device
// itself plays only the packed little-endian .pfs table — it has no JSON
// parser on purpose. This module is the server-side twin of the Director's
// performance.js + show-table.js (Simone Majocchi's performance-director
// branch): same normalization, same byte layout, so a .pfs encoded here is
// indistinguishable from one saved out of the Director.
//
// Layout (device: firmware/patternflow/src/core_show.h):
//   header 76 bytes
//     magic[4]="PFST"  version u8=1  flags u8 (bit0 loop)  length u16 s
//     cueCount u16  poolBytes u16  title[32]  id[32] (NUL-padded)
//   string pool  poolBytes (NUL-terminated, offset 0 = "")
//   cues cueCount × 16 bytes
//     t u16 · flags u8 (PATTERN=1 PARAM1..4=2/4/8/16 MESSAGE=32) · reserved
//     patternOff u16 (0xFFFF none) · param[4] u16 · messageOff u16

export const PFST_VERSION = 1;
export const PFST_HEADER_BYTES = 76;
export const PFST_CUE_BYTES = 16;
export const PFST_MAX_CUES = 256;
export const PFST_MAX_POOL = 4096;
export const PFST_OFF_NONE = 0xffff;

const FLAG_PATTERN = 1;
const FLAG_PARAM1 = 2;
const FLAG_MESSAGE = 32;

/** Sparse per-channel values: null = this cue does not touch that channel. */
export type SparseParam = [number | null, number | null, number | null, number | null];

export type PerformanceCue = {
  t: number;
  pattern?: string;
  message?: string;
  param?: SparseParam;
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
  return Math.min(1000, Math.max(0, v));
}

function quantizeTime(t: unknown): number {
  const n = Math.round(Number(t));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
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

function normalizeCue(cue: unknown): PerformanceCue | null {
  if (!cue || typeof cue !== "object") return null;
  const c = cue as Record<string, unknown>;
  const out: PerformanceCue = { t: quantizeTime(c.t) };
  if (c.pattern != null && String(c.pattern).length) out.pattern = String(c.pattern);
  const param = parseParamField(c.param);
  if (param) out.param = param;
  if (c.message != null) out.message = String(c.message);
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
  out.version = Number(r.version) || 1;
  out.id = String(r.id || base.id);
  out.title = String(r.title || base.title);
  out.utcStart = r.utcStart == null ? "" : String(r.utcStart);
  out.channel = Number(r.channel) || 0;
  out.length = Math.max(1, Math.round(Number(r.length) || 60));
  out.loop = !!r.loop;
  out.patternsZip = r.patternsZip == null ? "" : String(r.patternsZip);
  out.patternsZipSha256 = r.patternsZipSha256 == null ? "" : String(r.patternsZipSha256);
  out.required = Array.isArray(r.required) ? r.required.map(String) : [];
  out.timeline = Array.isArray(r.timeline)
    ? r.timeline
        .map(normalizeCue)
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

/** Pack a performance into the PFST v1 bytes the device's /show player reads. */
export function encodePfst(perf: Performance): Uint8Array {
  const cues = perf.timeline;
  if (cues.length > PFST_MAX_CUES) {
    throw new Error(`too many cues (${cues.length}, max ${PFST_MAX_CUES})`);
  }

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
    const t = Math.min(65535, Math.max(0, Math.round(cue.t)));
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
  out[4] = PFST_VERSION;
  out[5] = perf.loop ? 1 : 0;
  view.setUint16(6, Math.min(65535, durationOf(perf)), true);
  view.setUint16(8, cues.length, true);
  view.setUint16(10, poolBytes.length, true);
  out.set(pad32(perf.title), 12);
  out.set(pad32(perf.id), 44);
  out.set(Uint8Array.from(poolBytes), PFST_HEADER_BYTES);
  out.set(cueBytes, PFST_HEADER_BYTES + poolBytes.length);
  return out;
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
