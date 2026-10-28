// jsdom applies no stylesheet, so the journal's rules are read from
// app/globals.css. Above 720px each archive row is a grid, and its date
// column was a fixed 120px. On 27 October, at 1440, 27 of the 37 Korean dates
// ("2026년 9월 29일" is 122px) and 17 of the 37 English ones ("SEPTEMBER 29,
// 2026" is 159px) broke onto a second line, leaving 일 or 2026 alone under it.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import JournalImage from "./JournalImage";

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

  it("keeps both in the shell's gutter on a phone", () => {
    expect(sides(phone, ".journal-article-footer")).toEqual([0, 0]);
    expect(sides(phone, ".journal-index-footer")).toEqual([0, 0]);
  });
});

// Below 721px the shell's 24px gutter and the panel's 24px padding added up.
// On 28 October the text of a post and of the index started 48px from each
// edge of the screen at 360, 390 and 430, which left 264px of a 360px phone
// for 15px text: 17.6 characters a line.

describe("journal text on a phone", () => {
  const phone = mediaBlocks(css, "(max-width: 720px)").flatMap(rules);
  /** The last left value the phone rules give `selector` for `property` ("padding" or "margin"), in px. */
  const left = (selector: string, property: string) => {
    let value: string | undefined;
    for (const r of phone.filter((r) => r.selectors.includes(selector))) {
      const all = declaration(r.body, property)?.split(/\s+/);
      if (all) value = all[3] ?? all[1] ?? all[0];
      value = declaration(r.body, `${property}-left`) ?? value;
    }
    return parseFloat(value ?? "0");
  };
  const width = (selector: string) =>
    phone
      .filter((r) => r.selectors.includes(selector))
      .map((r) => declaration(r.body, "width"))
      .filter(Boolean)
      .at(-1);
  const gutter = left(".journal-shell", "padding");

  it.each([".journal-panel", ".journal-article"])("starts the text in %s 16 to 24px from the edge", (panel) => {
    const at = gutter + left(panel, "margin") + left(panel, "padding");
    expect(at).toBeGreaterThanOrEqual(16);
    expect(at).toBeLessThanOrEqual(24);
  });

  it.each([".journal-panel", ".journal-article"])("keeps %s on the screen", (panel) => {
    const margin = left(panel, "margin");
    expect(gutter + margin).toBeGreaterThanOrEqual(0);
    if (margin < 0) expect(width(panel), "a 100% width pushed past the right edge").toBe("auto");
  });

  it("starts both footers where the text does", () => {
    const text = gutter + left(".journal-article", "margin") + left(".journal-article", "padding");
    expect(gutter + left(".journal-article-footer", "padding")).toBe(text);
    expect(gutter + left(".journal-index-footer", "padding")).toBe(text);
  });
});

// Rules that matched nothing on a journal page. No component and none of the
// 74 posts wrote .journal-list-number, .journal-figure, -wide or -full (the
// posts' figures are journal-md-figure and journal-figure-row). The two cover
// slots hold a JournalImage, and the span rules inside them waited for a span
// it never draws. The cover slot's ::before was switched off twice, and no
// rule ever switched it on. On 27 October that was 61 lines of globals.css.

/** Every .ts and .tsx under src/ that is not a test, and every post. */
function written() {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (/\.(tsx?|mdx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(readFileSync(at, "utf8"));
    }
  };
  walk(path.resolve(__dirname, "../.."));
  walk(path.resolve(__dirname, "../../../content/journal"));
  return out.join("\n");
}

describe("journal rules", () => {
  const all = rules(css);
  const selectors = all.flatMap((r) => r.selectors);

  it("name only classes a journal component or post writes", () => {
    const source = written();
    const named = new Set(selectors.flatMap((s) => [...s.matchAll(/\.(journal-[\w-]+)/g)].map((m) => m[1])));
    const unwritten = [...named].filter((c) => !new RegExp(`(^|[^\\w-])${c}(?![\\w-])`).test(source));
    expect(named.size).toBeGreaterThan(30);
    expect(unwritten).toEqual([]);
  });

  it("style nothing in a cover slot but what JournalImage draws", () => {
    const { container } = render(createElement(JournalImage, { src: "/journal/good-but/funding-success.png" }));
    const drawn = new Set([...container.querySelectorAll("*")].map((el) => el.tagName.toLowerCase()));
    const inSlot = selectors
      .map((s) => s.match(/\.journal-(?:index-thumb|cover-slot) ([a-z]+)$/)?.[1])
      .filter((tag): tag is string => Boolean(tag));
    expect(inSlot.length).toBeGreaterThan(0);
    for (const tag of inSlot) expect(drawn, `.journal-… ${tag}`).toContain(tag);
  });

  it("switch off no ::before that no rule switches on", () => {
    const last = (selector: string) => selector.split(" ").at(-1);
    const content = (body: string) => declaration(body, "content");
    for (const rule of all) {
      for (const selector of rule.selectors) {
        if (!selector.startsWith(".journal-") || !selector.endsWith("::before") || content(rule.body) !== "none") continue;
        const on = all.some(
          (other) =>
            other.selectors.some((s) => last(s) === last(selector)) &&
            content(other.body) !== undefined &&
            content(other.body) !== "none",
        );
        expect(on, selector).toBe(true);
      }
    }
  });
});

// Below 721px the archive's dates and reading times were 10.5px, under the
// 13px every other date, label and caption in the journal keeps. On 28
// October that was all 74 of them on /journal and /journal/en at 360, 390 and
// 430.

