// jsdom applies none of the CSS modules, so the sizes and states below are
// read from the files. In Chromium at 390px the dialog × measured 11×23px
// before these rules and 44×44px after.

import { readdirSync, readFileSync } from "node:fs";
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

// iOS Safari zooms the page into a field whose text is under 16px when it takes
// focus. On 26 October, at 390px, every community field was: 14px for the
// wall's search, a comment, sign in, a report and the edit dialogs, 12px for a
// C++ header, a performance's JSON and a deck's pack link, 12.5px for a deck's
// visibility picker. The board's address was 11.5px on the Basics card and
// 12px in the deck panel, the Send window and the zip note.
describe("text fields on a phone", () => {
  const community = css("Community.module.css");
  const fields = [
    ".textInput",
    ".commentForm textarea",
    ".field select",
    ".postBodyInput",
    ".shareLinkField",
    ".deckVisControl select",
    ".zipHostField",
  ];

  it.each(fields)("sets %s at 16px", (field) => {
    const sizes = mediaRules(community, MOBILE_MEDIA_QUERY)
      .filter(({ selectors }) => selectors.includes(field))
      .flatMap(({ body }) => body.match(/font-size: [^;]+;/g) ?? []);
    expect(sizes).toEqual(["font-size: 16px;"]);
  });

  // The pack link is monospace, and at 16px its 20 characters of its own made
  // the share dialog's row 329px in a 308px body.
  it("lets the pack link take its width from the row", () => {
    const field = declarations(rule(community, ".shareLinkField"));
    expect(field).toContain("flex: 1");
    expect(field).toContain("width: 0");
  });

  // A field with a class of its own fails here before it zooms a phone.
  it("covers every text field the community draws", () => {
    const src = path.resolve(__dirname, "../..");
    const files = ["components/community", "app/community", "components/guide/desk/community"].flatMap((dir) =>
      readdirSync(path.join(src, dir), { recursive: true, encoding: "utf8" })
        .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
        .map((name) => path.join(dir, name)),
    );
    const styled = /\b\w+\.(textInput|postBodyInput|shareLinkField|zipHostField)\b/;
    const loose: string[] = [];
    let seen = 0;
    for (const file of files) {
      const source = readFileSync(path.join(src, file), "utf8");
      for (const { index, 1: tag } of source.matchAll(/<(input|textarea|select)\b/g)) {
        const attributes = openingTag(source, index);
        if (/\btype="(range|checkbox|radio|file|hidden)"/.test(attributes)) continue;
        seen++;
        if (styled.test(attributes)) continue;
        const label = source.lastIndexOf("<label", index);
        const inLabel = label > -1 && !source.slice(label, index).includes("</label>");
        if (tag === "select" && inLabel && /^<label className=\{\w+\.(field|deckVisControl)\}/.test(source.slice(label))) {
          continue;
        }
        loose.push(`${file}:${source.slice(0, index).split("\n").length} <${tag}>`);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(30);
    expect(loose).toEqual([]);
  });
});

// On 26 October, at 390px, the header's links were 17.4 to 18.8px tall, the
// deck chip 29.2px, the notice's ✕ 18.9×21, the wall's sort tabs 25.6px and
// Flashable now 18.1px. "Patternflow" (18.4px) and "COMMUNITY" (11.5px) sat
// one on the other, and a 24px circle on each overlapped the other: WCAG 2.5.8.
describe("touch targets on a phone", () => {
  const community = css("Community.module.css");
  const phone = (selector: string) =>
    mediaRules(community, MOBILE_MEDIA_QUERY)
      .filter(({ selectors }) => selectors.includes(selector))
      .flatMap(({ body }) => declarations(body));
  const px = (lines: string[], property: string) => {
    const line = lines.findLast((l) => l.startsWith(`${property}:`));
    expect(line, `${property} is missing`).toBeDefined();
    return line!.slice(property.length + 1).trim();
  };

  it.each([".headerNav > a", ".headerNav > button", ".sortTabs a", ".sortTabs button", ".filterChip", ".zipHostField"])(
    "gives %s 44px of height",
    (selector) => {
      expect(phone(selector)).toContain("min-height: 44px");
    },
  );

  // The handle's ellipsis needs a block box, so it cannot be the flex box the
  // other links are.
  it("gives the handle its 44px from the line and keeps the ellipsis", () => {
    const chip = phone(".headerNav > .userChip");
    expect(chip).toContain("display: block");
    expect(chip).toContain("line-height: 44px");
    expect(phone(".userChip")).toContain("text-overflow: ellipsis");
  });

  it("widens Alerts and the handle without lengthening the row", () => {
    for (const selector of [".notifyLink", ".headerNav > .userChip"]) {
      const lines = phone(selector);
      expect(lines, selector).toContain("padding: 0 6px");
      expect(lines, selector).toContain("margin: 0 -6px");
    }
    // Every box is border-box, so the padding comes out of the handle's
    // 96px unless the cap grows with it.
    const caps = phone(".headerNav > .userChip").concat(phone(".userChip")).filter((l) => l.startsWith("max-width:"));
    expect(caps).toEqual(["max-width: 108px", "max-width: 96px"]);
  });

  it("gives the wordmark's two links a 24px line each", () => {
    for (const selector of [".brand", ".pageTitle"]) {
      expect(phone(selector), selector).toContain("min-height: 24px");
    }
  });

  // 8px of padding on each side of a 48px wordmark is 64px and a border, the
  // 65px the header was with 14px around a 36.8px Sign in.
  it("keeps the header as tall as it was", () => {
    const [vertical] = px(phone(".pageHeader"), "padding").split(" ");
    expect(parseFloat(vertical) * 2 + 2 * 24).toBeLessThanOrEqual(66);
  });

  // The ✕ and the link reach into the strip's own padding, so a 44px row in
  // a strip with 9px above it does not push the header down 23px.
  it("gives the notice's ✕ a 44px square inside the strip's padding", () => {
    const close = phone(".fwNoticeClose");
    expect(close).toContain("min-width: 44px");
    expect(close).toContain("min-height: 44px");
    const [top, right] = px(declarations(rule(community, ".fwNotice")), "padding").split(" ");
    expect(px(close, "margin")).toBe(`-${top} -${right} -${top} auto`);
    expect(phone(".fwNoticeLink")).toContain("min-height: 44px");
    expect(px(phone(".fwNoticeLink"), "margin")).toBe(`-${top} 0`);
  });

  it("drops the gaps between the wall's control rows", () => {
    expect(phone(".sortTabs")).toContain("row-gap: 0");
    expect(phone(".feedControls")).toContain("gap: 0 12px");
  });

  // Inside its sentence the field is a pointer's target and needs 24px; a
  // thumb gets a line of its own.
  it("gives the board's address its own line on a phone and 24px elsewhere", () => {
    const field = phone(".zipHostField");
    expect(field).toContain("display: block");
    expect(field).toContain("width: 100%");
    expect(declarations(rule(community, ".zipHostField"))).toContain("min-height: 24px");
  });
});

/** A JSX opening tag from its `<` to its `>`, past the arrows in its handlers. */
function openingTag(source: string, from: number): string {
  let depth = 0;
  for (let at = from; at < source.length; at++) {
    const char = source[at];
    if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === ">" && depth === 0) return source.slice(from, at + 1);
  }
  throw new Error(`unclosed tag at ${from}`);
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
