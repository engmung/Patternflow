// The links PostBody draws around a comment. The URL rule itself is
// lib/community/markdown.test.ts.
//
// Until 26 October every link opened a new tab, so a footnote opened the
// whole page again to show one line of it. And footnote ids come from the
// footnote's label: two comments on one page that both wrote [^1] both had
// id="user-content-fn-1" and id="footnote-label", and the second comment's
// footnote link landed on the first comment's note.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PostBody from "./PostBody";

const PAGE = "https://patternflow.work/community/p/abc";
const FOOTNOTE = "Measured at 5 V.[^1]\n\n[^1]: With the 3 A bank.";

const link = (root: HTMLElement, name: string) => {
  const found = [...root.querySelectorAll("a")].find((a) => a.textContent === name);
  if (!found) throw new Error(`no link "${name}" in ${root.innerHTML}`);
  return found;
};

/** The element a same-page link jumps to, looked up the way the browser does. */
const landing = (a: HTMLAnchorElement) =>
  document.getElementById(decodeURIComponent(a.getAttribute("href")!.slice(1)));

describe("PostBody links", () => {
  it("opens a link off the site in a new tab", () => {
    const { container } = render(<PostBody text="[datasheet](https://example.com/hub75.pdf)" />);
    const a = link(container, "datasheet");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer nofollow");
  });

  it("keeps a link to another page of the site in this tab", () => {
    const { container } = render(<PostBody text="Same as [my deck](/community/d/abc)." />);
    const a = link(container, "my deck");
    expect(a.getAttribute("href")).toBe("/community/d/abc");
    expect(a.hasAttribute("target")).toBe(false);
  });

  it("keeps a footnote in this tab and lands on the note and back", () => {
    const { container } = render(<PostBody text={FOOTNOTE} />);
    const ref = link(container, "1");
    expect(ref.hasAttribute("target")).toBe(false);
    expect(landing(ref)?.textContent).toContain("With the 3 A bank.");

    const back = link(container, "↩");
    expect(back.hasAttribute("target")).toBe(false);
    expect(back.getAttribute("aria-label")).toBe("Back to reference 1");
    expect(landing(back)).toBe(ref);
  });

  it("gives two comments with the same footnote their own ids", () => {
    const { container } = render(
      <>
        <PostBody text={FOOTNOTE} />
        <PostBody text={"Mine too.[^1]\n\n[^1]: A 2 A bank browns out."} />
      </>,
    );
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    // Each comment's footnote link lands inside that comment, and the
    // reference is described by that comment's own "Footnotes" heading.
    for (const body of container.querySelectorAll(":scope > div")) {
      const ref = link(body as HTMLElement, "1");
      expect(body.contains(landing(ref))).toBe(true);
      const label = document.getElementById(ref.getAttribute("aria-describedby")!);
      expect(label?.textContent).toBe("Footnotes");
      expect(body.contains(label)).toBe(true);
    }
  });

  // micromark writes a backslash in a link as %5C before safeHref sees it, so
  // these never reached the rule. markdown.test.ts holds the rule to them
  // anyway, in case that ever changes.
  it.each(["[x](/\\evil.example)", "[x](\\\\evil.example)", "[x](\\/evil.example)"])(
    "puts %j on this site",
    (text) => {
      const { container } = render(<PostBody text={text} />);
      const href = container.querySelector("a")!.getAttribute("href")!;
      expect(new URL(href, PAGE).origin).toBe(new URL(PAGE).origin);
    },
  );

  it("writes a javascript: link as plain text", () => {
    const { container } = render(<PostBody text="[click](javascript:alert(1))" />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("click");
  });
});
