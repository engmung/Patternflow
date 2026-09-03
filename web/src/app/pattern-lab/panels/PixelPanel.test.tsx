// The pixel editor's behaviour, pinned before its component was split into
// hooks: every gesture below reads the layer's RGBA buffer in the store — the
// thing the device receives — not what the canvas shows.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PixelPanel from "./PixelPanel";
import { useLabStore } from "@/lib/lab/store";
import type { PixelLayer } from "@/lib/lab/types";

function pixelLayer(): PixelLayer {
  const layer = useLabStore.getState().layers.find((entry) => entry.type === "pixel");
  if (!layer || layer.type !== "pixel") throw new Error("no pixel layer");
  return layer;
}

function rgba(x: number, y: number): [number, number, number, number] {
  const layer = pixelLayer();
  const i = (y * layer.width + x) * 4;
  return [layer.data[i], layer.data[i + 1], layer.data[i + 2], layer.data[i + 3]];
}

function mount() {
  const utils = render(<PixelPanel />);
  const main = screen.getByLabelText(/bitmap$/);
  const overlay = main.nextElementSibling as HTMLCanvasElement;
  const viewport = utils.container.querySelector('[tabindex="0"]') as HTMLDivElement;
  return { ...utils, overlay, viewport };
}

const at = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
  clientX: x,
  clientY: y,
  button: 0,
  buttons: 1,
  pointerId: 1,
  ...extra,
});

const ORANGE: [number, number, number, number] = [255, 77, 0, 255];
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

beforeEach(() => {
  useLabStore.getState().discardProject();
  useLabStore.getState().addPixelLayer();
});

