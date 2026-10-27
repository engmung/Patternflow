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
