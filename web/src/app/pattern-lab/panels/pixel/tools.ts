// ── The pixel editor's vocabulary ────────────────────────────────────────────
// Tools, the selection rectangle, the lifted ("floating") cut, and the two
// geometry helpers everything else shares. Pure; no React.

export type Tool =
  | "pen"
  | "eraser"
  | "line"
  | "rect"
  | "ellipse"
  | "fill"
  | "picker"
  | "magic"
  | "select";

export const TOOLS: Array<{ id: Tool; label: string; title: string; key: string }> = [
  { id: "pen", label: "Pen", title: "Pencil (B) — right-click erases", key: "b" },
  { id: "eraser", label: "Erase", title: "Eraser (E)", key: "e" },
  { id: "line", label: "Line", title: "Line (L)", key: "l" },
  { id: "rect", label: "Rect", title: "Rectangle (R)", key: "r" },
  { id: "ellipse", label: "Ellip", title: "Ellipse (O)", key: "o" },
  { id: "fill", label: "Fill", title: "Flood fill (G)", key: "g" },
  { id: "picker", label: "Pick", title: "Eyedropper (I) — or Alt-click with any tool", key: "i" },
  { id: "magic", label: "Magic", title: "Magic eraser (M) — click a color to cut it out", key: "m" },
  {
    id: "select",
    label: "Sel",
    title:
      "Select (S) — drag a box, then drag inside it to lift & move. +/− scales (nearest), Enter commits, Esc cancels, arrows nudge",
    key: "s",
  },
];

export const isShapeTool = (tool: Tool) => tool === "line" || tool === "rect" || tool === "ellipse";

export type Cell = { x: number; y: number };

export type SelRect = { x0: number; y0: number; x1: number; y1: number };

export type Floating = {
  /** The lifted pixels at their ORIGINAL size — every rescale samples these. */
  source: Uint8ClampedArray;
  w: number;
  h: number;
  x: number;
  y: number;
  scale: number;
};

export function normRect(rect: SelRect) {
  return {
    left: Math.min(rect.x0, rect.x1),
    top: Math.min(rect.y0, rect.y1),
    right: Math.max(rect.x0, rect.x1),
    bottom: Math.max(rect.y0, rect.y1),
  };
}

/** Where a floating cut lands at its current scale. */
export function floatingBounds(f: Floating) {
  const w = Math.max(1, Math.round(f.w * f.scale));
  const h = Math.max(1, Math.round(f.h * f.scale));
  return { x: f.x, y: f.y, w, h };
}

/** In-flight pen / shape stroke. A ref, not state: it changes per pointer event. */
export type Stroke = {
  drawing: boolean;
  erase: boolean;
  start: Cell | null;
  last: Cell | null;
};

export const idleStroke = (): Stroke => ({ drawing: false, erase: false, start: null, last: null });
