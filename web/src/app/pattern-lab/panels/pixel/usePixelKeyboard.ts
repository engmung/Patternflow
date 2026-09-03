// ── Keyboard, scoped to the viewport ─────────────────────────────────────────
// Undo/redo, the floating cut's Enter / Esc / arrows, single-key tool
// switches, and [ ] for the brush. Inputs in the toolbar keep their keys.

import { TOOLS, type Tool } from "./tools";
import type { PixelSelection } from "./usePixelSelection";

export function usePixelKeyboard({
  undo,
  redo,
  selection,
  switchTool,
  setSize,
}: {
  undo: () => void;
  redo: () => void;
  selection: PixelSelection;
  switchTool: (tool: Tool) => void;
  setSize: (update: (current: number) => number) => void;
}) {
  const { floating, selection: box, commitFloating, cancelFloating, nudgeFloating } = selection;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (event.key === "Enter" && floating) {
      event.preventDefault();
      commitFloating();
      return;
    }
    if (event.key === "Escape" && (floating || box)) {
      event.preventDefault();
      cancelFloating();
      return;
    }
    if (event.key.startsWith("Arrow") && floating) {
      event.preventDefault();
      const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      nudgeFloating(dx, dy);
      return;
    }
    const toolFor = TOOLS.find((entry) => entry.key === event.key.toLowerCase());
    if (toolFor && !event.ctrlKey && !event.metaKey && !event.altKey) {
      switchTool(toolFor.id);
      return;
    }
    if (event.key === "[") setSize((current) => Math.max(1, current - 1));
    if (event.key === "]") setSize((current) => Math.min(8, current + 1));
  };

  return onKeyDown;
}
