import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { CAMPAIGN_ROUTES } from "./src/lib/campaignRoutes";

const isProd = process.env.NODE_ENV === "production";

// The ?v= on the sandbox iframe URL, derived from the sandbox document itself.
//
// It used to be a number a human bumped by hand, and the hand forgot: the
// OKLab/OKLCH ramp modes (9413106) edited public/pattern-sandbox.html without
// touching lib/community/sandboxUrl.ts, and because this file is served
// immutable for a year, every browser that had ever loaded ?v=5 kept running
// the pre-OKLab runtime — which does not know the mode names, so it dropped
// every `// @ramp oklch…` annotation on the floor and painted those patterns
// with the default ramp instead. Desktop looked fine (a fresh cache), phones
// did not (a warm one). A hash cannot forget.
const PATTERN_SANDBOX_VERSION = crypto
  .createHash("sha256")
  .update(fs.readFileSync(path.join(process.cwd(), "public", "pattern-sandbox.html")))
  .digest("hex")
  .slice(0, 10);

const nextConfig: NextConfig = {
  // Inlined into the client bundle at build time; read by
  // lib/community/sandboxUrl.ts, which is the only thing that should use it.
  env: { PATTERN_SANDBOX_VERSION },
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
      // The shelf was /variants until 2026-09. The word the docs settled on is
      // "edition" (docs/EDITIONS.md); the old URL is baked into every 3.8.0
      // console page and printed in release notes, so it stays forever.
      { source: "/variants", destination: "/editions", permanent: true },
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
        // ── Baseline security headers ──
        // The community has one-click destructive actions behind a session
        // cookie — delete a pattern, remove somebody's comment, publish, work
        // the moderation queue — and nothing stopped another site from
        // framing those buttons under a transparent overlay and borrowing a
        // logged-in visitor's clicks. frame-ancestors is the fix;
        // X-Frame-Options is the same statement for anything that predates it.
        //
        // 'self' rather than 'none' because the pattern sandbox is an iframe
        // this site serves to itself (see /pattern-sandbox.html). Embedding
        // YouTube is unaffected: this controls who may frame US.
        //
        // Deliberately NOT a full CSP yet. script-src on a Next app needs
        // nonces threaded through the framework's inline bootstrap, and a
        // half-right script-src fails closed — a blank site. That is its own
        // piece of work; these four are the ones that are safe today.
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing here asks for these, and the YouTube embed is granted
          // what it needs through its own allow= attribute.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // The flasher manifest names the image paths for a given release, so a
        // cached copy keeps handing out the previous firmware long after a new
        // one ships. The images themselves live at version-stamped paths and
        // may be cached freely; only this pointer must always be fetched fresh.
        //
        // It is also the file a device's own console checks its version
        // against. That page is served BY the device, from a LAN address, so
        // the read is cross-origin and needs saying so — without this the
        // browser blocks it and the "newer firmware exists" banner simply
        // never appears. The manifest is public release metadata; there is
        // nothing here to keep from anyone.
        source: "/flash/manifest.json",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        // The release images, read cross-origin by the device's own /update
        // page during a wireless update: the browser fetches the .bin from
        // here and POSTs it to the board on the LAN, so the device never
        // needs TLS (it has nowhere near the heap for a handshake). Paths
        // carry the version, so they never change under a cached copy.
        source: "/flash/bin/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Pattern packs, read cross-origin by a device's own /patterns page:
        // the browser fetches the .zip from here, unpacks it, and posts the
        // modules to the board on the LAN. Same reason as the firmware images
        // above — the device has nowhere near the heap for a TLS handshake, so
        // the browser is what reaches the internet.
        //
        // Revalidated rather than cached hard, unlike /flash/bin: those paths
        // carry a version and these do not. A pack sits at a stable address
        // and is rebuilt in place when its patterns change, which is exactly
        // the case `immutable` would get wrong.
        source: "/packs/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        // Every pattern card boots its own sandboxed iframe from this one
        // document, so the feed loads it dozens of times per visit. Without
        // this header each load is a round trip to the origin (a Raspberry
        // Pi), and the cards visibly warm up one by one. Safe to cache hard
        // in production: the URL carries ?v=<hash of this very file>, so a
        // changed document is a changed URL by construction.
        //
        // Not in development, though. The hash is computed once when the
        // config loads, and editing public/ does not reload the config — so a
        // year-long immutable copy of the file you are editing is exactly
        // wrong. `next dev` revalidates instead.
        source: "/pattern-sandbox.html",
        headers: [
          {
            key: "Cache-Control",
            value: isProd ? "public, max-age=31536000, immutable" : "no-store",
          },
        ],
      },
    ];
  },
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

export default withMDX(nextConfig);
