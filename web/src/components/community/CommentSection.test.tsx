// With the app down, nginx answers a comment with its own 502 page. The thread
// read that page as JSON, the read threw, and the catch said "Network error."
// exactly as it does when the wire is cut. The server had answered, so the
// thread says which status it answered with. A fetch that never reaches
// anything still says "Network error."

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommentSection, { type CommentView } from "./CommentSection";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "u1", username: "ada" } }, isPending: false }),
  },
}));

const NGINX_502 =
  "<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>";

const MINE: CommentView = {
  id: "c1",
  userId: "u1",
  body: "first light",
  createdAt: "2026-10-26T09:00:00.000Z",
  editedAt: null,
  username: "ada",
  displayUsername: "ada",
};

const htmlPage = (status: number) =>
  new Response(NGINX_502, { status, headers: { "Content-Type": "text/html" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

function post(text: string) {
  render(<CommentSection patternId="p1" comments={[MINE]} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));
}

describe("comment errors", () => {
  it("says the status when the server answers a post with an HTML page", async () => {
    fetchMock.mockResolvedValue(htmlPage(502));
    post("hello");
    expect(await screen.findByText("Comment failed (HTTP 502).")).toBeTruthy();
    expect(screen.queryByText("Network error.")).toBeNull();
    // The draft stays for another try.
    expect((screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement).value).toBe(
      "hello",
    );
  });

  it("shows the route's own words when it sent some", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "Too many comments — wait a minute and try again." }, { status: 429 }),
    );
    post("hello");
    expect(await screen.findByText("Too many comments — wait a minute and try again.")).toBeTruthy();
  });

  it("still says Network error when nothing answered", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    post("hello");
    expect(await screen.findByText("Network error.")).toBeTruthy();
  });

  it("posts and clears the field on ok", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }, { status: 201 }));
    post("hello");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement).value).toBe("");
  });

  it("says the status when saving an edit meets an HTML page", async () => {
    fetchMock.mockResolvedValue(htmlPage(502));
    render(<CommentSection patternId="p1" comments={[MINE]} />);
    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Could not save the edit (HTTP 502).")).toBeTruthy();
  });

  it("says the status when a delete meets an empty answer", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 413 }));
    render(<CommentSection patternId="p1" comments={[MINE]} />);
    fireEvent.click(screen.getByRole("button", { name: "delete" }));
    fireEvent.click(screen.getByRole("button", { name: "press again" }));
    expect(await screen.findByText("Could not delete the comment (HTTP 413).")).toBeTruthy();
  });
});
