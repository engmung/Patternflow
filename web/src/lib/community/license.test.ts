// Every way a community pattern leaves the site carries the licence header:
// the stored source people copy out of the page, the .js download and the .h
// download. Its title, author and "Based on" lines are written from the rows,
// and rows stored before cleanTitle refused line breaks can still hold one.
// A title "Tide\n<code>" used to close the `// Title:` comment, and the code
// after it ran in the pattern and, through the fork's `// Based on:` line, in
// every fork of it.

import { describe, expect, it } from "vitest";
import { buildSharedHeaderFile, licenseBySpdx } from "@/lib/pattern/share";
import { licensedJsText } from "./download";
import { buildStoredPatternCode, lineageFrom } from "./license";

const BREAKS = [
  ["a line feed", "\n"],
  ["a carriage return", "\r"],
  ["CR LF", "\r\n"],
  ["a line separator", "\u2028"],
  ["a paragraph separator", "\u2029"],
];
const CODE = "function draw(ctx) {\n  ctx.fillRect(0, 0, 1, 1);\n}";

/** The licence block, from its opening rule to its closing one. */
function header(file: string): string[] {
  const lines = file.split(/\r\n|[\n\r\u2028\u2029]/);
  const start = lines.indexOf("// ===== Patternflow pattern =====");
  const end = lines.findIndex((line, index) => index > start && /^\/\/ =+$/.test(line));
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return lines.slice(start, end + 1);
}

/** Runs a file's top level and returns what it wrote to `ran`. */
function run(file: string): string[] {
  const ran: string[] = [];
  new Function("ran", file)(ran);
  return ran;
}

describe.each(BREAKS)("%s in a stored row", (_, lineBreak) => {
  const title = `Tide${lineBreak}ran.push("title");`;
  const parent = lineageFrom({
    id: "p-ada",
    title: `Swell${lineBreak}ran.push("parent");`,
    username: "ada",
    displayUsername: `ada${lineBreak}ran.push("author");`,
  });

  it("stays inside the stored source's comments, original and fork", () => {
    const original = buildStoredPatternCode(CODE, {
      title,
      license: "CC-BY-SA-4.0",
      handle: "ada",
      date: "2026-10-26T09:00:00.000Z",
    });
    expect(header(original)).toHaveLength(6);
    expect(header(original).every((line) => line.startsWith("//"))).toBe(true);
    expect(run(original)).toEqual([]);

    const fork = buildStoredPatternCode(original, {
      title: "Tide again",
      license: "CC-BY-SA-4.0",
      handle: "eve",
      date: "2026-10-26T10:00:00.000Z",
      basedOn: parent,
    });
    expect(header(fork)).toHaveLength(7);
    expect(header(fork).every((line) => line.startsWith("//"))).toBe(true);
    expect(run(fork)).toEqual([]);
  });

  it("stays inside the .js download's comments", () => {
    const file = licensedJsText(
      {
        title,
        license: "CC-BY-SA-4.0",
        createdAt: "2026-10-26T09:00:00.000Z",
        username: "eve",
        displayUsername: `eve${lineBreak}ran.push("author");`,
        basedOn: parent,
      },
      CODE,
    );
    expect(header(file)).toHaveLength(7);
    expect(header(file).every((line) => line.startsWith("//"))).toBe(true);
    expect(run(file)).toEqual([]);
  });

  it("stays inside the .h download's comments", () => {
    const file = buildSharedHeaderFile("#pragma once\n\nnamespace tide {}", {
      title,
      author: "@eve",
      license: licenseBySpdx("CC-BY-SA-4.0"),
      date: "2026-10-26",
      source: "community",
      basedOn: parent,
    });
    expect(file.startsWith("#pragma once\n")).toBe(true);
    expect(header(file)).toHaveLength(7);
    expect(header(file).every((line) => line.startsWith("//"))).toBe(true);
  });
});

it("keeps the words of a title it folds onto one line", () => {
  const file = buildStoredPatternCode(CODE, {
    title: "Tide\nPool",
    license: "CC-BY-SA-4.0",
    handle: "ada",
    date: "2026-10-26T09:00:00.000Z",
  });
  expect(header(file)[1]).toBe("// Title:    Tide Pool");
});
