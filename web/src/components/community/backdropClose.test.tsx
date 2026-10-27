// The community windows closed on any click that reached their backdrop. Drag
// across the text in a card and let go outside, and Chromium sends the click
// to the backdrop, the element the press and the release share. Edit details
// closed that way under a half-written description, and opened again empty.
// Pattern Lab's windows have read where the press began since
// useBackdropClose, and these twelve now do too.
//
// Each case opens its window the way its page does, presses in the card's
// first text field (or on the card, where it has none) and lets go on the
// backdrop.

import { useState, type ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeckDetailClient, { type DeckView } from "@/app/community/d/[id]/DeckDetailClient";
import AddHeaderModal from "./AddHeaderModal";
import AddPerformanceModal from "./AddPerformanceModal";
import AuthModal from "./AuthModal";
import DeckPanel from "./DeckPanel";
import EditDetailsModal from "./EditDetailsModal";
import PublishModal from "./PublishModal";
import ReportModal from "./ReportModal";
import SendModuleModal from "./SendModuleModal";
import ShareDeckModal from "./ShareDeckModal";
import ShareDeckPackModal from "./ShareDeckPackModal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "u1", name: "Tester" } }, isPending: false }),
  },
  dummyEmailFor: (name: string) => `${name}@example.invalid`,
}));
vi.mock("@/lib/posthogEvents", () => ({ captureEvent: vi.fn() }));

beforeEach(() => {
  // The deck chip only shows where builds are on, as on the Pi.
  vi.stubEnv("NEXT_PUBLIC_BUILD_ENABLED", "1");
  // Send starts its build as it opens. Nothing here waits for the answer.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function Page({ dialog }: { dialog: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && dialog(() => setOpen(false))}
    </>
  );
}

const opened = (dialog: (close: () => void) => ReactNode) => () => {
  render(<Page dialog={dialog} />);
  fireEvent.click(screen.getByText("Open"));
};

const DECK: DeckView = {
  id: "d1",
  title: "Night set",
  description: null,
  visibility: "public",
  hiddenAt: null,
  performanceJson: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  username: "tester",
  displayUsername: "Tester",
};

const onDeckPage = (button: string) => () => {
  render(<DeckDetailClient deck={DECK} items={[]} isOwner />);
  fireEvent.click(screen.getByRole("button", { name: button }));
};

const WINDOWS: [string, () => void][] = [
  [
    "Share to Community",
    opened((close) => (
      <PublishModal
        code="export function draw(display) {}"
        parentId={null}
        parentTitle={null}
        initialTitle="Wave"
        onClose={close}
      />
    )),
  ],
  [
    "Edit details",
    opened((close) => (
      <EditDetailsModal
        patternId="p1"
        initialTitle="Wave"
        initialDescription={null}
        initialLicense="CC-BY-SA-4.0"
        initialMadeOn={null}
        initialMadeHow={null}
        initialVisibility="public"
        onClose={close}
      />
    )),
  ],
  [
    "report",
    opened((close) => (
      <ReportModal targetType="pattern" targetId="p1" targetLabel="Wave" onClose={close} />
    )),
  ],
  [
    "Add firmware header",
    opened((close) => <AddHeaderModal patternId="p1" initialCpp={null} onClose={close} />),
  ],
  [
    "Publish a performance",
    opened((close) => <AddPerformanceModal patternId="p1" onClose={close} />),
  ],
  [
    "Share deck",
    opened((close) => (
      <ShareDeckModal
        deck={[{ patternId: "p1", title: "Wave", code: "// wave" }]}
        onClose={close}
      />
    )),
  ],
  [
    "Share this deck",
    opened((close) => (
      <ShareDeckPackModal
        packUrl="https://patternflow.work/api/community/decks/d1/zip"
        installUrl={null}
        onCopyLink={async () => true}
        onDownload={() => {}}
        onClose={close}
      />
    )),
  ],
  ["sign-in", opened((close) => <AuthModal onClose={close} />)],
  [
    "Send to my Patternflow",
    opened((close) => <SendModuleModal patternTitle="Wave" code="// wave" onClose={close} />),
  ],
  [
    "Deck",
    () => {
      render(<DeckPanel />);
      fireEvent.click(screen.getByTitle(/^Your deck \(/));
    },
  ],
  ["Edit deck details", onDeckPage("Edit details")],
  ["Deck performance", onDeckPage("Attach performance")],
];

// Where a drag that ends outside begins: the first field, or the card.
function insideCard(backdrop: HTMLElement): Element {
  const field = within(backdrop).queryAllByRole("textbox")[0];
  const card = backdrop.firstElementChild;
  if (!card) throw new Error("the window has no card");
  return field ?? card;
}

describe.each(WINDOWS)("the %s window", (_name, mount) => {
  it("closes on a press that goes down and comes up on the backdrop", () => {
    mount();
    const backdrop = screen.getByRole("dialog");
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays open when a drag from inside the card lets go on the backdrop", () => {
    mount();
    const backdrop = screen.getByRole("dialog");
    fireEvent.pointerDown(insideCard(backdrop));
    fireEvent.click(backdrop);
    expect(screen.getByRole("dialog")).toBe(backdrop);
  });
});

describe("community windows", () => {
  it("Edit details keeps a description that a drag out of it let go outside", () => {
    WINDOWS[1][1]();
    const description = screen.getByRole("textbox", { name: "Description" });
    fireEvent.change(description, { target: { value: "Two waves that cross" } });
    fireEvent.pointerDown(description);
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
      "Two waves that cross",
    );
  });
});
