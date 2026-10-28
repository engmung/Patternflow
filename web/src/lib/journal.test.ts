// Every journal date is a Seoul time ("2026-05-14T01:30:00+09:00"), and the
// pages are built wherever the build runs. On 27 October a build in UTC printed
// 60 of the 520 dates on /journal a day early: headache, stopped,
// i-hope-it-works-out and negative were written between midnight and 9 a.m. in
// Seoul, which is still the day before in UTC.

import { afterEach, describe, expect, it, vi } from "vitest";
import { formatJournalDate, getAllJournalPosts, type JournalLang } from "./journal";

// UTC is a build server, Los Angeles is nine hours further behind it, and
// Kiritimati (UTC+14) is the one that runs ahead of Seoul.
const ZONES = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Seoul"];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("formatJournalDate", () => {
  it.each(ZONES)("prints the Seoul day when the process runs in %s", (zone) => {
    vi.stubEnv("TZ", zone);

    expect(formatJournalDate("2026-05-14T01:30:00+09:00", "ko")).toBe("2026년 5월 14일");
    expect(formatJournalDate("2026-05-14T01:30:00+09:00", "en")).toBe("May 14, 2026");
    expect(formatJournalDate("2026-05-23T07:00:00+09:00", "en")).toBe("May 23, 2026");
    expect(formatJournalDate("2026-10-04T23:30:00+09:00", "ko")).toBe("2026년 10월 4일");
  });

  it("gives every post the day written in its frontmatter", () => {
    vi.stubEnv("TZ", "UTC");
    const wrong: string[] = [];

    for (const lang of ["ko", "en"] satisfies JournalLang[]) {
      for (const post of getAllJournalPosts({ lang, includeDrafts: true })) {
        const day = post.date.match(/^(\d{4})-(\d{2})-(\d{2})T[^+]*\+09:00$/);
        if (!day) continue;
        const want = formatJournalDate(`${day[1]}-${day[2]}-${day[3]}T12:00:00+09:00`, lang);
        const shown = formatJournalDate(post.date, lang);
        if (shown !== want) wrong.push(`${post.slug} (${lang}): ${shown}, written ${want}`);
      }
    }

    expect(wrong).toEqual([]);
  });
});
