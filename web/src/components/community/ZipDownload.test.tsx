// The zip surfaces as a visitor meets them: the pattern-mode Send modal must
// work with no session and no build queue, and a deck's skipped slots must be
// named on the page rather than silently missing from the file.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SendModuleModal from "./SendModuleModal";
import { ZipInstallNote, ZipProgress } from "./ZipDownload";

// The code mode's imports; pattern mode must never reach either.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: {
    useSession: () => {
      throw new Error("pattern mode asked for a session");
    },
  },
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ state: "ready", slug: "wave", bytes: 6144 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.setItem("pf-device-host", "192.168.0.44");
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("zip surfaces", () => {
  it("pattern mode checks the zip status on open and hands the board the zip address", async () => {
    render(<SendModuleModal patternTitle="Wave" patternId="p123" onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Wave is ready/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/community/patterns/p123/zip?status=1");
    // Never the signed-in build endpoint.
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/builds"))).toBe(false);

    const send = screen.getByText("Send over Wi-Fi").closest("a");
    const href = send?.getAttribute("href") ?? "";
    expect(href.startsWith("http://192.168.0.44/patterns?src=")).toBe(true);
    const src = decodeURIComponent(href.split("?src=")[1]);
    // Absolute, and its path ends in /zip so the board's page polls a 202 itself.
    expect(src).toBe(`${window.location.origin}/api/community/patterns/p123/zip`);

    expect(screen.getByText("Install from a file")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "http://192.168.0.44/patterns" })).toBeInTheDocument();
  });

  it("pattern mode disables sending a header that cannot compile", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ state: "error", error: "error: 'sinf' was not declared" }), {
          status: 200,
        }),
      ),
    );
    render(<SendModuleModal patternTitle="Wave" patternId="p123" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/does not compile/)).toBeInTheDocument());
    expect(screen.getByText(/'sinf' was not declared/)).toBeInTheDocument();
    const send = screen.getByText("Send over Wi-Fi").closest("a");
    expect(send?.getAttribute("href")).toBeNull();
    expect(send?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Download .zip" })).toBeDisabled();
  });

  it("pattern mode holds Send over Wi-Fi until the module exists", async () => {
    // A v3.2–3.3 console reads a still-compiling answer as "no files" and
    // gives up, so the board is only handed the address once it is a file.
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ state: "building" }), { status: 200 })),
    );
    render(<SendModuleModal patternTitle="Wave" patternId="p123" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Preparing the module/)).toBeInTheDocument());
    const send = screen.getByText("Send over Wi-Fi").closest("a");
    expect(send?.getAttribute("href")).toBeNull();
    expect(send?.getAttribute("aria-disabled")).toBe("true");
  });

  it("does not describe a pack that never finished", () => {
    // The deadline ran out on a "building" answer: its count is of a pack
    // that does not exist, and must not sit under the failure.
    render(
      <ZipProgress
        kind="deck"
        phase="error"
        status={{
          state: "building",
          total: 10,
          included: 3,
          skipped: [{ position: 4, title: "Tide", reason: "compile-error" }],
        }}
        error="This is taking unusually long to compile. Try again in a moment."
        detail={null}
      />,
    );
    expect(screen.getByText(/taking unusually long/)).toBeInTheDocument();
    expect(screen.queryByText(/of 10 patterns included/)).toBeNull();
    expect(screen.queryByText(/Slot 5/)).toBeNull();
  });

  it("names every skipped deck slot once the answer is in", () => {
    render(
      <ZipProgress
        kind="deck"
        phase="ready"
        status={{
          state: "ready",
          total: 4,
          included: 2,
          skipped: [
            { position: 1, title: "Tide", reason: "compile-error" },
            { position: 3, title: "Tide", reason: "duplicate-name" },
          ],
        }}
        error={null}
        detail={null}
      />,
    );
    expect(screen.getByText("2 of 4 patterns included.")).toBeInTheDocument();
    expect(screen.getByText(/Slot 2 · Tide — its header does not compile/)).toBeInTheDocument();
    expect(screen.getByText(/Slot 4 · Tide — same module name/)).toBeInTheDocument();
  });

  it("renders nothing while idle", () => {
    const { container } = render(
      <ZipProgress kind="deck" phase="idle" status={null} error={null} detail={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("tells a deck's file apart from a single pattern's", () => {
    const { rerender } = render(<ZipInstallNote kind="deck" />);
    expect(screen.getByText(/its patterns go first/)).toBeInTheDocument();
    rerender(<ZipInstallNote kind="pattern" />);
    expect(screen.getByText(/leaves the board's order as it is/)).toBeInTheDocument();
  });
});
