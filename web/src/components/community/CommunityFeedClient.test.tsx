// The wall's search box. What matters is what a person typing into it sees:
// the URL moves once per pause (replaced, never pushed), the box keeps focus
// and every character when the server's answer remounts the list under it,
// and a search the box did not start — the nav's Patterns tab — clears it.

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommunityFeedClient from "./CommunityFeedClient";
import type { PatternCardItem } from "./PatternCard";

const replace = vi.fn();
const push = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
  usePathname: () => "/community/patterns",
  useSearchParams: () => search,
}));

// A plain anchor: the tabs are asserted by their href, not by navigating.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean; children: ReactNode }) => {
    // `scroll` is Link's own prop, not an attribute an anchor takes.
    delete (rest as { scroll?: boolean }).scroll;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

// The card runs pattern code in sandboxes; a title is all these tests read.
vi.mock("./PatternCard", () => ({
  default: ({ item }: { item: PatternCardItem }) => <div data-testid="card">{item.title}</div>,
}));

const card = (id: string, title: string): PatternCardItem => ({
  id,
  title,
  code: "",
  parentId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  username: "someone",
  displayUsername: "someone",
  likeCount: 0,
  forkCount: 0,
  hasCpp: false,
  visibility: "public",
  deckCount: 0,
});

beforeEach(() => {
  // Only the debounce's clock: test/setup.ts pins requestAnimationFrame as a
  // read-only no-op, which a full fake-timer install tries to overwrite.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  search = new URLSearchParams("sort=top&page=3");
  replace.mockReset();
  push.mockReset();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  // A full first batch (total = items) never asks for more, so any fetch is a bug.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("the wall should not fetch here"))),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const box = () => screen.getByRole("searchbox");

describe("wall search", () => {
  it("replaces the URL once per pause, keeping the sort and dropping old pager params", () => {
    render(<CommunityFeedClient items={[card("a", "Aurora")]} total={1} sort="top" />);
    fireEvent.change(box(), { target: { value: "w" } });
    fireEvent.change(box(), { target: { value: "wa" } });
    fireEvent.change(box(), { target: { value: "wave " } });
    act(() => vi.advanceTimersByTime(299));
    expect(replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/community/patterns?sort=top&q=wave", { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it("runs at once on Enter, and not again when the pause runs out", () => {
    render(<CommunityFeedClient items={[card("a", "Aurora")]} total={1} sort="top" />);
    fireEvent.change(box(), { target: { value: "@dora" } });
    fireEvent.submit(box().closest("form")!);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toBe("/community/patterns?sort=top&q=%40dora");
    act(() => vi.advanceTimersByTime(1000));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("keeps focus and later typing when the answer remounts the list", () => {
    const { rerender } = render(
      <CommunityFeedClient items={[card("a", "Aurora"), card("b", "Wave")]} total={2} sort="top" />,
    );
    const input = box();
    input.focus();
    fireEvent.change(input, { target: { value: "wave" } });
    act(() => vi.advanceTimersByTime(300));
    // Typed on while the server was answering "wave".
    fireEvent.change(input, { target: { value: "waves" } });

    rerender(<CommunityFeedClient items={[card("b", "Wave")]} total={1} sort="top" q="wave" />);
    expect(box()).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue("waves");
    expect(screen.getAllByTestId("card").map((node) => node.textContent)).toEqual(["Wave"]);
    expect(screen.getByText("1 match for “wave”")).toBeInTheDocument();
  });

  it("follows a search it did not start", () => {
    const { rerender } = render(
      <CommunityFeedClient items={[card("b", "Wave")]} total={1} sort="top" q="wave" />,
    );
    expect(box()).toHaveValue("wave");
    // The nav's Patterns tab: same wall, no ?q=.
    rerender(<CommunityFeedClient items={[card("a", "Aurora")]} total={1} sort="top" />);
    expect(box()).toHaveValue("");
    expect(screen.getByText("1 pattern")).toBeInTheDocument();
  });

  it("still runs a search on Enter after its address was discarded", () => {
    const props = { items: [card("a", "Aurora")], total: 1, sort: "top" };
    const { rerender } = render(<CommunityFeedClient {...props} />);
    fireEvent.change(box(), { target: { value: "a" } });
    act(() => vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledTimes(1);
    // The nav's Patterns tab was clicked before the server answered: the
    // replace is thrown away and the page renders again with no ?q=.
    rerender(<CommunityFeedClient {...props} />);
    expect(box()).toHaveValue("a");
    fireEvent.submit(box().closest("form")!);
    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace.mock.calls[1][0]).toBe("/community/patterns?sort=top&q=a");
  });

  it("drops a keystroke still waiting when the address moves elsewhere", () => {
    search = new URLSearchParams("sort=top&q=x");
    const { rerender } = render(
      <CommunityFeedClient items={[card("b", "Xylo")]} total={1} sort="top" q="x" />,
    );
    fireEvent.change(box(), { target: { value: "xb" } });
    act(() => vi.advanceTimersByTime(100));
    // The Patterns tab, mid-pause.
    search = new URLSearchParams("sort=top");
    rerender(<CommunityFeedClient items={[card("a", "Aurora")]} total={1} sort="top" />);
    expect(box()).toHaveValue("");
    act(() => vi.advanceTimersByTime(1000));
    expect(replace).not.toHaveBeenCalled();
  });

  it("says when nothing matches, and clears from there", () => {
    search = new URLSearchParams("q=zzz&hw=1");
    render(<CommunityFeedClient items={[]} total={0} hardwareOnly q="zzz" />);
    expect(screen.getByText("Nothing matches “zzz”.")).toBeInTheDocument();
    expect(screen.getByText(/Only flashable patterns were searched/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(box()).toHaveValue("");
    expect(replace).toHaveBeenCalledWith("/community/patterns?hw=1", { scroll: false });
  });

  it("offers Oldest, and every tab keeps the search", () => {
    search = new URLSearchParams("q=wave");
    render(<CommunityFeedClient items={[card("b", "Wave")]} total={1} q="wave" />);
    expect(screen.getByRole("link", { name: "Oldest" })).toHaveAttribute(
      "href",
      "/community/patterns?q=wave&sort=old",
    );
    expect(screen.getByRole("link", { name: "Newest" })).toHaveAttribute(
      "href",
      "/community/patterns?q=wave",
    );
  });
});
