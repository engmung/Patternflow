import type { MetadataRoute } from "next";

const siteUrl = "https://patternflow.work";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Search engines and AI crawlers are welcome on public pages.
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/pattern-lab", "/video-baker", "/waitlist-thanks"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
