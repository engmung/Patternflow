// jsdom applies no stylesheet, so the home view's phone rules are read from
// globals.css. On 15 November 2026, at 390px, the site's nav was 11px words
// 18px tall in the corner over the wordmark, and Build, Pattern and Inside
// began 46px from the screen's edge where the hero began 24px. The shop had a
// box in the nav and a poster under the hero's buttons, and had sold next to
// nothing.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  selectors: string[];
  body: string;
  /** Where the rule starts in the stylesheet, for "this one comes later". */
  at: number;
}

function rules(source: string, offset = 0): Rule[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
    body: m[2],
    at: offset + (m.index ?? 0),
  }));
}

/** The rules inside every `@media (max-width: 900px)` block, by matching braces. */
function below900(): Rule[] {
  const out: Rule[] = [];
  const open = /@media \(max-width: 900px\)\s*\{/g;
  for (let m = open.exec(css); m; m = open.exec(css)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth++;
      if (css[i] === '}') depth--;
      i++;
    }
    out.push(...rules(css.slice(start, i - 1), start));
  }
  return out;
}

function declaration(body: string, property: string) {
  return body.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`))?.[1].trim();
}

const phone = below900();
const own = (selector: string) => phone.filter((r) => r.selectors.includes(selector));

describe('the home view on a phone', () => {
  it('puts the site nav in the flow, as a row over the wordmark', () => {
    const nav = own('.hero-top-links');
    expect(nav.some((r) => declaration(r.body, 'position') === 'static')).toBe(true);
    expect(nav.some((r) => declaration(r.body, 'justify-content') === 'space-between')).toBe(true);
    // No rule pins it back over the wordmark.
    expect(css).not.toMatch(/position:\s*absolute\s*!important/);
  });

  it('makes each nav entry 44px tall to a finger', () => {
    expect(own('.hero-top-links a').some((r) => declaration(r.body, 'min-height') === '44px')).toBe(true);
  });

  it('keeps nothing clear over the wordmark, now the nav is a row of its own', () => {
    const hero = own('.hero').find((r) => declaration(r.body, 'padding'));
    expect(declaration(hero!.body, 'padding')).toBe('0 0 60px');
    expect(declaration(hero!.body, 'gap')).toBe('0');
  });

  it('gives a tab panel no side padding of its own, after the rules that gave it some', () => {
    const [flat] = own('.pf-section-panel');
    expect(flat, 'no .pf-section-panel rule below 900px').toBeDefined();
    expect(declaration(flat.body, 'padding-left')).toBe('0');
    expect(declaration(flat.body, 'padding-right')).toBe('0');
    const padded = rules(css).filter(
      (r) => r.selectors.includes('.pf-section-panel') && declaration(r.body, 'padding'),
    );
    expect(padded.length).toBeGreaterThan(0);
    for (const rule of padded) expect(flat.at).toBeGreaterThan(rule.at);
  });

  it('draws the section bar in ink, and its open tab reversed', () => {
    const [tab] = own('.mobile-bottom-nav .mb-tab');
    expect(declaration(tab.body, 'color')).toBe('var(--ink)');
    const [active] = own('.mobile-bottom-nav .mb-tab.active');
    expect(declaration(active.body, 'color')).toBe('var(--cream)');
    expect(declaration(active.body, 'background')).toBe('var(--ink)');
  });

  it('underlines the footer link, which a phone cannot hover over', () => {
    const [link] = own('footer .foot-row a');
    expect(declaration(link.body, 'text-decoration')).toBe('underline');
    expect(declaration(link.body, 'padding')).toBe('12px 0');
  });
});

describe('the shop on the home view', () => {
  it('has no box in the nav and no poster in the hero', () => {
    expect(css).not.toContain('.shop-link');
    expect(css).not.toContain('.hero-shop');
  });
});
