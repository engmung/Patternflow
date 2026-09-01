// ── Shader twin storage ──────────────────────────────────────────────────────
// A shader belongs to the code layer it was converted from, but it is not part
// of the pattern: the project format (serialize.ts) stays exactly what the
// device and the community share. So it lives here, in the capture module's own
// localStorage — a working file next to the pattern rather than a second thing
// to publish.
//
// Filed under TWO keys, because neither one alone survives the way people work:
//   id:<layer>    holds while the tab is open, so switching between two code
//                 layers switches between their twins — and an edit to the JS
//                 does not orphan the shader written for it.
//   code:<hash>   the lab does not persist its project, so every reload mints
//                 new layer ids; the hash of the pattern source is what says
//                 "this twin is this pattern's" across one.
// Reading tries the id first and falls back to the hash. Writing does both.
//
// Bounded on purpose: the newest few, a couple of hundred KB. A shader lost to
// pruning is one re-paste; a full quota breaks saving settings too.

const STORAGE_KEY = "patternflow_lab_shader_v1";
const MAX_ENTRIES = 12;
const MAX_TOTAL_CHARS = 200_000;

type Entry = { source: string; at: number };
type Store = Record<string, Entry>;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function keysFor(layerId: string, code: string): string[] {
  return [`id:${layerId}`, `code:${hash(code)}`];
}

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const store: Store = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as { source?: unknown; at?: unknown };
      if (typeof entry.source !== "string") continue;
      store[key] = { source: entry.source, at: typeof entry.at === "number" ? entry.at : 0 };
    }
    return store;
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  const entries = Object.entries(store).sort((a, b) => b[1].at - a[1].at);
  const kept: Store = {};
  let total = 0;
  for (const [key, entry] of entries.slice(0, MAX_ENTRIES)) {
    total += entry.source.length;
    if (total > MAX_TOTAL_CHARS) break;
    kept[key] = entry;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Quota or private mode: the shader stays in the panel for this session.
  }
}

export function loadShaderSource(layerId: string, code: string): string {
  const store = read();
  for (const key of keysFor(layerId, code)) {
    const entry = store[key];
    if (entry) return entry.source;
  }
  return "";
}

export function saveShaderSource(layerId: string, code: string, source: string) {
  const store = read();
  const at = Date.now();
  for (const key of keysFor(layerId, code)) {
    if (source.trim()) {
      store[key] = { source, at };
    } else {
      delete store[key];
    }
  }
  write(store);
}
