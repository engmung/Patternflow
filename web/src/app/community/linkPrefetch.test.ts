import { describe, expect, it } from "vitest";
import { links } from "../../../test/linkTags";

// A <Link> in view prefetches the page it points to, and that page's client
// chunks come with it. On 26 October, at 390px and 1440px, /community
// fetched 20 scripts (392.8 KB gzip), and 9 of them (218.7 KB) arrived after
// the load event. 210.5 KB was Pattern Lab, prefetched by the header's
// "Pattern Lab ↗", and 5.0 KB was /editions, from the firmware notice. With
// prefetch={false} on the links that leave the community, nothing arrived
// after load. A page outside the community loads when its link is followed.

const HREF = /\bhref=(?:"([^"]*)"|\{["`]([^"`]*)["`]\})/;

/** The links whose href is written out and goes somewhere other than
 *  /community. An href computed from a variable is not read. */
const leaving = links("app/community", "components/community").filter(({ tag }) => {
  const m = tag.match(HREF);
  const href = m?.[1] ?? m?.[2];
  return href !== undefined && href.startsWith("/") && !/^\/community(?:[/?#]|$)/.test(href);
});

describe("links that leave the community", () => {
  it("are still found", () => {
    const files = leaving.map((l) => l.rel);
    expect(files).toContain("app/community/layout.tsx");
    expect(files).toContain("components/community/FirmwareNotice.tsx");
  });

  it("skip the prefetch", () => {
    const prefetching = leaving
      .filter(({ tag }) => !/\bprefetch=\{false\}/.test(tag))
      .map(({ rel, tag }) => `${rel}: ${tag.match(HREF)?.[0]}`);
    expect(prefetching).toEqual([]);
  });
});
