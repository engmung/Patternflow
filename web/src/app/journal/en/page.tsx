import type { Metadata } from "next";
import JournalIndex from "@/components/journal/JournalIndex";
import { getAllJournalPosts } from "@/lib/journal";

export const metadata: Metadata = {
  title: "Journal / Patternflow",
  description: "Writing and notes from Patternflow.",
};

export default function EnglishJournalPage() {
  const lang = "en";
  const posts = getAllJournalPosts({ lang });

  return <JournalIndex posts={posts} lang={lang} />;
}