describe("journal dates on a phone", () => {
  const all = rules(css);
  const desktop = rules(withoutMedia(css));
  const phone = mediaBlocks(css, "(max-width: 720px)").flatMap(rules);
  const root = all.find((r) => r.selectors.includes(":root") && declaration(r.body, "--pf-fs-mono"));
  /** "13px" or "var(--pf-fs-mono)" → 13. */
  const px = (value: string) => {
    const token = value.match(/^var\((--[\w-]+)\)$/)?.[1];
    return parseFloat(token ? (declaration(root?.body ?? "", token) ?? "") : value);
  };
  /** The font-size the last rule for `selector` gives it on a phone, the phone's own rules first. */
  const size = (selector: string) => {
    const last = (list: ReturnType<typeof rules>) =>
      list
        .filter((r) => r.selectors.includes(selector))
        .map((r) => declaration(r.body, "font-size"))
        .filter((v): v is string => Boolean(v))
        .at(-1);
    return last(phone) ?? last(desktop);
  };

  it.each([
    ".journal-list-meta",
    ".journal-context-list .journal-list-meta",
    ".journal-featured-meta",
    ".journal-dateline",
    ".journal-md-figure figcaption",
    ".journal-hero-cover figcaption",
  ])("sets %s at 13px or more", (selector) => {
    const value = size(selector);
    expect(value, `no font-size for ${selector}`).toBeDefined();
    expect(px(value!)).toBeGreaterThanOrEqual(13);
  });
});

// Below 721px a post's text broke Korean words wherever a line ran out: on 28
// October, 2,640 of the 4,458 line breaks in the 37 Korean posts at 390 (59%)
// fell between two Hangul syllables of one word, and 59 to 60% at 360 and 430.
// Breaking only at spaces leaves a long English word or address to
// overflow-wrap.

describe("journal words on a phone", () => {
  const phone = mediaBlocks(css, "(max-width: 720px)").flatMap(rules);
  const last = (selector: string, property: string) =>
    phone
      .filter((r) => r.selectors.includes(selector))
      .map((r) => declaration(r.body, property))
      .filter(Boolean)
      .at(-1);

  it("breaks a post's Korean only between words", () => {
    expect(last(".journal-reading", "word-break")).toBe("keep-all");
  });

  it("still breaks a word too long for the line", () => {
    expect(last(".journal-reading", "overflow-wrap")).toMatch(/^(break-word|anywhere)$/);
  });
});

// Below 721px a post's 42px title broke Korean wherever its line ran out, and
// its lines stood 1.02 apart. On 28 October, at 390, three of the four Korean
// titles on two lines broke inside a word ("성공과 실 / 패: 다음 단계"), and
// the two lines of those four and of 13 English titles were 0.8px apart.

describe("journal titles on a phone", () => {
  const desktop = rules(withoutMedia(css));
  const phone = mediaBlocks(css, "(max-width: 720px)").flatMap(rules);
  /** The value the last rule for `selector` gives `property` on a phone, the phone's own rules first. */
  const last = (selector: string, property: string) => {
    const from = (list: ReturnType<typeof rules>) =>
      list
        .filter((r) => r.selectors.includes(selector))
        .map((r) => declaration(r.body, property))
        .filter(Boolean)
        .at(-1);
    return from(phone) ?? from(desktop);
  };
  const title = ".journal-article-header h1";

  it("breaks a Korean title only between words", () => {
    expect(last(title, "word-break")).toBe("keep-all");
    expect(last(title, "overflow-wrap")).toMatch(/^(break-word|anywhere)$/);
  });

  it("keeps a title's lines 1.2 to 1.4 apart", () => {
    const value = Number(last(title, "line-height"));
    expect(value).toBeGreaterThanOrEqual(1.2);
    expect(value).toBeLessThanOrEqual(1.4);
  });
});

// Below 721px a post's text was 15px, under the 16 to 18px a phone's body
// text keeps. On 28 October that was every line of the 74 posts at 360, 390
// and 430: 5,725 lines of the 37 Korean posts at 360.

describe("journal text size on a phone", () => {
  const phone = mediaBlocks(css, "(max-width: 720px)").flatMap(rules);
  const last = (selector: string, property: string) =>
    phone
      .filter((r) => r.selectors.includes(selector))
      .map((r) => declaration(r.body, property))
      .filter(Boolean)
      .at(-1);
  /** The phone's left value for `property` on `selector`, in px. */
  const left = (selector: string, property: string) => {
    const all = last(selector, property)?.split(/\s+/);
    return parseFloat(last(selector, `${property}-left`) ?? all?.[3] ?? all?.[1] ?? all?.[0] ?? "0");
  };
  const size = parseFloat(last(".journal-reading", "font-size") ?? "0");
  const side =
    left(".journal-shell", "padding") + left(".journal-article", "margin") + left(".journal-article", "padding");

  it("sets a post's text at 16 to 18px", () => {
    expect(size).toBeGreaterThanOrEqual(16);
    expect(size).toBeLessThanOrEqual(18);
  });

  it.each([360, 430])("keeps 18 to 28 characters a line at %ipx", (screen) => {
    const perLine = (screen - 2 * side) / size;
    expect(perLine).toBeGreaterThanOrEqual(18);
    expect(perLine).toBeLessThanOrEqual(28);
  });
});
