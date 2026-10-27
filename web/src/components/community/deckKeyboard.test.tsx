// The deck from the keyboard, at desktop width. The dock's slots move under
// a pointer and nothing else: each is a <span> that listens for pointerdown,
// and the dock's own buttons are the bin, Share deck and Send. The panel with
// ↑, ↓ and remove opens from the header chip, which is hidden above 900px.
// So in Chromium at 1440px a deck of three could only be emptied whole from
// the keyboard. In the panel the three rows also read as the same three
// buttons over and over: "↑", "↓" and "remove", with the pattern in a title
// that a button with text in it does not take as its name.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deckItems } from "@/lib/community/deck";
import DeckDock from "./DeckDock";
import DeckPanel from "./DeckPanel";

vi.mock("next/navigation", () => ({
  usePathname: () => "/community/patterns",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));
vi.mock("@/lib/posthogEvents", () => ({ captureEvent: vi.fn() }));
// The slots draw their patterns; the order is all this file reads.
vi.mock("./PatternCanvas", () => ({ default: () => null }));

const DECK = [
  { patternId: "p1", title: "Wave", code: "// wave" },
  { patternId: "p2", title: "Ripple", code: "// ripple" },
  { patternId: "p3", title: "Grid", code: "// grid" },
];

const titles = () => deckItems().map((item) => item.title);

function renderDeck() {
  render(
    <>
      <DeckPanel />
      <DeckDock />
    </>,
  );
}

function openFromDock(): HTMLElement {
  const opener = screen.getByRole("button", { name: "Your deck 3 / 20" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

// The chip, which every other deck test opens the panel with, so the names
// below are read the same way whichever button opened it.
function openFromChip() {
  fireEvent.click(screen.getByTitle(/^Your deck \(/));
}

beforeEach(() => {
  // The dock and the panel only show where builds are on, as on the Pi.
  vi.stubEnv("NEXT_PUBLIC_BUILD_ENABLED", "1");
  window.localStorage.setItem("pf-deck", JSON.stringify(DECK));
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe("the deck from the keyboard", () => {
  it("the dock's count is a button that opens the deck panel", () => {
    renderDeck();
    expect(screen.queryByRole("dialog")).toBeNull();

    openFromDock();
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByRole("link", { name: "Ripple" })).toBeInTheDocument();
    expect(panel).toContainElement(document.activeElement as HTMLElement);
  });

  it("each button in the panel names the pattern it moves or removes", () => {
    renderDeck();
    openFromChip();
    const panel = within(screen.getByRole("dialog"));

    expect(panel.getByRole("button", { name: "Move Wave up" })).toBeDisabled();
    expect(panel.getByRole("button", { name: "Move Grid down" })).toBeDisabled();

    fireEvent.click(panel.getByRole("button", { name: "Move Ripple up" }));
    expect(titles()).toEqual(["Ripple", "Wave", "Grid"]);

    fireEvent.click(panel.getByRole("button", { name: "Move Ripple down" }));
    expect(titles()).toEqual(["Wave", "Ripple", "Grid"]);

    fireEvent.click(panel.getByRole("button", { name: "Remove Grid" }));
    expect(titles()).toEqual(["Wave", "Ripple"]);
  });

  it("no two buttons in the list share a name", () => {
    renderDeck();
    openFromChip();
    const list = within(screen.getByRole("list"));
    expect(list.getAllByRole("button")).toHaveLength(9);
    for (const { title } of DECK) {
      for (const name of [`Move ${title} up`, `Move ${title} down`, `Remove ${title}`]) {
        expect(list.getAllByRole("button", { name })).toHaveLength(1);
      }
    }
  });

  // In Chromium the press on remove left the focus on the body, and Tab went
  // on into the page behind the window.
  it("remove hands the focus to the row that takes its place", () => {
    renderDeck();
    openFromChip();
    const panel = within(screen.getByRole("dialog"));

    fireEvent.click(panel.getByRole("button", { name: "Remove Wave" }));
    expect(panel.getByRole("button", { name: "Remove Ripple" })).toHaveFocus();

    fireEvent.click(panel.getByRole("button", { name: "Remove Grid" }));
    expect(panel.getByRole("button", { name: "Remove Ripple" })).toHaveFocus();

    fireEvent.click(panel.getByRole("button", { name: "Remove Ripple" }));
    expect(titles()).toEqual([]);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("a row that reaches the end hands the focus to its other arrow", () => {
    renderDeck();
    openFromChip();
    const panel = within(screen.getByRole("dialog"));

    fireEvent.click(panel.getByRole("button", { name: "Move Ripple up" }));
    expect(panel.getByRole("button", { name: "Move Ripple down" })).toHaveFocus();

    fireEvent.click(panel.getByRole("button", { name: "Move Ripple down" }));
    expect(titles()).toEqual(["Wave", "Ripple", "Grid"]);
    expect(panel.getByRole("button", { name: "Move Ripple down" })).toHaveFocus();

    fireEvent.click(panel.getByRole("button", { name: "Move Ripple down" }));
    expect(titles()).toEqual(["Wave", "Grid", "Ripple"]);
    expect(panel.getByRole("button", { name: "Move Ripple up" })).toHaveFocus();
  });

  it("Esc gives the focus back to the dock button", () => {
    renderDeck();
    const opener = openFromDock();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("the header chip says it is the deck", () => {
    renderDeck();
    expect(screen.getByRole("button", { name: "Your deck 3/20" })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
  });
});
