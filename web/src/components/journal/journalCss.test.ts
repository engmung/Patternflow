// jsdom applies no stylesheet, so the journal's rules are read from
// app/globals.css. Above 720px each archive row is a grid, and its date
// column was a fixed 120px. On 27 October, at 1440, 27 of the 37 Korean dates
// ("2026년 9월 29일" is 122px) and 17 of the 37 English ones ("SEPTEMBER 29,
// 2026" is 159px) broke onto a second line, leaving 일 or 2026 alone under it.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");

/** Every rule with no braces inside it; an @media block's rules come out on their own. */
function rules(source: string) {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(",").map((s) => s.trim().replace(/\s+/g, " ")),
    body: m[2],
  }));
}

function declaration(body: string, property: string) {
  return body.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`))?.[1].trim();
}

/** "minmax(0, 1fr) 120px 80px" → ["minmax(0, 1fr)", "120px", "80px"]. */
function tracks(value: string) {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current) out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}

describe("journal archive dates", () => {
  const all = rules(css);

  it("sizes the date column to its date", () => {
    const row = all.find(
      (r) => r.selectors.includes(".journal-post-list a") && declaration(r.body, "display") === "grid",
    );
    expect(row, "no .journal-post-list a grid rule").toBeDefined();
    const columns = tracks(declaration(row!.body, "grid-template-columns") ?? "");
    expect(columns, "title, date, reading time").toHaveLength(3);
    expect(columns[1], "the date track").toMatch(/max-content/);
  });

  it("keeps a date on one line", () => {
    const own = all.filter((r) => r.selectors.includes(".journal-list-meta"));
    expect(own.some((r) => declaration(r.body, "white-space") === "nowrap")).toBe(true);
  });
});

// The language a page is not in and the index's "Archive" label were
// --ink-faint (#A69F90): 2.29:1 on the cream behind a post's switch and
// 2.63:1 on the index's white panel. axe flagged them on all 76 journal pages.

/** The sRGB contrast ratio WCAG 2 defines, for two "#rrggbb" colours. */
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("journal faint text", () => {
  const all = rules(css);
  const root = all.find((r) => r.selectors.includes(":root") && declaration(r.body, "--cream"));
  const resolve = (value: string | undefined) => {
    const token = value?.match(/^var\((--[\w-]+)\)$/)?.[1];
    const hex = token ? declaration(root?.body ?? "", token) : value;
    expect(hex, `${value} is not a #rrggbb colour`).toMatch(/^#[0-9a-f]{6}$/i);
    return hex!;
  };
  const own = (selector: string, property: string) =>
    all
      .filter((r) => r.selectors.includes(selector))
      .map((r) => declaration(r.body, property))
      .filter(Boolean)
      .at(-1);

  const cream = resolve(own(".journal-shell", "background"));
  const panel = resolve(own(".journal-panel", "background"));

  it("shows the other language at 4.5:1 on the cream and on the panel", () => {
    const other = resolve(own(".journal-lang-switch", "color"));
    expect(contrast(other, cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(other, panel)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the current language 3:1 apart from the other", () => {
    const other = resolve(own(".journal-lang-switch", "color"));
    const current = resolve(own(".journal-lang-switch a.active", "color"));
    expect(contrast(current, other)).toBeGreaterThanOrEqual(3);
  });

  it("shows the Archive label at 4.5:1 on the panel", () => {
    const label = resolve(own(".journal-archive-label", "color"));
    expect(contrast(label, panel)).toBeGreaterThanOrEqual(4.5);
  });
});

// A post's language switch is position: fixed, and below 721px it sits 22px
// from the right edge, inside the column of text. On 27 October, at 390, all
// 74 posts scrolled 8,801 lines of text under it.

/** The inside of each `@media <query> { … }` block. */
function mediaBlocks(source: string, query: string) {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  const head = `@media ${query}`;
  for (let at = bare.indexOf(head); at !== -1; at = bare.indexOf(head, at + 1)) {
    const open = bare.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < bare.length; i++) {
      if (bare[i] === "{") depth++;
      if (bare[i] === "}" && --depth === 0) {
        out.push(bare.slice(open + 1, i));
        break;
      }
    }
  }
  return out;
}

