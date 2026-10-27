import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { JournalPost } from "@/lib/journal";
import ArticleLayout from "./ArticleLayout";

// The index page is one <main>. A post was an <article> and a <footer> side by
// side, with no <main> around either, so a screen reader's jump to the main
// content found nothing. On 27 October axe flagged all 74 posts at 390 and
// 1440 for landmark-one-main, with 900 blocks outside any landmark (region).

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function post(slug: string, title: string, date: string): JournalPost {
  return { slug, title, date, excerpt: `${title} excerpt`, lang: "ko", content: "", readingTime: "3분" };
}

const older = post("older", "Older post", "2026-05-14T01:30:00+09:00");
const current = post("current", "Current post", "2026-06-02T20:00:00+09:00");

function renderPost() {
  return render(
    <ArticleLayout post={current} lang="ko" previous={older} next={null} allPosts={[current, older]}>
      <p>Body text</p>
    </ArticleLayout>,
  );
}

describe("ArticleLayout", () => {
  it("puts the whole post inside one main landmark", () => {
    const { container } = renderPost();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect([...container.children].map((el) => el.tagName)).toEqual(["MAIN"]);
  });

  it("keeps the article and the list of nearby posts in it", () => {
    renderPost();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("article")).toBeTruthy();
    expect(within(main).getByRole("heading", { level: 1, name: "Current post" })).toBeTruthy();
    expect(within(main).getByText("Body text")).toBeTruthy();
    expect(within(main).getByRole("link", { name: /Older post/ }).getAttribute("href")).toBe("/journal/older");
  });
});
