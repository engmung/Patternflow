// The five community windows that heard no keys: sign-in, report, Edit
// details, Add firmware header and Publish a performance. In Chromium at
// 1440px each stayed open on Esc, and four left the focus on the button
// behind them. Each case opens its window from a real button, so the focus
// has somewhere to come back to.
//
// Share to Community, the window Pattern Lab's Share opens, came after them.
// It closed on a press outside alone, and its title field took the focus
// before anything could note the Share button.
//
// The deck's five windows and Send to my Patternflow came last. In Chromium
// at 390px and 1440px all but Share this deck stayed open on Esc. Edit deck
// details and Share deck took the focus with their title fields. Deck
// performance, the deck panel and Send left it on the button behind them.
// Share this deck closed on Esc but never took the focus.

import { useState, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeckDetailClient, { type DeckView } from "@/app/community/d/[id]/DeckDetailClient";
import { deckAdd } from "@/lib/community/deck";
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

const auth = vi.hoisted(() => ({
  session: { user: { id: "u1", name: "Tester" } } as { user: { id: string; name: string } } | null,
  pending: false,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: { useSession: () => ({ data: auth.session, isPending: auth.pending }) },
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
  auth.session = { user: { id: "u1", name: "Tester" } };
  auth.pending = false;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function Page({
  dialog,
  onClose,
}: {
  dialog: (close: () => void) => ReactNode;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onClose?.();
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && dialog(close)}
    </>
  );
}

function open(opener: HTMLElement = screen.getByText("Open")) {
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

function pressEsc() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

const report = (close: () => void) => (
  <ReportModal targetType="pattern" targetId="p1" targetLabel="Wave" onClose={close} />
);

const editDetails = (close: () => void) => (
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
);

const shareToCommunity = (close: () => void) => (
  <PublishModal
    code="export function draw(display) {}"
    parentId={null}
    parentTitle={null}
    initialTitle="Wave"
    onClose={close}
  />
);

const WAVE = { patternId: "p1", title: "Wave", code: "// wave" };

const shareDeck = (close: () => void) => <ShareDeckModal deck={[WAVE]} onClose={close} />;

// Each mount opens its window and hands back the button it pressed.
const opened = (dialog: (close: () => void) => ReactNode) => () => {
  render(<Page dialog={dialog} />);
  return open();
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
  return open(screen.getByRole("button", { name: button }));
};

const deckChip = () => screen.getByTitle(/^Your deck \(/);

const WINDOWS: [string, () => HTMLElement][] = [
  ["sign-in", opened((close) => <AuthModal onClose={close} />)],
  ["report", opened(report)],
  ["Edit details", opened(editDetails)],
  [
    "Add firmware header",
    opened((close) => <AddHeaderModal patternId="p1" initialCpp={null} onClose={close} />),
  ],
  [
    "Publish a performance",
    opened((close) => <AddPerformanceModal patternId="p1" onClose={close} />),
  ],
  ["Share to Community", opened(shareToCommunity)],
  ["Edit deck details", onDeckPage("Edit details")],
  ["Deck performance", onDeckPage("Attach performance")],
  ["Share deck", opened(shareDeck)],
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
  [
    "Deck",
    () => {
      render(<DeckPanel />);
      return open(deckChip());
    },
  ],
  [
    "Send to my Patternflow",
    opened((close) => <SendModuleModal patternTitle="Wave" code="// wave" onClose={close} />),
  ],
];

describe.each(WINDOWS)("the %s window", (_name, mount) => {
  it("takes the focus when it opens", () => {
    const opener = mount();
    expect(opener).not.toHaveFocus();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("closes on Esc and gives the focus back to the button that opened it", () => {
    const opener = mount();
    pressEsc();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});

describe("community windows", () => {
  it("Edit details still starts on the title field", () => {
    render(<Page dialog={editDetails} />);
    open();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  });

  it("Share to Community still starts on the title field", () => {
    render(<Page dialog={shareToCommunity} />);
    open();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  });

  it("Edit deck details still starts on the title field", () => {
    onDeckPage("Edit details")();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  });

  it("Share deck still starts on the title field", () => {
    render(<Page dialog={shareDeck} />);
    open();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  });

  // Share deck in the panel closes the panel and opens its own window. The
  // focus the panel hands back to the chip is what Share deck returns to.
  it("Share deck opened from the deck panel gives the focus back to the deck chip", () => {
    deckAdd(WAVE);
    render(<DeckPanel />);
    const chip = open(deckChip());
    fireEvent.click(screen.getByRole("button", { name: "Share deck" }));
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();

    pressEsc();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chip).toHaveFocus();
  });

  // The lab's first Share can open before the session is known. The card
  // holds the focus until then, and the title takes it when the form shows.
  it("Share to Community moves to the title field once the session is known", () => {
    auth.pending = true;
    const onClose = vi.fn();
    const { rerender } = render(<Page dialog={shareToCommunity} onClose={onClose} />);
    const opener = open();
    expect(screen.getByText("Checking session…")).toBeTruthy();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);

    auth.pending = false;
    rerender(<Page dialog={shareToCommunity} onClose={onClose} />);
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();

    pressEsc();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(opener).toHaveFocus();
  });

  it("a sign-in form inside Share to Community lets one Esc close it", () => {
    auth.session = null;
    const onClose = vi.fn();
    render(<Page dialog={shareToCommunity} onClose={onClose} />);
    const opener = open();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("Password"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("a sign-in form inside the report window lets one Esc close the report", () => {
    auth.session = null;
    const onClose = vi.fn();
    render(<Page dialog={report} onClose={onClose} />);
    const opener = open();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("Password"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});
