// The atlas remembers its reading language in localStorage and reads it while
// rendering. With site data blocked that read throws a SecurityError, and it
// used to take the whole map down with it.

import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENTRIES } from "@/lib/atlas/data";
import AtlasClient, { type AtlasPinData } from "./AtlasClient";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Both boot a sandbox iframe per pattern; these tests only need the map.
vi.mock("./PatternCanvas", () => ({ default: () => null }));
vi.mock("./SandboxPreview", () => ({ default: () => null }));

const atlas = (pins: AtlasPinData[] = []) => <AtlasClient pins={pins} />;

const tide: AtlasPinData = {
  patternId: "p-tide",
  x: 40,
  y: 60,
  entryId: null,
  kind: "pin",
  title: "Slow tide",
  code: "function draw() {}",
  username: "maker",
  displayUsername: null,
};

describe("atlas by keyboard", () => {
  it("reaches a pin tile with Tab and opens it with Enter", () => {
    render(atlas([tide]));
    const tile = screen.getByRole("button", { name: "Slow tide" });
    expect(tile.tabIndex).toBe(0);
    expect(fireEvent.keyDown(tile, { key: "Enter" })).toBe(false);
    expect(screen.getByRole("heading", { name: "Slow tide" })).toBeTruthy();
  });

  it("opens a point with Space and keeps the page where it was", () => {
    render(atlas());
    const entry = ENTRIES[0];
    const point = screen.getAllByRole("button", { name: entry.nmEn })[0];
    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.keyDown(point, { key: " " })).toBe(false);
    expect(screen.getByRole("heading", { name: entry.nmEn })).toBeTruthy();
  });
});

// An archive since 26 October 2026. Until then an author's own view of the
// map had "Add my pattern", a made-from select, demote and promote buttons and
// "Remove from the map", and Edit layout let them drag their pin to a new
// spot. Each of those wrote to a route that now refuses.
describe("the atlas is an archive", () => {
  const linked: AtlasPinData = { ...tide, entryId: ENTRIES[0].id };

  beforeEach(() => {
    // jsdom lays nothing out and has neither of these. With the identity as
    // the map's screen matrix, a client point is a viewBox point.
    Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
      configurable: true,
      value: () => ({ inverse: () => ({}) }),
    });
    vi.stubGlobal(
      "DOMPoint",
      class {
        x: number;
        y: number;
        constructor(x = 0, y = 0) {
          this.x = x;
          this.y = y;
        }
        matrixTransform() {
          return { x: this.x, y: this.y };
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says so at the top, in both languages", () => {
    render(atlas());
    expect(screen.getByText(/^Archived in October 2026\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "한국어" }));
    expect(screen.getByText(/^2026년 10월에 보관한 지도\./)).toBeTruthy();
    // The language is the module's for the rest of this file.
    fireEvent.click(screen.getByRole("button", { name: "English" }));
  });

  it("opens a pin with nothing on it that writes", () => {
    render(atlas([linked]));
    expect(screen.queryByRole("button", { name: "Add my pattern" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Slow tide" }));
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByRole("heading", { name: "Slow tide" })).toBeTruthy();
    expect(within(panel).queryByRole("combobox")).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Remove from the map" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "File as research (hide the tile)" })).toBeNull();

    // The prompt it was made from is a way to that point, for everyone.
    fireEvent.click(within(panel).getByRole("button", { name: ENTRIES[0].nmEn }));
    expect(within(panel).getByRole("heading", { name: ENTRIES[0].nmEn })).toBeTruthy();
  });

  it("leaves a pin where it is when Edit layout is on, and sends nothing", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(atlas([tide]));
    fireEvent.click(screen.getByRole("button", { name: "Slow tide" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit layout" }));

    const map = screen.getByLabelText("A map of pattern space");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Slow tide" }));
    // viewBox (500, 320) is the middle of the plot: data (50, 50).
    fireEvent.pointerMove(map, { clientX: 500, clientY: 320 });
    fireEvent.pointerUp(map);

    expect(screen.getByText("x 40 · y 60")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});

// A screen reader announced these as "slider" and nothing more.
describe("atlas fields say what they are", () => {
  it("names each knob slider after the knob", () => {
    render(atlas([tide, { ...tide, patternId: "p-folds", title: "Folds", code: "// @knobs Folds=3..12, -, Zoom=2..17\nfunction draw() {}" }]));
    fireEvent.click(screen.getByRole("button", { name: "Slow tide" }));
    expect(screen.getAllByRole("slider").map((s) => s.getAttribute("aria-label"))).toEqual([
      "Knob 1",
      "Knob 2",
      "Knob 3",
      "Knob 4",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Folds" }));
    expect(screen.getByRole("slider", { name: "Folds" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Zoom" })).toBeTruthy();
  });
});

describe("atlas reading language", () => {
  it("opens in the language this browser chose last time", () => {
    localStorage.setItem("pf-atlas-lang", "ko");
    const { unmount } = render(atlas());
    // The toggle names the language it switches to.
    expect(screen.getByRole("button", { name: "English" })).toBeTruthy();
    unmount();
    localStorage.clear();
  });

  // Last on purpose: the choice storage refused stays in the module for the
  // rest of the visit, which here is the rest of this file.
  it("opens with site data blocked, and the toggle still works for the visit", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    render(atlas());
    fireEvent.click(screen.getByRole("button", { name: "한국어" }));
    expect(screen.getByRole("button", { name: "English" })).toBeTruthy();
  });
});
