// safeHref is the rule for every link a member writes, and its header said a
// smoke test held it to that. No test called it. Each case below is also put
// through the URL parser a browser uses, so a kept link is shown to land
// where the rule says it does, not only to match a string.

import { describe, expect, it } from "vitest";
import { opensHere, safeHref } from "./markdown";

const PAGE = "https://patternflow.work/community/p/abc";
const SITE = new URL(PAGE).origin;

describe("safeHref", () => {
  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["a capital scheme", "JavaScript:alert(1)"],
    ["a tab inside the scheme", "java\tscript:alert(1)"],
    ["a NUL inside the scheme", "java\u0000script:alert(1)"],
    ["a leading space", " javascript:alert(1)"],
    ["data:", "data:text/html,<b>hi</b>"],
    ["vbscript:", "vbscript:msgbox(1)"],
    ["file:", "file:///etc/passwd"],
    ["mailto:", "mailto:ada@example.com"],
    ["a protocol-relative link", "//evil.example"],
    ["a tab between the slashes", "/\t/evil.example"],
    ["slash backslash", "/\\evil.example"],
    ["two backslashes", "\\\\evil.example"],
    ["backslash slash", "\\/evil.example"],
    ["nothing", ""],
  ])("refuses %s", (_, raw) => {
    expect(safeHref(raw)).toBeNull();
  });

  it.each([
    "https://patternflow.work/community",
    "HTTP://example.com/x",
    "/community/d/abc",
    "#user-content-fn-1",
    "?sort=new",
    "example.com/x",
    "notes/a:b",
  ])("keeps %j, and the browser takes it to http(s)", (raw) => {
    expect(safeHref(raw)).toBe(raw);
    const landed = new URL(raw, PAGE);
    expect(["http:", "https:"]).toContain(landed.protocol);
    // No scheme of its own means it stays on the page's site.
    if (!/^https?:/i.test(raw)) expect(landed.origin).toBe(SITE);
  });

  it("refuses what is not a string", () => {
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(null)).toBeNull();
  });

  // Why the three backslash cases are refused: a browser reads each of them
  // as //evil.example, which is another site on the page's scheme.
  it.each(["/\\evil.example", "\\\\evil.example", "\\/evil.example"])(
    "%j is another site to a browser",
    (raw) => {
      expect(new URL(raw, PAGE).href).toBe("https://evil.example/");
    },
  );
});

describe("opensHere", () => {
  it.each(["#user-content-fn-1", "/community/d/abc", "?sort=new"])(
    "keeps %j in this tab",
    (href) => {
      expect(opensHere(href)).toBe(true);
    },
  );

  it.each([
    "https://example.com/",
    "https://patternflow.work/community",
    // A browser puts this on the page's own site, but whoever wrote it meant
    // the site of that name.
    "example.com/x",
    "//evil.example",
    "/\\evil.example",
  ])("opens %j in a new tab", (href) => {
    expect(opensHere(href)).toBe(false);
  });
});
