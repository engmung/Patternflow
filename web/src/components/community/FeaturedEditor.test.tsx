// The marquee picker's "Load more". The list pages through the public set by
// offset, and anything published (or liked, under Most liked) between two
// pages shifts every offset by one. The picker drops the repeat that causes —
// and must then keep paging from where the SERVER is, not from how many cards
// survived the de-duplication, or it asks for the same tail forever.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FeaturedEditor from "./FeaturedEditor";
import type { PatternCardItem } from "./PatternCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
// Every card is a live canvas; a title is all these tests read.
vi.mock("./PatternCanvas", () => ({ default: () => null }));

const card = (n: number): PatternCardItem => ({
  id: `p${n}`,
  title: `Pattern ${n}`,
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

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => card(from + i));

let fetchMock: ReturnType<typeof vi.fn>;

function answer(items: PatternCardItem[], total: number) {
  return Promise.resolve(
    new Response(JSON.stringify({ items, total }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const offsetOf = (call: unknown[]) => new URL(String(call[0]), "http://x").searchParams.get("offset");

describe("marquee picker paging", () => {
  it("stops once the server has nothing more, even after dropping a repeat", async () => {
    // 30 patterns, 24 on screen; then one is published, so page two starts
    // with the 24th again.
    fetchMock.mockImplementationOnce(() => answer(range(23, 30), 31));
    render(<FeaturedEditor initial={[]} initialIds={[]} candidates={range(0, 24)} candidatesTotal={30} />);

    fireEvent.click(screen.getByRole("button", { name: "Load more (6 left)" }));
    await waitFor(() => expect(screen.getAllByText(/^Pattern \d+$/)).toHaveLength(30));
    expect(offsetOf(fetchMock.mock.calls[0])).toBe("24");
    // The server's cursor is at 31 of 31: nothing is left to ask for, and a
    // button saying "1 left" would fetch the same last card forever.
    expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  });

  it("asks for the next page where the server left off, not where the list did", async () => {
    fetchMock
      .mockImplementationOnce(() => answer(range(23, 47), 61))
      .mockImplementationOnce(() => answer(range(47, 61), 61));
    render(<FeaturedEditor initial={[]} initialIds={[]} candidates={range(0, 24)} candidatesTotal={60} />);

    fireEvent.click(screen.getByRole("button", { name: "Load more (36 left)" }));
    await waitFor(() => expect(screen.getAllByText(/^Pattern \d+$/)).toHaveLength(47));
    fireEvent.click(screen.getByRole("button", { name: "Load more (13 left)" }));
    await waitFor(() => expect(screen.getAllByText(/^Pattern \d+$/)).toHaveLength(61));
    // 24 + 24 returned = 48, though only 23 of the second page were new.
    expect(offsetOf(fetchMock.mock.calls[1])).toBe("48");
    expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  });
});
