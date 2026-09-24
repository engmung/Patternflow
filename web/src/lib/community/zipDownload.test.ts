// useZipDownload — the "poll status, then navigate once" logic both the deck
// page and the pattern page lean on. The routes themselves are covered by the
// server smokes; this is the client half: that a 202 turns into polling, that
// the file is fetched by exactly one navigation, that a double click is one
// chain, and that every state which will never become a file says why.

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { includedSummary, useZipDownload, zipStatusUrl, type ZipStatus } from "./zipDownload";

const ZIP = "/api/community/decks/abc/zip";

function answer(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Let pending promises settle, then move the clock one poll forward. */
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("zip download helper", () => {
  it("builds the status address with the right separator", () => {
    expect(zipStatusUrl(ZIP)).toBe(`${ZIP}?status=1`);
    expect(zipStatusUrl(`${ZIP}?x=1`)).toBe(`${ZIP}?x=1&status=1`);
  });

  it("polls a building pack and navigates exactly once when it is ready", async () => {
    fetchMock
      .mockImplementationOnce(() => answer({ state: "building", total: 3, included: 0, skipped: [] }))
      .mockImplementationOnce(() => answer({ state: "building", total: 3, included: 0, skipped: [] }))
      .mockImplementationOnce(() =>
        answer({
          state: "ready",
          total: 3,
          included: 2,
          skipped: [{ position: 1, title: "Gone", reason: "missing" }],
        }),
      );
    const navigate = vi.fn();
    const { result } = renderHook(() => useZipDownload(ZIP, "deck", navigate));

    let done: Promise<boolean> | undefined;
    act(() => {
      done = result.current.download();
    });
    await tick();
    expect(result.current.phase).toBe("building");
    await tick(2000);
    expect(navigate).not.toHaveBeenCalled();
    await tick(2000);
    await expect(done).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Only ever the status form — the file itself is the navigation's job.
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe(`${ZIP}?status=1`);
      expect((call[1] as RequestInit).credentials).toBe("omit");
    }
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(ZIP);
    expect(result.current.phase).toBe("ready");
    expect(includedSummary(result.current.status)).toBe("2 of 3 patterns included.");
  });

  it("treats a second press while polling as the same download", async () => {
    fetchMock.mockImplementation(() => answer({ state: "building" }));
    const navigate = vi.fn();
    const { result } = renderHook(() => useZipDownload(ZIP, "deck", navigate));
    let second: Promise<boolean> | undefined;
    act(() => {
      void result.current.download();
      second = result.current.download();
    });
    await expect(second).resolves.toBe(false);
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("check() warms and reports without navigating", async () => {
    fetchMock.mockImplementation(() => answer({ state: "ready", slug: "wave", bytes: 6144 }));
    const navigate = vi.fn();
    const { result } = renderHook(() => useZipDownload(ZIP, "pattern", navigate));
    await act(async () => {
      await result.current.check();
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.status?.bytes).toBe(6144);
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each<[ZipStatus, "pattern" | "deck", RegExp, string | null]>([
    [{ state: "no-header" }, "pattern", /no firmware header/, null],
    [{ state: "empty", total: 2, included: 0 }, "deck", /Nothing in this deck/, null],
    [
      { state: "error", error: "undefined reference to `sinf'" },
      "pattern",
      /does not compile/,
      "undefined reference to `sinf'",
    ],
  ])("settles %j as an error instead of polling forever", async (status, kind, message, detail) => {
    fetchMock.mockImplementation(() => answer(status));
    const navigate = vi.fn();
    const { result } = renderHook(() => useZipDownload(ZIP, kind, navigate));
    await act(async () => {
      await result.current.download();
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.error).toMatch(message);
    expect(result.current.detail).toBe(detail);
    expect(navigate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the route's own words for a refused request", async () => {
    fetchMock.mockImplementation(() => answer({ error: "Deck not found." }, 404));
    const { result } = renderHook(() => useZipDownload(ZIP, "deck", vi.fn()));
    await act(async () => {
      await result.current.download();
    });
    expect(result.current.error).toBe("Deck not found.");
  });

  it("rides out a few dropped polls, then gives up", async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.reject(new TypeError("offline")))
      .mockImplementationOnce(() => answer({ state: "ready" }));
    const navigate = vi.fn();
    const { result } = renderHook(() => useZipDownload(ZIP, "deck", navigate));
    act(() => {
      void result.current.download();
    });
    await tick();
    await tick(2000);
    expect(navigate).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    const second = renderHook(() => useZipDownload(ZIP, "deck", vi.fn()));
    act(() => {
      void second.result.current.download();
    });
    for (let i = 0; i < 5; i++) await tick(2000);
    expect(second.result.current.phase).toBe("error");
    expect(second.result.current.error).toMatch(/Network error/);
  });

  it("stops polling when the component goes away", async () => {
    fetchMock.mockImplementation(() => answer({ state: "building" }));
    const navigate = vi.fn();
    const { result, unmount } = renderHook(() => useZipDownload(ZIP, "deck", navigate));
    act(() => {
      void result.current.download();
    });
    await tick();
    unmount();
    const calls = fetchMock.mock.calls.length;
    await tick(10_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
