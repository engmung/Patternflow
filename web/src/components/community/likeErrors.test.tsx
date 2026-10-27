// A like the server turned down came undone with nothing on the page. Asked
// to slow down (429, "Too many likes — slow down a moment."), the pattern
// page's button lit and went back to LIK 00 inside 150 ms, and the wall card's
// heart only dropped aria-pressed. Both now roll back and say why: the route's
// own words when it sent some, the status when a proxy page answered instead.

import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LikeButton from "./LikeButton";
import PatternCard, { type PatternCardItem } from "./PatternCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "u1", username: "ada" } }, isPending: false }),
  },
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; children: ReactNode }) => {
    delete (rest as { prefetch?: boolean }).prefetch;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));
// The card's still and its live preview both run pattern code in an iframe.
// Neither is what these tests look at, so the still never arrives.
vi.mock("@/lib/community/thumbs", () => ({ renderPatternThumb: () => new Promise(() => {}) }));
vi.mock("./SandboxPreview", () => ({ default: () => null }));

const SLOW_DOWN = "Too many likes — slow down a moment.";
const NGINX_502 =
  "<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>";

const ITEM: PatternCardItem = {
  id: "p1",
  title: "Tide",
  code: "",
  parentId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  username: "dora",
  displayUsername: "dora",
  likeCount: 3,
  forkCount: 0,
  hasCpp: false,
  visibility: "public",
  deckCount: 0,
  viewerLiked: false,
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const press = () => fireEvent.click(screen.getByRole("button", { name: "Like this pattern" }));

describe("the pattern page's like button", () => {
  const show = () => render(<LikeButton patternId="p1" initialCount={0} initialLiked={false} />);

  it("rolls back and shows the server's words on a 429", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: SLOW_DOWN }, { status: 429 }));
    show();
    press();
    expect((await screen.findByRole("alert")).textContent).toBe(SLOW_DOWN);
    const button = screen.getByRole("button", { name: "Like this pattern" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.textContent).toBe("LIK00");
  });

  it("names the status when a proxy page answers", async () => {
    fetchMock.mockResolvedValue(
      new Response(NGINX_502, { status: 502, headers: { "Content-Type": "text/html" } }),
    );
    show();
    press();
    expect((await screen.findByRole("alert")).textContent).toBe("Like not saved (HTTP 502).");
  });

  it("says Network error when nothing answered", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    show();
    press();
    expect((await screen.findByRole("alert")).textContent).toBe("Network error.");
  });

  it("clears the note when the next press goes through", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ error: SLOW_DOWN }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ liked: true, count: 1 }));
    show();
    press();
    await screen.findByRole("alert");
    press();
    const button = await screen.findByRole("button", { name: "Unlike this pattern" });
    expect(button.textContent).toBe("LIK01");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the wall card's heart", () => {
  const show = () => render(<PatternCard item={ITEM} interactive={false} />);

  it("rolls back and shows the server's words on a 429", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: SLOW_DOWN }, { status: 429 }));
    show();
    press();
    expect((await screen.findByRole("alert")).textContent).toBe(SLOW_DOWN);
    expect(
      screen.getByRole("button", { name: "Like this pattern" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByTitle("3 likes").textContent).toBe("LIK 03");
  });

  it("names the status when a proxy page answers", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }));
    show();
    press();
    expect((await screen.findByRole("alert")).textContent).toBe("Like not saved (HTTP 502).");
  });

  it("says Network error when nothing answered", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    show();
    press();
    expect((await screen.findByRole("alert")).textContent).toBe("Network error.");
  });

  it("takes the like without a note when the server agrees", async () => {
    fetchMock.mockResolvedValue(Response.json({ liked: true, count: 4 }));
    show();
    press();
    await screen.findByRole("button", { name: "Unlike this pattern" });
    expect(screen.getByTitle("4 likes").textContent).toBe("LIK 04");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
