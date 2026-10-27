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
