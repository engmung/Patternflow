import { describe, expect, it } from 'vitest';
import { links } from '../../test/linkTags';

// A <Link href="/"> in view prefetches the home page, and the home page's
// client chunks come with it: three.js (237,537 bytes gzip) and the
// post-processing chunk (212,365). At 390px in Chromium on 22 October,
// /terms, /contact and a 404 fetched 767,286 bytes of script with the
// prefetch and 148,456 without, and /community 987,765 and 408,515. With
// prefetch={false} the home page loads when the link is followed. Pattern
// Lab (579,250 bytes) and the guide (107,109) still prefetch it, as do the
// breadboard guide, journal, editions and compliance. They are left out
// below until they are done the same way.

const LEFT_OUT = [
  'components/guide',
  'app/build/breadboard',
  'app/pattern-lab',
  'components/journal',
  'app/editions',
  'app/compliance',
];

const homeLinks = links('').filter(({ tag }) => /\bhref="\/"/.test(tag));

describe('links to the home page', () => {
  it('are still found', () => {
    expect(homeLinks.map((l) => l.rel)).toContain('app/not-found.tsx');
  });

  it('skip the prefetch outside the pages left out', () => {
    const prefetching = homeLinks
      .filter(({ rel }) => !LEFT_OUT.some((dir) => rel.startsWith(`${dir}/`)))
      .filter(({ tag }) => !/\bprefetch=\{false\}/.test(tag))
      .map(({ rel }) => rel);
    expect(prefetching).toEqual([]);
  });
});
