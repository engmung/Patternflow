import type { MetadataRoute } from "next";
import { getAllJournalPosts } from "@/lib/journal";

const siteUrl = "https://patternflow.work";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/pattern`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/build`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/inside`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/roadmap`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${siteUrl}/journal`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/journal/en`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  const journalRoutes: MetadataRoute.Sitemap = getAllJournalPosts().flatMap(
    (post) => {
      const lastModified = new Date(post.date);
      const languages = {
        ko: `${siteUrl}/journal/${post.slug}`,
        en: `${siteUrl}/journal/${post.slug}/en`,
      };

      return [
        {
          url: languages.ko,
          lastModified,
          changeFrequency: "monthly",
          priority: 0.6,
          alternates: { languages },
        },
        {
          url: languages.en,
          lastModified,
          changeFrequency: "monthly",
          priority: 0.6,
          alternates: { languages },
        },
      ];
    },
  );

  return [...staticRoutes, ...journalRoutes];
}
