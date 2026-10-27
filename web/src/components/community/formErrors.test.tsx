// The community's save and send windows read every answer as JSON. When the
// proxy answered instead, with its 502 page or a bare 413 for a body over its
// limit, the read threw and the window said "Network error." although the
// server had answered. Each window here meets both and has to name the status.

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AddHeaderModal from "./AddHeaderModal";
import AddPerformanceModal from "./AddPerformanceModal";
import EditDetailsModal from "./EditDetailsModal";
import ReportModal from "./ReportModal";
import ShareDeckModal from "./ShareDeckModal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "u1", username: "ada" } }, isPending: false }),
  },
}));
vi.mock("@/lib/posthogEvents", () => ({ captureEvent: vi.fn() }));

const NGINX_PAGE = (status: number, text: string) =>
  `<html><head><title>${status} ${text}</title></head><body><center><h1>${status} ${text}</h1></center><hr><center>nginx</center></body></html>`;

const ANSWERS = [
  { status: 502, body: NGINX_PAGE(502, "Bad Gateway") },
  { status: 413, body: NGINX_PAGE(413, "Request Entity Too Large") },
];

type Form = {
  name: string;
  element: ReactElement;
  /** Fill what the window needs and press its button. */
  submit: () => void;
  fallback: string;
};

const FORMS: Form[] = [
  {
    name: "Edit details",
    element: (
      <EditDetailsModal
        patternId="p1"
        initialTitle="Tide"
        initialDescription={null}
        initialLicense="CC-BY-4.0"
        initialMadeOn={null}
        initialMadeHow={null}
        initialVisibility="public"
        onClose={() => undefined}
      />
    ),
    submit: () => fireEvent.click(screen.getByRole("button", { name: "Save details" })),
    fallback: "Could not save",
  },
  {
    name: "Report",
    element: (
      <ReportModal targetType="pattern" targetId="p1" targetLabel="Tide" onClose={() => undefined} />
    ),
    submit: () => fireEvent.click(screen.getByRole("button", { name: "Send report" })),
    fallback: "Could not send the report",
  },
  {
    name: "Add firmware header",
    element: (
      <AddHeaderModal patternId="p1" initialCpp="// old" mode="owner" onClose={() => undefined} />
    ),
    submit: () => fireEvent.click(screen.getByRole("button", { name: "Update header" })),
    fallback: "Could not save the header",
  },
  {
    name: "Publish a performance",
    element: <AddPerformanceModal patternId="p1" onClose={() => undefined} />,
    submit: () => {
      fireEvent.change(screen.getByRole("textbox", { name: "Performance JSON" }), {
        target: { value: '{"version":1,"length":30,"timeline":[]}' },
      });
      fireEvent.click(screen.getByRole("button", { name: "Publish performance" }));
    },
    fallback: "Could not save the performance",
  },
  {
    name: "Share deck",
    element: (
      <ShareDeckModal
        deck={[{ patternId: "p1", title: "Tide", code: "// h" }]}
        onClose={() => undefined}
      />
    ),
    submit: () => {
      fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
        target: { value: "Night set" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Publish deck" }));
    },
    fallback: "Sharing failed",
  },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("community windows name the status of an answer that is not JSON", () => {
  for (const form of FORMS) {
    for (const answer of ANSWERS) {
      it(`${form.name} · HTTP ${answer.status}`, async () => {
        fetchMock.mockResolvedValue(
          new Response(answer.body, {
            status: answer.status,
            headers: { "Content-Type": "text/html" },
          }),
        );
        render(form.element);
        form.submit();
        expect(await screen.findByText(`${form.fallback} (HTTP ${answer.status}).`)).toBeTruthy();
        expect(document.body.textContent).not.toMatch(/Network error/);
      });
    }

    it(`${form.name} · keeps the route's own error`, async () => {
      fetchMock.mockResolvedValue(Response.json({ error: "Sign in first." }, { status: 401 }));
      render(form.element);
      form.submit();
      expect(await screen.findByText("Sign in first.")).toBeTruthy();
    });
  }
});
