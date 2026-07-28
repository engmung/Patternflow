// Recent Pattern Lab works, so opening somebody else's pattern cannot cost
// you yours.
//
// Until now the lab had exactly one autosaved project, and "Open in Pattern
// Lab" from the community dropped the opened pattern's layers ON TOP of it.
// For a plain pattern that was one extra layer to delete; for a shared
// composition it was somebody else's whole stack interleaved with yours,
// blending into a mess with no undo. Opening now replaces the canvas, and
// what was in progress is stashed here first.
//
// A ring of three, newest first. Three is enough to cover the actual mistake
// ("I opened two patterns in a row and want my own work back") without
// turning into a file manager that needs naming, renaming and deleting.
//
// Size: a project is mostly code, a few KB, unless it has pixel layers, whose
// RGBA bytes serialize as base64 — a 128x64 pixel layer is ~43 KB. Three
// heavily painted sessions are on the order of half a megabyte against a 5 MB
// localStorage budget, and a quota failure drops the oldest and retries
// rather than breaking the save.

const KEY = "patternflow_lab_sessions_v1";

export const MAX_SESSIONS = 3;

export type SessionMeta = {
  id: string;
  /** Best-effort label: the fork source, or the first layer's name. */
  title: string;
  savedAt: number;
  layerCount: number;
  bytes: number;
};

type StoredSession = SessionMeta & { json: string };

function read(): StoredSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredSession =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as StoredSession).id === "string" &&
        typeof (entry as StoredSession).json === "string",
    );
  } catch {
    return [];
  }
}

/** Writes, shedding the oldest entries until it fits. */
function write(sessions: StoredSession[]): void {
  if (typeof window === "undefined") return;
  const queue = sessions.slice(0, MAX_SESSIONS);
  while (queue.length > 0) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(queue));
      return;
    } catch {
      queue.pop(); // quota — give up the oldest and try again
    }
  }
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

export function listSessions(): SessionMeta[] {
  return read().map(({ json: _json, ...meta }) => meta);
}

/**
 * Push a serialized project onto the ring. Returns false when there was
 * nothing worth keeping.
 */
export function stashSession(json: string, title: string, layerCount: number): boolean {
  if (typeof window === "undefined") return false;
  if (!json || layerCount === 0) return false;
  const entry: StoredSession = {
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim() || "Untitled work",
    savedAt: Date.now(),
    layerCount,
    bytes: json.length,
    json,
  };
  write([entry, ...read()]);
  return true;
}

/** Serialized project for a session, or null if it is gone. */
export function readSession(id: string): string | null {
  return read().find((entry) => entry.id === id)?.json ?? null;
}

export function deleteSession(id: string): void {
  write(read().filter((entry) => entry.id !== id));
}
