// The two windows that used to wait on a build forever: the deck panel (the
// deck's only way in on a phone) and the Send window's code mode (Pattern
// Lab's To hardware). With a server that never finishes, each has to stop
// turning, say the server went quiet, and leave a way to try again.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeckPanel from "./DeckPanel";
import SendModuleModal from "./SendModuleModal";

const SESSION = { user: { id: "u1", name: "Tester" } };

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: { useSession: () => ({ data: SESSION, isPending: false }) },
}));
vi.mock("@/lib/posthogEvents", () => ({ captureEvent: vi.fn() }));

function answer(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const RUNNING = {
  id: "b1",
  status: "running",
  queuePosition: null,
  elapsedMs: 1000,
  bytes: null,
  error: null,
  namespaces: [],
  modulesUrl: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  vi.stubEnv("NEXT_PUBLIC_BUILD_ENABLED", "1");
  fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    init?.method === "POST" ? answer({ id: "b1" }, 202) : answer(RUNNING),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const posts = () => fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "POST");

describe("waiting on a build", () => {
  it("the deck panel stops after 13 seconds for one pattern and goes back to the deck", async () => {
    window.localStorage.setItem(
      "pf-deck",
      JSON.stringify([{ patternId: "p1", title: "Wave", code: "// wave" }]),
    );
    render(<DeckPanel />);
    await wait(0);

    fireEvent.click(screen.getByTitle(/^Your deck \(1\//));
    fireEvent.click(screen.getByRole("button", { name: "Build 1 module" }));
    await wait(0);
    expect(screen.getByText(/Building modules… \(usually under 8 s\)/)).toBeInTheDocument();

    await wait(9000);
    expect(screen.getByText(/Building modules… \(longer than usual\) · 9 s/)).toBeInTheDocument();

    await wait(5000);
    expect(screen.queryByText(/Building modules…/)).not.toBeInTheDocument();
    expect(screen.getByText(/has not answered in 13 seconds/)).toBeInTheDocument();
    // Back on the list, with the button that starts it again.
    expect(screen.getByRole("button", { name: "Build 1 module" })).toBeEnabled();

    const asked = fetchMock.mock.calls.length;
    await wait(30_000);
    expect(fetchMock.mock.calls.length).toBe(asked);
  });

  it("the deck panel promises a deck of three what the deck bar does", async () => {
    window.localStorage.setItem(
      "pf-deck",
      JSON.stringify(
        ["Wave", "Tide", "Drift"].map((title, i) => ({ patternId: `p${i}`, title, code: `// ${title}` })),
      ),
    );
    render(<DeckPanel />);
    await wait(0);

    fireEvent.click(screen.getByTitle(/^Your deck \(3\//));
    fireEvent.click(screen.getByRole("button", { name: "Build 3 modules" }));
    await wait(0);
    expect(screen.getByText(/Building modules… \(usually under 11 s\)/)).toBeInTheDocument();
    await wait(11_000);
    expect(screen.getByText(/Building modules… \(longer than usual\) · 11 s/)).toBeInTheDocument();
  });

  it("the Send window stops after 13 seconds and offers to try again", async () => {
    render(<SendModuleModal patternTitle="Wave" code="// wave" onClose={() => {}} />);
    await wait(0);
    expect(posts()).toHaveLength(1);
    expect(screen.getByText(/Building the module… \(usually under 8 s\)/)).toBeInTheDocument();

    await wait(14_000);
    expect(screen.queryByText(/Building the module…/)).not.toBeInTheDocument();
    expect(screen.getByText(/has not answered in 13 seconds/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await wait(0);
    expect(posts()).toHaveLength(2);
    expect(screen.queryByText(/has not answered/)).not.toBeInTheDocument();
    expect(screen.getByText(/Building the module…/)).toBeInTheDocument();
  });
});
