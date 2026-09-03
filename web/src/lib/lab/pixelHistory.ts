// ── Pixel layer undo / redo ──────────────────────────────────────────────────
// Snapshots of a pixel layer's RGBA buffer, keyed by layer id, kept outside
// React: buffers, not state. The Pixel panel calls snapshot() before a stroke,
// undo()/redo() on the keys, and prune() with the live layer ids so a deleted
// layer's stacks — up to MAX_UNDO frames of RGBA — do not live for the tab.

export const MAX_UNDO = 40;

type History = { undo: Uint8ClampedArray[]; redo: Uint8ClampedArray[] };

const histories = new Map<string, History>();

function historyFor(id: string): History {
  let history = histories.get(id);
  if (!history) {
    history = { undo: [], redo: [] };
    histories.set(id, history);
  }
  return history;
}

/** Remember the buffer as it is now, before it changes. Clears the redo stack. */
export function snapshotPixels(id: string, data: Uint8ClampedArray): void {
  const history = historyFor(id);
  history.undo.push(new Uint8ClampedArray(data));
  if (history.undo.length > MAX_UNDO) history.undo.shift();
  history.redo = [];
}

/** Restore the previous snapshot INTO `data`. False when there is none. */
export function undoPixels(id: string, data: Uint8ClampedArray): boolean {
  const history = historyFor(id);
  const previous = history.undo.pop();
  if (!previous) return false;
  history.redo.push(new Uint8ClampedArray(data));
  data.set(previous);
  return true;
}

/** Re-apply the last undone snapshot INTO `data`. False when there is none. */
export function redoPixels(id: string, data: Uint8ClampedArray): boolean {
  const history = historyFor(id);
  const next = history.redo.pop();
  if (!next) return false;
  history.undo.push(new Uint8ClampedArray(data));
  data.set(next);
  return true;
}

/** Drop the stacks of every layer not in `liveIds`. */
export function prunePixelHistories(liveIds: Iterable<string>): void {
  const live = new Set(liveIds);
  for (const id of Array.from(histories.keys())) {
    if (!live.has(id)) histories.delete(id);
  }
}
