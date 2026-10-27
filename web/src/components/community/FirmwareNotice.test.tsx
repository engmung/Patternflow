// The server drew no firmware notice, because only the browser knew whether
// it had been dismissed. For everyone who had not, the banner came in at
// hydration and pushed the page down, 119px on a phone (CLS 0.141 at 390px,
// 26 October). A dismissal now goes into a cookie as well, and the community
// layout reads it, so the banner is in the server's HTML when it will stay.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommunityLayout from "@/app/community/layout";
import { FIRMWARE_NOTICE_COOKIE as KEY, FIRMWARE_NOTICE_VERSION as LATEST } from "@/lib/community/firmwareNotice";
import FirmwareNotice from "./FirmwareNotice";

const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3100" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
}));
vi.mock("@/lib/community/server/db", () => ({
  communityEnabled: () => true,
  communityHomeUrl: () => "http://localhost:3100",
}));
vi.mock("@/lib/community/server/auth", () => ({
  getAuth: () => ({ api: { getSession: async () => null } }),
}));
vi.mock("@/lib/community/server/admin", () => ({ isAdminSession: () => false }));
vi.mock("@/lib/community/server/queries", () => ({
  countOpenReports: async () => 0,
  countUnreadNotifications: async () => 0,
}));
// The rest of the header has tests of its own.
vi.mock("@/components/community/AuthStatus", () => ({ default: () => null }));
vi.mock("@/components/community/CommunityNav", () => ({ default: () => null }));
vi.mock("@/components/community/DeckDock", () => ({ default: () => null }));
vi.mock("@/components/community/DeckPanel", () => ({ default: () => null }));
vi.mock("@/components/community/MobileTabBar", () => ({ default: () => null }));

const BANNER = "Pick an edition";

async function serverHtml(): Promise<string> {
  return renderToString(await CommunityLayout({ children: <p>wall</p> }));
}

beforeEach(() => {
  // The cookie is scoped to /community, so document.cookie only shows it on
  // a community page.
  window.history.replaceState(null, "", "/community/patterns");
});

afterEach(() => {
  jar.clear();
  document.cookie = `${KEY}=; Path=/community; Max-Age=0`;
  window.localStorage.clear();
});

describe("the community layout's HTML", () => {
  it("has the notice when there is no cookie", async () => {
    const html = await serverHtml();
    expect(html).toContain(BANNER);
    expect(html).toContain("wall");
  });

  it("leaves it out when the cookie dismisses this release", async () => {
    jar.set(KEY, LATEST);
    expect(await serverHtml()).not.toContain(BANNER);
  });

  it("has it again for a cookie an earlier release left", async () => {
    jar.set(KEY, "v3.10.4");
    expect(await serverHtml()).toContain(BANNER);
  });
});

describe("dismissing", () => {
  it("writes the cookie the layout reads, and localStorage", () => {
    render(<FirmwareNotice serverDismissed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss until the next release" }));

    expect(screen.queryByText(BANNER)).toBeNull();
    expect(document.cookie.split("; ")).toContain(`${KEY}=${LATEST}`);
    expect(window.localStorage.getItem(KEY)).toBe(LATEST);
  });

  it("from before the cookie still counts, and the cookie is written for next time", async () => {
    // Dismissed in localStorage alone: the server drew the banner, and
    // hydration takes it away.
    window.localStorage.setItem(KEY, LATEST);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<FirmwareNotice serverDismissed={false} />);
    document.body.appendChild(container);
    expect(container.textContent).toContain(BANNER);

    await act(async () => {
      render(<FirmwareNotice serverDismissed={false} />, { container, hydrate: true });
    });

    expect(container.textContent).not.toContain(BANNER);
    expect(document.cookie.split("; ")).toContain(`${KEY}=${LATEST}`);
  });
});
