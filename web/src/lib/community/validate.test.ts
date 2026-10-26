// A title goes into the `// Title:` line of the licence header baked into the
// stored source, and on a fork into the `// Based on:` line. JavaScript ends
// a line at \n, \r, U+2028 and U+2029, so on 26 October a title carrying one
// closed the comment and the rest of it ran as code. Pattern and deck titles
// are one line of text; the browser inputs that write them cannot hold a
// line break at all.

import { describe, expect, it } from "vitest";
import { TITLE_MAX, cleanTitle } from "./validate";

describe("cleanTitle", () => {
  it.each([
    ["a line feed", "Tide\nglobalThis.ran = true;"],
    ["a carriage return", "Tide\rPool"],
    ["CR LF", "Tide\r\nPool"],
    ["a line separator", "Tide\u2028Pool"],
    ["a paragraph separator", "Tide\u2029Pool"],
    ["a NUL", "Tide\u0000"],
    ["a tab", "Tide\tPool"],
    ["DEL", "Tide\u007F"],
    ["a C1 next-line", "Tide\u0085Pool"],
    ["a right-to-left override", "\u202Eloop ediT"],
    ["a right-to-left isolate", "Tide \u2067Pool\u2069"],
  ])("refuses a title with %s", (_, raw) => {
    expect(cleanTitle(raw)).toBeNull();
  });

  it.each([
    ["Tide Pool", "Tide Pool"],
    ["  Tide  ", "Tide"],
    ["파도 놀이", "파도 놀이"],
    ["Tide – Pool 🌊", "Tide – Pool 🌊"],
    // An emoji built with a zero-width joiner is one picture, not a trick.
    ["Coder 👩‍💻", "Coder 👩‍💻"],
  ])("keeps %j", (raw, kept) => {
    expect(cleanTitle(raw)).toBe(kept);
  });

  it("still refuses an empty title and one over the limit", () => {
    expect(cleanTitle("   ")).toBeNull();
    expect(cleanTitle("x".repeat(TITLE_MAX + 1))).toBeNull();
    expect(cleanTitle("x".repeat(TITLE_MAX))).toBe("x".repeat(TITLE_MAX));
    expect(cleanTitle(42)).toBeNull();
  });
});
