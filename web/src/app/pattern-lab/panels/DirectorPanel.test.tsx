// The Director's behaviour, pinned before its component was split into hooks:
// keyframes come and go through the store's show, and the transport bar
// reflects it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { IDockviewPanelProps } from "dockview-react";
import DirectorPanel from "./DirectorPanel";
import { useLabStore } from "@/lib/lab/store";
import { showTransport } from "@/lib/lab/director/transport";

const props = {} as IDockviewPanelProps;

function mount() {
  const utils = render(<DirectorPanel {...props} />);
  const root = utils.container.firstChild as HTMLDivElement;
  const lanes = Array.from(utils.container.querySelectorAll("svg"));
  return { ...utils, root, lanes };
}

const show = () => useLabStore.getState().director;

/** Double-click the focused lane at `t` seconds, near the top (wire ≈ 1000). */
function addKeyAt(lane: SVGSVGElement, t: number, pps = 28) {
  fireEvent.doubleClick(lane, { clientX: t * pps, clientY: 0 });
}

beforeEach(() => {
  useLabStore.getState().discardProject();
  showTransport.pause();
  showTransport.seek(0);
});

describe("DirectorPanel", () => {
  it("draws four knob lanes, a message row, and a play button that waits for content", () => {
    const { lanes } = mount();
    expect(lanes).toHaveLength(4);
    expect(screen.getByText("Glitch")).toBeTruthy();
    expect(screen.getByText("message")).toBeTruthy();
    expect(screen.getByTitle(/Add keyframes first/)).toBeDisabled();
  });

  it("double-click on the focused lane adds a smooth keyframe and selects it", () => {
    const { lanes } = mount();
    addKeyAt(lanes[0], 1);
    const keys = show().lanes[0];
    expect(keys).toHaveLength(1);
    expect(keys[0].t).toBe(1);
    expect(keys[0].v).toBe(1000);
    expect(keys[0].mode).toBe("curve");
    expect(keys[0].h).toBe("auto");
    const value = screen.getByTitle(/Wire value/).querySelector("input") as HTMLInputElement;
    expect(value).toHaveValue(1000);
    expect(screen.getByTitle(/Play the show/)).not.toBeDisabled();
  });

  it("snap quantises to the chosen grid, and off it lands on the wire grid", () => {
    const { lanes } = mount();
    addKeyAt(lanes[0], 1.34);
    expect(show().lanes[0][0].t).toBe(1);
    fireEvent.change(screen.getByTitle("Snap grid spacing"), { target: { value: "0.5" } });
    addKeyAt(lanes[0], 2.34);
    expect(show().lanes[0].map((k) => k.t)).toEqual([1, 2.5]);
    fireEvent.click(screen.getByTitle(/Snap keyframes/).querySelector("input")!);
    addKeyAt(lanes[0], 3.37);
    expect(show().lanes[0].map((k) => k.t)).toEqual([1, 2.5, 3.4]);
  });

  it("the selection editor edits the key, and Delete removes it", () => {
    const { root, lanes } = mount();
    // only the focused lane takes keyframes; the gutter focuses a compact lane
    fireEvent.click(screen.getAllByTitle("Focus this lane")[0]);
    addKeyAt(lanes[1], 2);
    const value = screen.getByTitle(/Wire value/).querySelector("input") as HTMLInputElement;
    fireEvent.change(value, { target: { value: "250" } });
    expect(show().lanes[1][0].v).toBe(250);
    const time = screen.getByTitle(/Keyframe time/).querySelector("input") as HTMLInputElement;
    fireEvent.change(time, { target: { value: "4.05" } });
    expect(show().lanes[1][0].t).toBeCloseTo(4.1, 5);
    fireEvent.change(screen.getByTitle(/How this keyframe reaches/).querySelector("select")!, {
      target: { value: "hold" },
    });
    expect(show().lanes[1][0].mode).toBe("hold");
    fireEvent.keyDown(root, { key: "Delete" });
    expect(show().lanes[1]).toHaveLength(0);
    expect(screen.queryByTitle(/Wire value/)).toBeNull();
  });

  it("messages: added at the playhead, edited in the bar, deleted with the button", () => {
    mount();
    fireEvent.click(screen.getByTitle(/Add a banner message/));
    expect(show().messages).toHaveLength(1);
    expect(show().messages[0].text).toBe("message");
    const text = screen.getByDisplayValue("message") as HTMLInputElement;
    fireEvent.change(text, { target: { value: "hello wall" } });
    expect(show().messages[0].text).toBe("hello wall");
    fireEvent.click(screen.getByText("Delete"));
    expect(show().messages).toHaveLength(0);
  });

  it("length, loop and title write through to the show", () => {
    mount();
    fireEvent.change(screen.getByTitle(/Show length/).querySelector("input")!, { target: { value: "12" } });
    expect(show().length).toBe(12);
    const loopBefore = show().loop;
    fireEvent.click(screen.getByTitle("Loop the show").querySelector("input")!);
    expect(show().loop).toBe(!loopBefore);
    fireEvent.change(screen.getByTitle(/Name of the show/), { target: { value: "Night" } });
    expect(show().title).toBe("Night");
  });

  it("exports a .pfs and a .mid once there is content", () => {
    const { lanes } = mount();
    expect(screen.getByTitle(/Download this show as a \.pfs/)).toBeDisabled();
    addKeyAt(lanes[0], 0);
    addKeyAt(lanes[0], 2);
    const created = vi.spyOn(URL, "createObjectURL");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByTitle(/Download this show as a \.pfs/));
    fireEvent.click(screen.getByTitle(/Download this show as a MIDI/));
    expect(created).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/\/256 cues/).textContent).not.toMatch(/^0\//);
  });

  it("space toggles the shared transport", () => {
    const { root, lanes } = mount();
    addKeyAt(lanes[0], 0);
    addKeyAt(lanes[0], 3);
    expect(showTransport.get().playing).toBe(false);
    fireEvent.keyDown(root, { key: " " });
    expect(showTransport.get().playing).toBe(true);
    fireEvent.keyDown(root, { key: " " });
    expect(showTransport.get().playing).toBe(false);
  });
});
