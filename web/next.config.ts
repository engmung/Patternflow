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
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

export default withMDX(nextConfig);