describe("PixelPanel", () => {
  it("offers to add a pixel layer when the active layer is code", () => {
    const state = useLabStore.getState();
    state.selectLayer(state.layers.find((entry) => entry.type === "code")!.id);
    render(<PixelPanel />);
    fireEvent.click(screen.getByText("+ Add pixel layer"));
    expect(useLabStore.getState().layers.filter((entry) => entry.type === "pixel")).toHaveLength(2);
  });

  it("pen: a press paints a dot, a drag paints a line, release commits", () => {
    const { overlay } = mount();
    const before = pixelLayer().rev;
    fireEvent.pointerDown(overlay, at(5, 5));
    expect(rgba(5, 5)).toEqual(ORANGE);
    fireEvent.pointerMove(overlay, at(9, 5));
    expect(rgba(7, 5)).toEqual(ORANGE);
    fireEvent.pointerUp(overlay, at(9, 5));
    expect(pixelLayer().rev).toBe(before + 1);
  });

  it("right-drag erases", () => {
    const { overlay } = mount();
    fireEvent.pointerDown(overlay, at(3, 3));
    fireEvent.pointerUp(overlay, at(3, 3));
    expect(rgba(3, 3)).toEqual(ORANGE);
    fireEvent.pointerDown(overlay, at(3, 3, { button: 2, buttons: 2 }));
    fireEvent.pointerUp(overlay, at(3, 3, { button: 2, buttons: 0 }));
    expect(rgba(3, 3)).toEqual(CLEAR);
  });

  it("undo and redo through the keyboard, and through the buttons", () => {
    const { overlay, viewport } = mount();
    fireEvent.pointerDown(overlay, at(1, 1));
    fireEvent.pointerUp(overlay, at(1, 1));
    expect(rgba(1, 1)).toEqual(ORANGE);
    fireEvent.keyDown(viewport, { key: "z", ctrlKey: true });
    expect(rgba(1, 1)).toEqual(CLEAR);
    fireEvent.keyDown(viewport, { key: "z", ctrlKey: true, shiftKey: true });
    expect(rgba(1, 1)).toEqual(ORANGE);
    fireEvent.click(screen.getByTitle(/^Undo/));
    expect(rgba(1, 1)).toEqual(CLEAR);
    fireEvent.click(screen.getByTitle(/^Redo/));
    expect(rgba(1, 1)).toEqual(ORANGE);
  });

  it("tool keys switch tools: e erases, g fills, b is the pen again", () => {
    const { overlay, viewport } = mount();
    fireEvent.keyDown(viewport, { key: "g" });
    expect(screen.getByText("Fill")).toHaveAttribute("data-active", "true");
    fireEvent.pointerDown(overlay, at(10, 10));
    fireEvent.pointerUp(overlay, at(10, 10));
    expect(rgba(0, 0)).toEqual(ORANGE);
    expect(rgba(127, 63)).toEqual(ORANGE);
    fireEvent.keyDown(viewport, { key: "e" });
    fireEvent.pointerDown(overlay, at(0, 0));
    fireEvent.pointerUp(overlay, at(0, 0));
    expect(rgba(0, 0)).toEqual(CLEAR);
    expect(rgba(1, 0)).toEqual(ORANGE);
    fireEvent.keyDown(viewport, { key: "b" });
    expect(screen.getByText("Pen")).toHaveAttribute("data-active", "true");
  });

  it("[ and ] change the brush size, and a wider pen paints a wider dot", () => {
    const { overlay, viewport } = mount();
    fireEvent.keyDown(viewport, { key: "]" });
    fireEvent.keyDown(viewport, { key: "]" });
    expect(screen.getByLabelText("Brush size")).toHaveValue(3);
    fireEvent.pointerDown(overlay, at(20, 20));
    fireEvent.pointerUp(overlay, at(20, 20));
    expect(rgba(19, 19)).toEqual(ORANGE);
    expect(rgba(21, 21)).toEqual(ORANGE);
    expect(rgba(22, 22)).toEqual(CLEAR);
    fireEvent.keyDown(viewport, { key: "[" });
    expect(screen.getByLabelText("Brush size")).toHaveValue(2);
  });

  it("alt-click picks the colour under the pointer", () => {
    const { overlay } = mount();
    fireEvent.change(screen.getByLabelText("Drawing color"), { target: { value: "#2ec27e" } });
    fireEvent.pointerDown(overlay, at(4, 4));
    fireEvent.pointerUp(overlay, at(4, 4));
    fireEvent.change(screen.getByLabelText("Drawing color"), { target: { value: "#ffffff" } });
    fireEvent.pointerDown(overlay, at(4, 4, { altKey: true }));
    fireEvent.pointerUp(overlay, at(4, 4, { altKey: true }));
    expect(screen.getByLabelText("Drawing color")).toHaveValue("#2ec27e");
  });

  it("shape tools preview until release: a filled rect lands on pointer-up", () => {
    const { overlay, viewport } = mount();
    fireEvent.keyDown(viewport, { key: "r" });
    fireEvent.pointerDown(overlay, at(2, 2));
    fireEvent.pointerMove(overlay, at(5, 4));
    expect(rgba(3, 3)).toEqual(CLEAR);
    fireEvent.pointerUp(overlay, at(5, 4));
    expect(rgba(3, 3)).toEqual(ORANGE);
    expect(rgba(5, 4)).toEqual(ORANGE);
    expect(rgba(6, 4)).toEqual(CLEAR);
  });

  it("select: box, lift, nudge, commit — and escape puts the pixels back", () => {
    const { overlay, viewport } = mount();
    fireEvent.pointerDown(overlay, at(10, 10));
    fireEvent.pointerUp(overlay, at(10, 10));
    fireEvent.keyDown(viewport, { key: "s" });
    // box around the dot
    fireEvent.pointerDown(overlay, at(9, 9));
    fireEvent.pointerMove(overlay, at(11, 11));
    fireEvent.pointerUp(overlay, at(11, 11));
    // press inside the box lifts it
    fireEvent.pointerDown(overlay, at(10, 10));
    fireEvent.pointerUp(overlay, at(10, 10));
    expect(rgba(10, 10)).toEqual(CLEAR);
    expect(screen.getByTitle(/Stamp the selection down/)).toBeTruthy();
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    fireEvent.keyDown(viewport, { key: "Enter" });
    expect(rgba(12, 10)).toEqual(ORANGE);
    expect(rgba(10, 10)).toEqual(CLEAR);

    // lift again, then escape: the cut goes back where it was
    fireEvent.pointerDown(overlay, at(11, 9));
    fireEvent.pointerMove(overlay, at(13, 11));
    fireEvent.pointerUp(overlay, at(13, 11));
    fireEvent.pointerDown(overlay, at(12, 10));
    fireEvent.pointerUp(overlay, at(12, 10));
    expect(rgba(12, 10)).toEqual(CLEAR);
    fireEvent.keyDown(viewport, { key: "Escape" });
    expect(rgba(12, 10)).toEqual(ORANGE);
  });

  it("switching tools with a floating cut stamps it first", () => {
    const { overlay, viewport } = mount();
    fireEvent.pointerDown(overlay, at(30, 30));
    fireEvent.pointerUp(overlay, at(30, 30));
    fireEvent.keyDown(viewport, { key: "s" });
    fireEvent.pointerDown(overlay, at(30, 30));
    fireEvent.pointerMove(overlay, at(30, 30));
    fireEvent.pointerUp(overlay, at(30, 30));
    fireEvent.pointerDown(overlay, at(30, 30));
    fireEvent.pointerUp(overlay, at(30, 30));
    expect(rgba(30, 30)).toEqual(CLEAR);
    fireEvent.keyDown(viewport, { key: "ArrowDown" });
    fireEvent.click(screen.getByText("Pen"));
    expect(rgba(30, 31)).toEqual(ORANGE);
  });

  it("clear empties the layer and undo brings it back", () => {
    const { overlay, viewport } = mount();
    fireEvent.pointerDown(overlay, at(7, 7));
    fireEvent.pointerUp(overlay, at(7, 7));
    fireEvent.click(screen.getByTitle(/Clear the layer/));
    expect(rgba(7, 7)).toEqual(CLEAR);
    fireEvent.keyDown(viewport, { key: "z", ctrlKey: true });
    expect(rgba(7, 7)).toEqual(ORANGE);
  });

  it("copy as code puts a standalone pattern on the clipboard", async () => {
    const { overlay } = mount();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    fireEvent.click(screen.getByTitle(/Copy this drawing/));
    expect(screen.getByText("Layer is empty")).toBeTruthy();
    fireEvent.pointerDown(overlay, at(1, 1));
    fireEvent.pointerUp(overlay, at(1, 1));
    fireEvent.click(screen.getByText("Layer is empty").closest("button")!);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0][0])).toContain("draw(");
  });

  it("opens the image import modal", () => {
    mount();
    fireEvent.click(screen.getByTitle(/Import an image/));
    expect(screen.getByLabelText("Import image")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByLabelText("Import image")).toBeNull();
  });

  it("zoom buttons and the status line agree", () => {
    mount();
    expect(screen.getByText("zoom 6×")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Zoom in"));
    expect(screen.getByText("zoom 7×")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Zoom out"));
    fireEvent.click(screen.getByLabelText("Zoom out"));
    expect(screen.getByText("zoom 5×")).toBeTruthy();
  });

  it("switching layers drops the selection", () => {
    const { overlay, viewport } = mount();
    fireEvent.keyDown(viewport, { key: "s" });
    fireEvent.pointerDown(overlay, at(1, 1));
    fireEvent.pointerMove(overlay, at(4, 4));
    fireEvent.pointerUp(overlay, at(4, 4));
    expect(screen.getByText(/drag inside it to lift/)).toBeTruthy();
    const state = useLabStore.getState();
    state.addPixelLayer();
    // a fresh layer: the select tool is still on, but nothing is selected
    // (the hint reads the same); lifting where the old box was lifts nothing
    fireEvent.pointerDown(overlay, at(2, 2));
    fireEvent.pointerUp(overlay, at(2, 2));
    expect(screen.queryByTitle(/Stamp the selection down/)).toBeNull();
  });
});
