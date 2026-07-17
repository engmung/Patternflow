import type { Metadata } from "next";
import JournalIndex from "@/components/journal/JournalIndex";
import { getAllJournalPosts } from "@/lib/journal";

export const metadata: Metadata = {
  title: "Journal / Patternflow",
  description: "Writing and notes from Patternflow.",
  alternates: {
    canonical: "/journal",
    languages: {
      ko: "/journal",
      en: "/journal/en",
      "x-default": "/journal/en",
    },
  },
};

export default function JournalPage() {
  const lang = "ko";
  const posts = getAllJournalPosts({ lang });

  return <JournalIndex posts={posts} lang={lang} />;
}
