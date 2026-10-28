// The card a post shows when its link is shared printed the frontmatter date
// as it is written: "2026-05-14T01:30:00+09:00" across the top right of all
// 37 cards, on 27 October.

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllJournalPosts } from "@/lib/journal";
import OpenGraphImage from "./opengraph-image";

vi.mock("next/og", () => ({
  ImageResponse: class {
    element: ReactElement;
    constructor(element: ReactElement) {
      this.element = element;
    }
  },
}));

function strings(node: ReactNode): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(strings);
  if (isValidElement(node)) return strings((node.props as { children?: ReactNode }).children);
  return [];
}

async function cardText(slug: string) {
  const card = (await OpenGraphImage({ params: Promise.resolve({ slug }) })) as unknown as {
    element: ReactElement;
  };
  return strings(card.element);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("journal share card", () => {
  it("prints the day the post was written in Seoul, not the frontmatter string", async () => {
    vi.stubEnv("TZ", "UTC");
    const text = await cardText("headache");

    expect(text).toContain("May 14, 2026");
    expect(text).not.toContain("2026-05-14T01:30:00+09:00");
  });

  it("gives no card a raw timestamp", async () => {
    vi.stubEnv("TZ", "UTC");
    const raw: string[] = [];

    for (const post of getAllJournalPosts({ includeDrafts: true })) {
      const text = await cardText(post.slug);
      if (text.some((line) => /\d{4}-\d{2}-\d{2}T/.test(line))) raw.push(post.slug);
    }

    expect(raw).toEqual([]);
  });
});
