// jsdom applies none of the CSS modules, so the sizes and states below are
// read from the files. In Chromium at 390px the dialog × measured 11×23px
// before these rules and 44×44px after.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MOBILE_FEED_VIEW, SLOT_DEFAULT } from "@/lib/community/feedView";
import { MOBILE_MEDIA_QUERY } from "@/lib/hooks/useMediaQuery";
import { contrast, type Rgb } from "../guide/ui/panelTint";

const css = (name: string) => readFileSync(path.resolve(__dirname, name), "utf8");

/** A rule's declarations, one per entry, without the spacing. */
const declarations = (body: string) =>
  body
    .split(";")
    .map((line) => line.trim())
    .filter(Boolean);

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

/** The declarations of `selector` in whichever `@media <query>` block has it,
 *  as a whole selector list: `.b` does not find the `.a,\n  .b` rule. */
function anyMediaRule(source: string, query: string, selector: string): string {
  for (const part of source.split(`\n@media ${query} {`).slice(1)) {
    const block = part.slice(0, part.indexOf("\n}"));
    for (let at = block.indexOf(`\n  ${selector} {`); at > -1; at = block.indexOf(`\n  ${selector} {`, at + 1)) {
      if (block[at - 1] !== ",") return block.slice(block.indexOf("{", at) + 1, block.indexOf("}", at));
    }
  }
  throw new Error(`${selector} is missing from every @media ${query}`);
}

// On 26 October a phone drew the wall in six 46px columns, the server's
// guess, then three 114px ones once the page had measured itself. At 390px
// that moved every card on screen: CLS 1.19 on /community and 1.49 on
// /community/patterns, where 0.25 is already poor. The columns now come from
// the stylesheet, so the first paint has them.
describe("the wall's grid", () => {
  const community = css("Community.module.css");
  const phone = (selector: string) => anyMediaRule(community, MOBILE_MEDIA_QUERY, selector);

  it("fits as many columns of the card size as the row holds", () => {
    expect(rule(community, ".feedGrid")).toContain(
      `grid-template-columns: repeat(auto-fill, minmax(min(var(--feed-slot, ${SLOT_DEFAULT}px), 100%), 1fr));`,
    );
  });

  it("gives a phone the mobile view's card and gap, by the same query the wall uses", () => {
    const grid = phone(".feedGrid");
    expect(grid).toContain(
      `grid-template-columns: repeat(auto-fill, minmax(${MOBILE_FEED_VIEW.slot}px, 1fr));`,
    );
    expect(grid).toContain(`gap: ${MOBILE_FEED_VIEW.gap}px;`);
  });

  // The knob overlay is left out: a phone's cards are stills and never draw it.
  it("gives a phone the small view's furniture before the wall says small", () => {
    const small = '.feedGrid[data-view="small"]';
    const rules = [...community.matchAll(/\n(\.feedGrid\[data-view="small"\] [^{]+) \{([^}]*)\}/g)]
      .map(([, selectors, body]) => ({ selectors: selectors.split(",\n"), body }))
      .filter(({ selectors }) => !selectors.some((selector) => selector.endsWith(".knobOverlay")));
    expect(rules.length).toBeGreaterThanOrEqual(7);
    for (const { selectors, body } of rules) {
      const twin = selectors.map((selector) => selector.replace(small, ".feedWall")).join(",\n  ");
      expect(declarations(phone(twin)), twin).toEqual(declarations(body));
    }
  });
});

// On 26 October one public deck named in 62 characters made /community/decks
// and its owner's profile 578px wide on a 390px phone. Every card in the
// column grew to 562px with it, and the tab bar to 578px, which put YOU off
// the screen. A bare 1fr is minmax(auto, 1fr), and the card's auto width is
// its title on one line.
describe("the deck grid on a phone", () => {
  const community = css("Community.module.css");

  it("lets the column be narrower than a deck's name", () => {
    expect(anyMediaRule(community, MOBILE_MEDIA_QUERY, ".deckGrid")).toContain(
      "grid-template-columns: minmax(0, 1fr);",
    );
  });

  it("ends a name too long for the card in an ellipsis", () => {
    const title = declarations(rule(community, ".deckCardTitle"));
    expect(title).toContain("white-space: nowrap");
    expect(title).toContain("overflow: hidden");
    expect(title).toContain("text-overflow: ellipsis");
  });
});

/** Every rule inside each `@media <query>` block, its selector list split. */
function mediaRules(source: string, query: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(`\n@media ${query} {`)
    .slice(1)
    .flatMap((part) => [...part.slice(0, part.indexOf("\n}")).matchAll(/\n {2}([^{}]+) \{([^}]*)\}/g)])
    .map(([, selectors, body]) => ({ selectors: selectors.split(",").map((s) => s.trim()), body }));
}

// On 26 October a bare `.headerSpacer { display: none }` in the phone block,
// meant for the page header's gap, took out the same span in eight other rows.
// At 390px the comment Post button sat at x 16 instead of 316, the deck
// panel's ↑ buttons wandered between x 115 and 213 with each title's length,
// and Make & publish on your own profile moved to the left edge.
describe("the header spacer on a phone", () => {
  const community = css("Community.module.css");

  it("hides only the page header's own spacer", () => {
    const hidden = mediaRules(community, MOBILE_MEDIA_QUERY)
      .flatMap(({ selectors }) => selectors)
      .filter((selector) => selector.endsWith(".headerSpacer"));
    expect(hidden).toEqual([".pageHeader > .headerSpacer"]);
  });

  // The deck panel opens from the header's deck chip and is drawn inside the
  // <header>, so a descendant selector would still reach its rows.
  it("reaches the header's spacer as a child, not the deck panel inside it", () => {
    expect(community).not.toMatch(/\.pageHeader \.headerSpacer/);
  });

  // In the two-column action grid a spacer is a cell of its own, and Empty
  // deck would drop to a third row.
  it("still hides it in the action grid, wherever that grid is drawn", () => {
    const grid = mediaRules(community, "(max-width: 900px)");
    expect(grid.find(({ selectors }) => selectors.includes(".actionRow"))?.body).toContain("display: grid;");
    const spacer = grid.find(({ selectors }) => selectors.includes(".actionRow > .headerSpacer"));
    expect(spacer, ".actionRow > .headerSpacer is missing from @media (max-width: 900px)").toBeDefined();
    expect(spacer!.body).toContain("display: none;");
  });

  // At 390px "@ada YOU" and its stats line take the first line, and the
  // actions wrap to a second one where no spacer reaches.
  it("keeps your profile's actions right when they wrap under the name", () => {
    expect(declarations(rule(community, ".profileSelfActions"))).toContain("margin-left: auto");
  });
});

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
