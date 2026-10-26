// The header asks the browser for its session after the page arrives. While
// it waited it drew "Sign in", so a signed-in reader's header opened on two
// lines on a phone and pulled back to one 0.6–0.9 s later, on every page. The
// layout already read the session on the server; the widget draws that user
// until the browser has its own answer.

import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import AuthStatus, { type HeaderUser } from "./AuthStatus";

type SessionUser = HeaderUser & { id: string };

const auth = vi.hoisted(() => ({
  session: null as { user: SessionUser } | null,
  pending: true,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: { useSession: () => ({ data: auth.session, isPending: auth.pending }) },
  dummyEmailFor: (name: string) => `${name}@example.invalid`,
}));

afterEach(() => {
  auth.session = null;
  auth.pending = true;
});

const ADA: HeaderUser = { name: "ada", username: "ada", displayUsername: "Ada" };

it("draws the server's user while the browser is still asking", () => {
  render(<AuthStatus serverUser={ADA} />);
  expect(screen.getByRole("link", { name: "@Ada" }).getAttribute("href")).toBe("/community/u/ada");
  expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
});

it("puts the handle in the server's markup, not Sign in", () => {
  const html = renderToString(<AuthStatus serverUser={ADA} />);
  expect(html).toContain("@<!-- -->Ada");
  expect(html).not.toContain("Sign in");
});

it("offers Sign in while asking when the server saw nobody", () => {
  render(<AuthStatus serverUser={null} />);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
});

it("takes the browser's answer once it has one", () => {
  auth.pending = false;
  auth.session = { user: { id: "u1", name: "ada", username: "ada", displayUsername: "ADA" } };
  render(<AuthStatus serverUser={ADA} />);
  expect(screen.getByRole("link", { name: "@ADA" })).toBeTruthy();
});

it("stays signed out after the answer, through a later refetch", () => {
  // Signed out in another tab: the server's user is stale. Better Auth marks a
  // refetch of a null session pending, and the header must not bring the old
  // handle back for it.
  const view = render(<AuthStatus serverUser={ADA} />);
  auth.pending = false;
  view.rerender(<AuthStatus serverUser={ADA} />);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();

  auth.pending = true;
  view.rerender(<AuthStatus serverUser={ADA} />);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "@Ada" })).toBeNull();
});
