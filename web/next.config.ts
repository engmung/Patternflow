import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { CAMPAIGN_ROUTES } from "./src/lib/campaignRoutes";

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  // Native module — must stay a runtime require, not a bundled dependency.
  serverExternalPackages: ["better-sqlite3"],
  // Testing anything touch-shaped means opening `next dev` from a phone, at
  // this machine's address on the network rather than at localhost. Next
  // blocks cross-origin requests to /_next/* by default, and the symptom is
  // not an error page: the HTML server-renders, the bundle loads, React never
  // hydrates, and every pattern card sits at "rendering…" forever with no
  // clue why. Private ranges are allowed here so that just works; add a
  // tunnel host or anything else with NEXT_DEV_ORIGINS=a.example,b.example.
  // Development only — this has no effect on a production build.
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "100.*.*.*", // Tailscale
    "*.local",
    ...(process.env.NEXT_DEV_ORIGINS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
  ],
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
