// Fields that had no name for a screen reader: the device address under a
// finished build, in the deck panel and in the Send window, and the report's
// detail box, which only had its placeholder sentence to go on. The pack
// card's address field was already "Device address"; these follow it.
//
// The address had a name and still no <label> on three of its four surfaces,
// so a click on "Device address:" sent focus to the page. Those three styled
// it inline, each its own way, and the Send window's had no border at all.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASICS_PACK } from "@/lib/pattern/packs";
import DeckPanel from "./DeckPanel";
import ReportModal from "./ReportModal";
import SendModuleModal from "./SendModuleModal";
import ShippedPackCard from "./ShippedPackCard";
import { ZipInstallNote } from "./ZipDownload";

const SESSION = { user: { id: "u1", name: "Tester" } };

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: { useSession: () => ({ data: SESSION, isPending: false }) },
}));
vi.mock("@/lib/posthogEvents", () => ({ captureEvent: vi.fn() }));
// The card's strip runs preset code; the field is all this file reads.
vi.mock("./PatternCanvas", () => ({ default: () => null }));

const DONE = {
  id: "b1",
  status: "done",
  queuePosition: null,
  elapsedMs: 500,
  bytes: 6144,
  error: null,
  namespaces: ["wave"],
  modulesUrl: "/api/community/builds/b1/modules.zip",
};

function answer(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  vi.stubEnv("NEXT_PUBLIC_BUILD_ENABLED", "1");
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) =>
      init?.method === "POST" ? answer({ id: "b1" }, 202) : answer(DONE),
    ),
  );
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

/** The board's address, once it is drawn the one way: in the <label> that
 *  holds its sentence, sized by the stylesheet rather than inline. */
function addressField(name: "Device address" | "Board address") {
  const field = screen.getByRole("textbox", { name });
  const label = field.closest("label");
  expect(label, `${name} is not in a <label>`).not.toBeNull();
  expect(label!.control).toBe(field);
  expect(label!.textContent).toMatch(new RegExp(`^${name}:`));
  expect(field).toHaveClass("zipHostField");
  expect(field).not.toHaveAttribute("style");
  return field;
}

describe("community fields say what they are", () => {
  it("names the device address under a deck build", async () => {
    window.localStorage.setItem(
      "pf-deck",
      JSON.stringify([{ patternId: "p1", title: "Wave", code: "// wave" }]),
    );
    render(<DeckPanel />);
    await wait(0);
    fireEvent.click(screen.getByTitle(/^Your deck \(1\//));
    fireEvent.click(screen.getByRole("button", { name: "Build 1 module" }));
    await wait(1000);

    expect(addressField("Device address")).toHaveValue("patternflow.local");
  });

  it("names the device address in the Send window", async () => {
    render(<SendModuleModal patternTitle="Wave" code="// wave" onClose={() => {}} />);
    await wait(1000);

    expect(screen.getByText(/Wave built/)).toBeInTheDocument();
    expect(addressField("Device address")).toHaveValue("patternflow.local");
  });

  it("names the device address on the Basics card", () => {
    render(<ShippedPackCard pack={BASICS_PACK} />);
    expect(addressField("Device address")).toHaveValue("patternflow.local");
  });

  it("names the board address in the zip note", () => {
    render(<ZipInstallNote kind="deck" />);
    expect(addressField("Board address")).toHaveValue("patternflow.local");
  });

  it("names the report's detail box and keeps its hint", () => {
    render(
      <ReportModal targetType="pattern" targetId="p1" targetLabel="Wave" onClose={() => {}} />,
    );
    const detail = screen.getByRole("textbox", { name: "Details" });
    expect(detail).toHaveAttribute(
      "placeholder",
      "Anything that helps us look at the right thing (optional)",
    );
  });
});
