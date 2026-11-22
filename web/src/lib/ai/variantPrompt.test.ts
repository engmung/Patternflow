import { describe, expect, it } from "vitest";
import { buildPrompt, ENTRIES } from "@/lib/atlas/data";
import { buildTechGuide, buildVariantCopyPrompt } from "./variantPrompt";

// Pattern Lab's Copy prompt in its two color modes, and the atlas's copy of
// its tech guide.

const panel = { width: 128, height: 64 };
const lines = (colorMode: "rgb" | "vfield") =>
  buildVariantCopyPrompt("", [0, 0, 0, 0], [[0, 1], [0, 1], [0, 1], [0, 1]], colorMode, panel).split("\n");
const lineAfter = (all: string[], start: string) => all[all.findIndex((line) => line.startsWith(start)) + 1];

describe("buildVariantCopyPrompt", () => {
  // Value-field mode forbids color logic ("No color logic at all"), and until
  // 22 November 2026 the third of its five directions asked for some.
  it("asks value-field mode for a tonal remix where RGB mode gets its palette remix", () => {
    const third = (colorMode: "rgb" | "vfield") => lines(colorMode).filter((line) => line.startsWith("  3. "));
    expect(third("rgb")).toEqual([
      "  3. Palette/material remix: change color logic, brightness rhythm, or foreground/background relationship.",
    ]);
    expect(third("vfield")).toEqual([
      "  3. Tonal remix: change how the values are distributed between 0 and 1 and how hard the contrast between them is. Swapping figure and ground counts.",
    ]);
    // The other four are the same in both.
    const others = (colorMode: "rgb" | "vfield") => lines(colorMode).filter((line) => /^ {2}[1245]\. /.test(line));
    expect(others("vfield")).toEqual(others("rgb"));
    expect(others("rgb")).toHaveLength(4);
  });

  it("gives the wall time beside the buttons, with what a board without a clock gives", () => {
    for (const colorMode of ["rgb", "vfield"] as const) {
      const all = lines(colorMode);
      const time = lineAfter(all, "- Optional: each knob also has a push button.");
      expect(time).toContain("input.timeValid");
      expect(time).toContain("Every other board gives false and 0 in the other three");
      // The four fields are on input alone, and the next line is the one that says draw() gets none.
      expect(lineAfter(all, "- Optional, only for a pattern that is about the time:")).toMatch(/^- IMPORTANT: input is passed ONLY to update/);
    }
  });

  it("keeps RGB mode's brightness line, and closes the color section with the panel in both modes", () => {
    const off = "- An LED that is off is black, and the panel has no backlight";
    expect(lineAfter(lines("rgb"), "- Keep at least some pixels near full LED brightness.")).toContain(off);
    expect(lineAfter(lines("vfield"), "- Knobs must control geometry/motion/structure, never color")).toContain(off);
    for (const colorMode of ["rgb", "vfield"] as const) {
      const all = lines(colorMode);
      expect(lineAfter(all, off)).toMatch(/^- A frame that is near white all over /);
      expect(lineAfter(all, "- A frame that is near white all over ")).toBe("");
    }
  });
});

// lib/atlas/data.ts keeps a copy of the tech guide for its own frame, by hand.
describe("the atlas's generation prompt", () => {
  it("carries the Lab's tech guide for a 64 × 128 value field, word for word", () => {
    expect(buildPrompt(ENTRIES[0])).toContain(`\n\n${buildTechGuide("vfield", { width: 64, height: 128 })}\n\n`);
  });
});
