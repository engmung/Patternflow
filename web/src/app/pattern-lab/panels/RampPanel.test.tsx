import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useLabStore } from "@/lib/lab/store";
import { cloneRampState, DEFAULT_RAMP_STATE, type CodeLayer } from "@/lib/lab/types";
import RampPanel from "./RampPanel";

function layer(): CodeLayer {
  const state = useLabStore.getState();
  const current = state.layers.find((entry) => entry.id === state.activeLayerId);
  if (current?.type !== "code") throw new Error("Expected active code layer");
  return current;
}

beforeEach(() => {
  useLabStore.getState().discardProject();
  const current = layer();
  useLabStore.setState((state) => ({
    layers: state.layers.map((entry) => entry.id === current.id
      ? { ...current, ramp: cloneRampState(DEFAULT_RAMP_STATE) }
      : entry),
  }));
});

describe("RampPanel color workflow", () => {
  it("defaults to a new ramp, with colors-only randomization explicitly opt-in", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    render(<RampPanel />);
    expect(screen.getByLabelText("keep stops")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Random ramp" }));
    expect(layer().ramp.stops).toHaveLength(6);
    fireEvent.click(screen.getByLabelText("Undo ramp change"));
    expect(layer().ramp.stops).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("keep stops"));
    fireEvent.click(screen.getByRole("button", { name: "Random colors" }));
    expect(layer().ramp.stops.map((stop) => stop.position)).toEqual([0, 1]);
    expect(layer().ramp.stops[0].color).not.toBe("#000000");
    expect(layer().ramp.stops[1].color).not.toBe("#ffffff");
  });

  it("tries colors, goes back and forward, and keeps source code and knobs unchanged", () => {
    let seed = 123;
    vi.spyOn(Math, "random").mockImplementation(() => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    });
    const before = layer();
    const knobs = [...useLabStore.getState().knobs];
    render(<RampPanel />);
    expect(screen.getByLabelText("Undo ramp change")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Random ramp" }));
    const firstChoice = cloneRampState(layer().ramp);
    fireEvent.click(screen.getByRole("button", { name: "Random ramp" }));
    const random = cloneRampState(layer().ramp);
    expect(random).not.toEqual(firstChoice);
    expect(layer().code).toBe(before.code);
    expect(useLabStore.getState().knobs).toEqual(knobs);
    fireEvent.click(screen.getByLabelText("Undo ramp change"));
    expect(layer().ramp).toEqual(firstChoice);
    fireEvent.click(screen.getByLabelText("Undo ramp change"));
    expect(layer().ramp).toEqual(before.ramp);
    fireEvent.click(screen.getByLabelText("Redo ramp change"));
    expect(layer().ramp).toEqual(firstChoice);
    fireEvent.click(screen.getByLabelText("Redo ramp change"));
    expect(layer().ramp).toEqual(random);
  });

  it("records manual edits after randomization, and a new choice clears redo", () => {
    render(<RampPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Random ramp" }));
    const generated = cloneRampState(layer().ramp);
    fireEvent.change(screen.getByLabelText("Selected stop color"), { target: { value: "#112233" } });
    fireEvent.click(screen.getByLabelText("Undo ramp change"));
    expect(layer().ramp).toEqual(generated);
    fireEvent.click(screen.getByRole("button", { name: "Random ramp" }));
    expect(screen.getByLabelText("Redo ramp change")).toBeDisabled();
  });

  it("undoes mode, wrap, recolor and reset without mixing them up", () => {
    render(<RampPanel />);
    const before = layer();
    fireEvent.change(screen.getByLabelText("Ramp interpolation mode"), { target: { value: "oklab" } });
    fireEvent.click(screen.getByLabelText("wrap"));
    fireEvent.click(screen.getByLabelText("recolor"));
    fireEvent.click(screen.getByRole("button", { name: "Random ramp" }));
    const selected = layer();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByLabelText("Undo ramp change"));
    expect(layer().ramp).toEqual(selected.ramp);
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByLabelText("Undo ramp change"));
    expect(layer().ramp).toEqual(before.ramp);
    expect(layer().recolor).toBe(before.recolor);
  });

  it("groups a slider gesture into one undo", () => {
    render(<RampPanel />);
    const alpha = screen.getByLabelText("Selected stop alpha");
    fireEvent.pointerDown(alpha, { button: 0 });
    fireEvent.change(alpha, { target: { value: "0.8" } });
    fireEvent.change(alpha, { target: { value: "0.3" } });
    fireEvent.pointerUp(window);
    expect(layer().ramp.stops[0].alpha).toBe(0.3);
    fireEvent.click(screen.getByLabelText("Undo ramp change"));
    expect(layer().ramp.stops[0].alpha).toBe(1);
    expect(screen.getByLabelText("Undo ramp change")).toBeDisabled();
  });

  it("groups dragging a stop, including its creation, into one undo", () => {
    render(<RampPanel />);
    const before = cloneRampState(layer().ramp);
    const track = screen.getByLabelText("Ramp gradient preview").parentElement!;
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
    fireEvent.pointerDown(track, { clientX: 40, button: 0 });
    fireEvent.pointerMove(window, { clientX: 60 });
    fireEvent.pointerMove(window, { clientX: 70 });
    fireEvent.pointerUp(window);
    expect(layer().ramp.stops.at(-1)?.position).toBe(0.7);
    fireEvent.click(screen.getByLabelText("Undo ramp change"));
    expect(layer().ramp).toEqual(before);
    expect(screen.getByLabelText("Undo ramp change")).toBeDisabled();
  });

  it("does not carry history or a drag to another focused layer", () => {
    render(<RampPanel />);
    const firstId = layer().id;
    fireEvent.click(screen.getByRole("button", { name: "Random ramp" }));
    const firstRamp = cloneRampState(layer().ramp);
    const stop = screen.getAllByRole("button", { name: /^Ramp stop/ })[0];
    fireEvent.pointerDown(stop, { button: 0 });
    act(() => useLabStore.getState().addCodeLayer());
    const second = layer();
    fireEvent.pointerMove(window, { clientX: 70 });
    fireEvent.pointerUp(window);
    expect(layer().ramp).toEqual(second.ramp);
    expect(screen.getByLabelText("Undo ramp change")).toBeDisabled();
    act(() => useLabStore.getState().selectLayer(firstId));
    expect(layer().ramp).toEqual(firstRamp);
    expect(screen.getByLabelText("Undo ramp change")).toBeDisabled();
  });

  it("invalidates history after an external ramp replacement", () => {
    render(<RampPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Random ramp" }));
    act(() => useLabStore.getState().setLayerRampStops(layer().id, [{ position: 0.5, color: "#abcdef", alpha: 0.3 }]));
    expect(screen.getByLabelText("Undo ramp change")).toBeDisabled();
    expect(screen.getByLabelText("Redo ramp change")).toBeDisabled();
  });
});
