import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { BUILD_CASES, DEFAULT_CASE, findCase, stepCase } from './build-cases-data';

// The case cards against the repo: every GitHub link points at a path that
// exists on this tree (a blob at a file, a tree at a folder) and every #anchor
// at a heading in that file, every photo is in public/ at the size the card
// says, each remix card agrees with its own README's header, nothing presents
// USB-C as power, and content/build.md no longer says the laser-cut case is
// still being prepared. Paths resolve from this file, not the working
// directory, so the suite runs from the repo root as well as from web/.

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PUBLIC = path.join(REPO_ROOT, 'web/public');
const GITHUB = /^https:\/\/github\.com\/engmung\/Patternflow\/(blob|tree)\/main\/(.+)$/;

// Width and height from a baseline or progressive JPEG's SOF marker.
function jpegSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  expect(buf[0] === 0xff && buf[1] === 0xd8, `${file} is not a JPEG`).toBe(true);
  let at = 2;
  while (at < buf.length) {
    const marker = buf[at + 1];
    const length = buf.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
    }
    at += 2 + length;
  }
  throw new Error(`${file}: no SOF marker`);
}

// GitHub's heading anchors: lower case, punctuation dropped (backticks,
// slashes, dashes of other kinds, brackets), each space a hyphen.
function anchors(markdown: string): Set<string> {
  return new Set(
    markdown
      .split('\n')
      .filter((line) => /^#{1,6} /.test(line))
      .map((line) =>
        line
          .replace(/^#{1,6} /, '')
          .trim()
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
          .replace(/ /g, '-'),
      ),
  );
}

function readmeHeader(folder: string): Record<string, string> {
  const text = fs.readFileSync(path.join(REPO_ROOT, folder, 'README.md'), 'utf8');
  const fields: Record<string, string> = {};
  for (const line of text.split('\n').slice(0, 6)) {
    const match = line.match(/^(\w[\w ]*): (.*?)\s*$/);
    if (match) fields[match[1]] = match[2];
  }
  return fields;
}

// How each remix's README takes over from the build guide, and how its card
// says so. Besoiobiy's and SimonePDA's replace the printing and case-assembly
// sections by number; mbchars' sends the reader to its own illustrated
// assembly instructions and BOM changes, and back to the build guide for the
// controller's setup and operation.
const GUIDE_BACKING: Record<string, { readme: RegExp; card: RegExp }> = {
  'besoiobiy-printed': { readme: /\(4 and 6\)/, card: /sections 4 and 6/ },
  'simonepda-lasercut': { readme: /\(4 and 6\)/, card: /sections 4 and 6/ },
  'mbchars-horizontal-desktop-printed': {
    readme: /\[BOM changes\]\(bom\.md\)[^\n]*\[illustrated assembly instructions\]\(assembly\.md\)/,
    card: /assembly instructions \(assembly\.md\) and BOM changes \(bom\.md\)/,
  },
};

describe('the case cards', () => {
  it('are the official case and the three remixes, official first and the default', () => {
    expect(BUILD_CASES.map((item) => item.id)).toEqual([
      'official',
      'besoiobiy-printed',
      'simonepda-lasercut',
      'mbchars-horizontal-desktop-printed',
    ]);
    expect(DEFAULT_CASE).toBe('official');
    expect(BUILD_CASES[0].kind).toBe('official');
    // The official case's guide is the build guide itself.
    expect(BUILD_CASES[0].readme).toBeUndefined();
    expect(findCase('nope')).toBeUndefined();
    expect(findCase(null)).toBeUndefined();
  });

  it.each(BUILD_CASES)('$id links only to paths and headings that exist on this tree', (item) => {
    const hrefs = [
      ...item.links.map((link) => link.href),
      item.author.href,
      item.cautionHref,
      item.readme,
    ].filter(Boolean) as string[];
    expect(item.links.length).toBeGreaterThanOrEqual(3);
    // The caution's "How to check" lands on the README section that says how.
    expect(item.cautionHref).toMatch(GITHUB);
    expect(item.cautionHref).toContain('#');
    for (const href of hrefs) {
      const match = href.match(GITHUB);
      if (!match) {
        expect(href, 'a link off GitHub is https').toMatch(/^https:\/\//);
        continue;
      }
      const [, kind, target] = match;
      const [repoPath, anchor] = target.split('#');
      const full = path.join(REPO_ROOT, repoPath);
      expect(fs.existsSync(full), `${href} → ${repoPath} is missing`).toBe(true);
      expect(fs.statSync(full).isDirectory(), `${href}: blob/ wants a file, tree/ a folder`).toBe(kind === 'tree');
      if (anchor) {
        expect(anchors(fs.readFileSync(full, 'utf8')), `${href}: no heading for #${anchor}`).toContain(anchor);
      }
    }
  });

  it.each(BUILD_CASES)('$id photos are in public/ at the size the card gives', (item) => {
    expect(item.photos.length).toBeGreaterThanOrEqual(2);
    for (const photo of item.photos) {
      expect(photo.src).toMatch(new RegExp(`^/cases/${item.id}/[a-z0-9_]+\\.jpg$`));
      expect(photo.alt.length).toBeGreaterThan(20);
      const size = jpegSize(path.join(PUBLIC, photo.src));
      expect(size, photo.src).toEqual({ width: photo.width, height: photo.height });
      // Copies for the web, not the originals: nothing past 1400 px.
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(1400);
    }
  });

  it.each(BUILD_CASES.filter((item) => item.kind === 'remix'))(
    '$id agrees with its README header',
    (item) => {
      const folder = `hardware/case/remixes/${item.id}`;
      const header = readmeHeader(folder);
      // The folder name is the id, so /build?case=<id> reads like the path.
      expect(item.links[0].href).toBe(`https://github.com/engmung/Patternflow/tree/main/${folder}`);
      // The remix's guide is its README: the card leads with a link to it,
      // and says what the preview's model of it is made from.
      expect(item.readme).toBe(`https://github.com/engmung/Patternflow/blob/main/${folder}/README.md`);
      expect(item.modelNote).toMatch(/^The 3D view /);
      expect(header.Author).toContain(item.author.name);
      expect(header.License).toBe('CC-BY-SA-4.0');
      expect(item.license).toMatch(/^CC BY-SA 4\.0/);
      // The verified date on the card is the one in the README.
      const date = header.Verified.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      expect(date).toBeTruthy();
      expect(item.verified).toContain(date as string);
      // What the card says the README does to the build guide is what the
      // README says, in its own words.
      const readme = fs.readFileSync(path.join(REPO_ROOT, folder, 'README.md'), 'utf8');
      const backing = GUIDE_BACKING[item.id];
      expect(backing, `${item.id}: no entry in GUIDE_BACKING`).toBeDefined();
      expect(readme).toMatch(backing.readme);
      expect(item.guide).toMatch(backing.card);
    },
  );

  it('sends the laser-cut reader to all three pages of the drawing, not one sheet', () => {
    const simone = findCase('simonepda-lasercut');
    expect(simone?.make).toMatch(/page 1/);
    expect(simone?.make).toMatch(/page 3/);
    expect(simone?.make).toMatch(/page 5/);
    expect(simone?.step.desc).not.toMatch(/one sheet/i);
  });

  it('never offers USB-C as power', () => {
    // BUILD_GUIDE §2: J4, the screw terminal, is the only power input.
    expect(JSON.stringify(BUILD_CASES)).not.toMatch(/USB/i);
  });

  it('steps through every case in the switch order, wrapping at both ends (the preview arrows)', () => {
    const ids = BUILD_CASES.map((item) => item.id);
    ids.forEach((id, i) => {
      expect(stepCase(id, 1)).toBe(ids[(i + 1) % ids.length]);
      expect(stepCase(id, -1)).toBe(ids[(i - 1 + ids.length) % ids.length]);
    });
  });
});

describe('content/build.md', () => {
  it('no longer lists the laser-cut case as in preparation', () => {
    // gray-matter, as lib/content.ts reads it — but from this file's path,
    // where the loader goes by process.cwd().
    const raw = fs.readFileSync(path.join(REPO_ROOT, 'web/content/build.md'), 'utf8');
    const { data, content } = matter(raw);
    expect(data.title).toBe('Build your own.');
    expect(data.subtitle).toMatch(/US\$100–200/);
    expect(raw).not.toMatch(/Preparing|being prepared|in preparation/i);
    expect(content).toMatch(/laser-cut from acrylic or MDF/);
  });
});
