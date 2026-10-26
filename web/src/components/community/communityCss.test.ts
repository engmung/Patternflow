// jsdom applies none of the CSS modules, so the sizes and states below are
// read from the files. In Chromium at 390px the dialog × measured 11×23px
// before these rules and 44×44px after.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, type Rgb } from "../guide/ui/panelTint";

const css = (name: string) => readFileSync(path.resolve(__dirname, name), "utf8");

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(source: string, selector: string): string {
  const at = source.indexOf(`\n${selector} {`);
  expect(at, `${selector} is missing`).toBeGreaterThan(-1);
  return source.slice(source.indexOf("{", at) + 1, source.indexOf("}", at));
}

/** The declarations of `selector` inside the first `@media <query>` block. */
function mediaRule(source: string, query: string, selector: string): string {
  const at = source.indexOf(`\n@media ${query} {`);
  expect(at, `@media ${query} is missing`).toBeGreaterThan(-1);
  const block = source.slice(at, source.indexOf("\n}", at));
  const ruleAt = block.indexOf(`\n  ${selector} {`);
  expect(ruleAt, `${selector} is missing from @media ${query}`).toBeGreaterThan(-1);
  return block.slice(block.indexOf("{", ruleAt) + 1, block.indexOf("}", ruleAt));
}

// The community's text colours, against each ground they are drawn on. On 26
// October the faint ink was #6B6558, 3.18:1 on the well-2 and 3.40:1 on the
// page, and axe found 426 color-contrast failures over eleven community pages,
// every one of them in that colour.
describe("community type on the dark room", () => {
  const globals = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");
  const token = (name: string): Rgb => {
    const hex = globals.match(new RegExp(`--${name}: #([0-9A-Fa-f]{6});`))?.[1];
    expect(hex, `--${name} is missing`).toBeDefined();
    const n = parseInt(hex!, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  const grounds = ["pfc-ground", "pfc-panel", "pfc-well", "pfc-well-2"];

  it.each(["pfc-ink", "pfc-ink-2", "pfc-ink-muted", "pfc-ink-faint", "pfc-led", "pfc-danger"])(
    "reads --%s at 4.5:1 on every ground",
    (ink) => {
      for (const ground of grounds) {
        expect(contrast(token(ink), token(ground)), `--${ink} on --${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("keeps the faint ink below the muted one", () => {
    expect(contrast(token("pfc-ink-faint"), token("pfc-ground"))).toBeLessThan(
      contrast(token("pfc-ink-muted"), token("pfc-ground")),
    );
  });
});

describe("community dialogs", () => {
  it("give the header's close button a 44px box", () => {
    const button = rule(css("Community.module.css"), ".modalHeader button");
    expect(button).toMatch(/min-width: 44px;/);
    expect(button).toMatch(/min-height: 44px;/);
  });
});

describe("atlas", () => {
  const atlas = css("Atlas.module.css");

  it("draws the focus ring on a point only for the keyboard", () => {
    expect(rule(atlas, ".focusRing")).toMatch(/visibility: hidden;/);
    expect(rule(atlas, ".node:focus-visible .focusRing")).toMatch(/visibility: visible;/);
  });

  it("frames a focused pin tile inside the tile", () => {
    expect(rule(atlas, ".pin:focus-visible .pinTile::after")).toMatch(/inset: 0;/);
  });

  it("stops the live ring's pulse under reduced motion", () => {
    const reduced = atlas.split("@media (prefers-reduced-motion: reduce) {").slice(1);
    expect(reduced.some((part) => /^\s*\.pulseRing \{[^}]*animation: none;/.test(part))).toBe(true);
  });

  it("hides the wheel and drag hint on a touch screen", () => {
    expect(mediaRule(atlas, "(hover: none)", ".zoomHint")).toMatch(/display: none;/);
  });

  // In Chromium at 390px, 21 of the map's 83 labels sat under the two rows of
  // chips, and 152px of the 380px map box was blank under the drawing.
  describe("on a phone", () => {
    const phone = (selector: string) => mediaRule(atlas, "(max-width: 900px)", selector);

    it("stands the filter chips above the map", () => {
      expect(phone(".mapTop")).toMatch(/position: static;/);
    });

    it("makes the map box as tall as the drawing", () => {
      expect(phone(".map")).toMatch(/height: auto;/);
      expect(phone(".mapWrap")).not.toMatch(/height:/);
    });
  });
});
