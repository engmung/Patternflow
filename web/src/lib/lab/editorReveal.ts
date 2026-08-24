// ── Editor reveal bus ────────────────────────────────────────────────────────
// Selecting a pixel layer while the Code tab is fronted used to leave you
// staring at "use the Pixel panel" — the layer click changed the store, but
// nothing touched the dock. This tiny bus carries that one gesture: panels
// announce "the user wants to edit a <kind> layer now", and the dock shell
// (which owns the dockview api) fronts the matching editor tab.
//
// Deliberately NOT store state: deriving it from activeLayerId would front
// tabs on every programmatic selection (gallery loads, imports, deletes), and
// re-clicking the already-active layer — the exact "let me in" gesture — would
// change nothing and emit nothing.

export type EditorKind = "code" | "pixel";

export type EditorRevealRequest = {
  kind: EditorKind;
  /** Creating a layer may reopen a closed editor panel; selecting never does. */
  open: boolean;
};

type Listener = (request: EditorRevealRequest) => void;

const listeners = new Set<Listener>();

export function onEditorReveal(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function revealEditor(kind: EditorKind, options?: { open?: boolean }): void {
  const request: EditorRevealRequest = { kind, open: options?.open ?? false };
  for (const listener of listeners) listener(request);
}
