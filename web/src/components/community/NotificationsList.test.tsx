// The alerts page marks everything read once it is on screen. The header
// badge lives in the community layout, which a move between the pages under
// it does not render again, so "Alerts 1" stayed on this page and on every
// page after it until a reload. The list now asks for a refresh once the
// server has said yes, and keeps the rows it came in with highlighted.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NotificationsList, { type NotificationView } from "./NotificationsList";

// One router for the whole page, as the app router hands out.
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./PatternCanvas", () => ({ default: () => null }));

const alert = (id: string, unread: boolean): NotificationView => ({
  id,
  type: "comment",
  targetType: "pattern",
  targetId: `p-${id}`,
  targetTitle: `Tide ${id}`,
  snippet: null,
  unread,
  createdAt: "2026-10-26T00:00:00.000Z",
  actor: "bea",
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  router.refresh.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
const row = (title: string) => screen.getByText(`“${title}”`, { exact: false }).closest("a");

it("refreshes once the server has marked the alerts read", async () => {
  let answer: (response: Response) => void = () => {};
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
  render(<NotificationsList items={[alert("1", true), alert("2", false)]} />);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toContain("/api/community/notifications/read");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
  // Not before the answer: a refresh then would count the same unread row.
  expect(router.refresh).not.toHaveBeenCalled();

  answer(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
});

it("keeps the badge when the server refuses", async () => {
  fetchMock.mockImplementationOnce(() =>
    Promise.resolve(new Response(JSON.stringify({ error: "Sign in first." }), { status: 401 })),
  );
  render(<NotificationsList items={[alert("1", true)]} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await Promise.resolve();
  expect(router.refresh).not.toHaveBeenCalled();
});

it("keeps the badge when the call never reaches the server", async () => {
  fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
  render(<NotificationsList items={[alert("1", true)]} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await Promise.resolve();
  expect(router.refresh).not.toHaveBeenCalled();
});

it("does not refresh when nothing was unread", async () => {
  fetchMock.mockImplementation(ok);
  render(<NotificationsList items={[alert("1", false)]} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await Promise.resolve();
  expect(router.refresh).not.toHaveBeenCalled();
});

it("keeps the rows that were unread highlighted after the refresh, and marks read once", async () => {
  fetchMock.mockImplementation(ok);
  const { rerender } = render(<NotificationsList items={[alert("1", true), alert("2", false)]} />);
  await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));

  // What the refresh brings back: the same rows, all read now.
  rerender(<NotificationsList items={[alert("1", false), alert("2", false)]} />);

  expect(row("Tide 1")?.getAttribute("data-unread")).toBe("true");
  expect(row("Tide 2")?.getAttribute("data-unread")).toBe("false");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(router.refresh).toHaveBeenCalledTimes(1);
});
