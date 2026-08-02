import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { CAMPAIGN_ROUTES } from "./src/lib/campaignRoutes";

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  // Native module — must stay a runtime require, not a bundled dependency.
  serverExternalPackages: ["better-sqlite3"],
  async redirects() {
    return [
      {
        source: "/journal/:slug",
        has: [{ type: "query", key: "lang", value: "en" }],
        destination: "/journal/:slug/en",
        permanent: true,
      },
      {
        source: "/journal",
        has: [{ type: "query", key: "lang", value: "en" }],
        destination: "/journal/en",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return CAMPAIGN_ROUTES.map(({ path, destination }) => ({
      source: path,
      destination,
    }));
  },
  async headers() {
    return [
      {
        // The flasher manifest names the image paths for a given release, so a
        // cached copy keeps handing out the previous firmware long after a new
        // one ships. The images themselves live at version-stamped paths and
        // may be cached freely; only this pointer must always be fetched fresh.
        source: "/flash/manifest.json",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        // Every pattern card boots its own sandboxed iframe from this one
        // document, so the feed loads it dozens of times per visit. Without
        // this header each load is a round trip to the origin (a Raspberry
        // Pi), and the cards visibly warm up one by one. Safe to cache hard:
        // the URL carries ?v= (see lib/community/sandboxUrl.ts), and bumping
        // it on change is already the rule.
        source: "/pattern-sandbox.html",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

export default withMDX(nextConfig);
