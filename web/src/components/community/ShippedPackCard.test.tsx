// The Basics card on /community/decks draws four patterns, and it used to
// import the preset list to find them. That put the source of all 48 presets
// (174,954 bytes, 38,385 gzip) in the decks page's first load on 26 October,
// one chunk /community did not have. The page now looks the four up on the
// server and passes them in.
//
// The walk below follows the card's imports the way the bundler does, so a
// helper that starts importing the presets brings the chunk back and fails
// here, not only an import in the card itself.

import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BASICS_PACK, packPreviews, type PatternPack } from "@/lib/pattern/packs";
import { livePresets } from "@/lib/presets";
import ShippedPackCard from "./ShippedPackCard";

vi.mock("./PatternCanvas", () => ({
  default: ({ title }: { title: string }) => <span data-testid="cell">{title}</span>,
}));

const SRC = path.resolve(__dirname, "../..");

/** The file an import names, or null for a package, a stylesheet or JSON. */
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    const file = base + ext;
    if (/\.tsx?$/.test(file) && fs.existsSync(file)) return file;
  }
  return null;
}

/** Every source file the browser gets with `entry`. Type-only imports are erased, so they are skipped. */
function clientGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, "utf8");
    const statements = source.matchAll(
      /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^;'"]*?\sfrom\s*)?["']([^"']+)["']/g,
    );
    for (const [, typeOnly, spec] of statements) {
      if (typeOnly) continue;
      const next = resolveImport(file, spec);
      if (next) queue.push(next);
    }
    for (const [, spec] of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
      const next = resolveImport(file, spec);
      if (next) queue.push(next);
    }
  }
  return seen;
}

describe("the Basics card", () => {
  it("does not bring the preset list to the browser", () => {
    const graph = [...clientGraph(path.join(__dirname, "ShippedPackCard.tsx"))].map((file) =>
      path.relative(SRC, file),
    );
    // The walk has to reach what the card really draws with, or it proves nothing.
    expect(graph).toContain("lib/pattern/packs.ts");
    expect(graph).toContain("components/community/PatternCanvas.tsx");
    expect(graph.filter((file) => file.startsWith("lib/presets/"))).toEqual([]);
  });

  it("draws the four it is given and counts the rest", () => {
    render(<ShippedPackCard pack={BASICS_PACK} previews={packPreviews(BASICS_PACK, livePresets)} />);
    const cells = screen.getAllByTestId("cell").map((cell) => cell.textContent);
    const names = BASICS_PACK.order
      .slice(0, 4)
      .map((slug) => livePresets.find((p) => p.num === BASICS_PACK.presets[slug])?.name);
    expect(cells).toEqual(names);
    expect(screen.getByText(`+${BASICS_PACK.patterns - 4}`)).toBeInTheDocument();
  });
});

describe("packPreviews", () => {
  const presets = [
    { num: 1, name: "One", code: "// one" },
    { num: 2, name: "Two", code: "// two" },
    { num: 3, name: "Three", code: "// three" },
  ];
  const pack: PatternPack = {
    ...BASICS_PACK,
    patterns: 6,
    order: ["a", "b", "outside", "c", "d", "e"],
    presets: { a: 1, b: 2, outside: undefined, c: 3, d: 99, e: 1 },
  };

  it("takes the first four modules and leaves out the ones with no JS twin", () => {
    expect(packPreviews(pack, presets)).toEqual([
      { slug: "a", code: "// one", title: "One" },
      { slug: "b", code: "// two", title: "Two" },
      { slug: "c", code: "// three", title: "Three" },
    ]);
  });

  it("takes as many as it is asked for", () => {
    expect(packPreviews(pack, presets, 2).map((p) => p.slug)).toEqual(["a", "b"]);
  });

  it("finds a preview for each of the Basics pack's first four", () => {
    expect(packPreviews(BASICS_PACK, livePresets).map((p) => p.slug)).toEqual(
      BASICS_PACK.order.slice(0, 4),
    );
  });
});