describe("journal language switch on a phone", () => {
  const phone = mediaBlocks(css, "(max-width: 720px)").flatMap(rules);
  const position = (selector: string) =>
    phone
      .filter((r) => r.selectors.includes(selector))
      .map((r) => declaration(r.body, "position"))
      .filter(Boolean)
      .at(-1);

  it("scrolls away with a post instead of staying over its text", () => {
    expect(position(".journal-article .journal-lang-switch")).toBe("absolute");
  });

  it("keeps the index's switch in the panel's flow", () => {
    expect(position(".journal-panel .journal-lang-switch")).toBe("static");
  });
});

// Each row of the list under a post has its post number at the right, 64px
// type, and the row kept 56px clear for it. On 27 October, from 761px up, the
// end of 350 of the 370 dates on the 74 posts ran under the number, by up to
// 18.7px; from 721px, where the number is 52px, 228 of them. The index's rows
// keep 104px clear and none of their text meets the number.

/** The stylesheet with every `@media` block taken out: the rules that hold at any width. */
function withoutMedia(source: string) {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let from = 0;
  for (let at = bare.indexOf("@media", from); at !== -1; at = bare.indexOf("@media", from)) {
    out += bare.slice(from, at);
    let depth = 0;
    let i = bare.indexOf("{", at);
    for (; i < bare.length; i++) {
      if (bare[i] === "{") depth++;
      if (bare[i] === "}" && --depth === 0) break;
    }
    from = i + 1;
  }
  return out + bare.slice(from);
}

describe("journal post numbers", () => {
  const all = rules(withoutMedia(css));
  const paddingRight = (selector: string) =>
    all
      .filter((r) => r.selectors.includes(selector))
      .map((r) => {
        const own = declaration(r.body, "padding-right");
        if (own) return own;
        const sides = declaration(r.body, "padding")?.split(/\s+/);
        return sides && (sides[1] ?? sides[0]);
      })
      .filter(Boolean)
      .at(-1);

  it("keeps the list under a post as clear of the number as the index", () => {
    const index = parseFloat(paddingRight(".journal-post-list a") ?? "");
    const underPost = parseFloat(paddingRight(".journal-context-list .pf-row") ?? "");
    expect(index, "the index row's padding-right").toBeGreaterThan(0);
    expect(underPost).toBeGreaterThanOrEqual(index);
  });
});

// Both journal footers are <footer>s, and the front page's footer rule gave
// them its side padding: 60px from 901px and 0 at 900 and below. On 27
// October the list under each of the 74 posts started 4px left of the post's
// text from 901px and 64px left of it from 721 to 900, and the index's footer
// 60px left of the panel's text from 721 to 900.

describe("journal footers", () => {
  const desktop = rules(withoutMedia(css));
  const phone = mediaBlocks(css, "(max-width: 720px)").flatMap(rules);
  /** The [left, right] padding in px the rules for `selector` leave it with. */
  const sides = (list: ReturnType<typeof rules>, selector: string) => {
    let left: string | undefined;
    let right: string | undefined;
    for (const r of list.filter((r) => r.selectors.includes(selector))) {
      const all = declaration(r.body, "padding")?.split(/\s+/);
      if (all) {
        right = all[1] ?? all[0];
        left = all[3] ?? right;
      }
      left = declaration(r.body, "padding-left") ?? left;
      right = declaration(r.body, "padding-right") ?? right;
    }
    return [parseFloat(left ?? ""), parseFloat(right ?? "")];
  };

  it.each([
    [".journal-article-footer", ".journal-article"],
    [".journal-index-footer", ".journal-panel"],
  ])("starts %s where the text in %s starts, above 720px", (footer, panel) => {
    expect(sides(desktop, panel)[0], `${panel}'s side padding`).toBeGreaterThan(0);
    expect(sides(desktop, footer)).toEqual(sides(desktop, panel));
  });

  it("keeps both at the panel's edge on a phone", () => {
    expect(sides(phone, ".journal-article-footer")).toEqual([0, 0]);
    expect(sides(phone, ".journal-index-footer")).toEqual([0, 0]);
  });
});
