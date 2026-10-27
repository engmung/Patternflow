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
  // Nothing under public/ belongs inside a server function. Vercel serves it
  // from the CDN and `next start` reads it from the checkout, so a function
  // carrying a copy carries dead weight — and the file tracer hands out copies
  // freely, because any fs path it cannot resolve becomes a glob. One
  // `path.join(process.cwd(), "public", src)` in lib/journalImageMeta.ts put
  // all of public/ — every journal photo, 100 MB — into each journal function;
  // `path.join(…, "builds")` in the build queue matched public/builds; the
  // variant-bin route's env-rooted path matched the whole project. That was
  // ~220 MB of function bundle per deployment, and Vercel meters storage per
  // retained deployment: in 2026-09 the Hobby team stood at 77 GB against a
  // 10 GB Functions Storage allowance.
  //
  // Safe because the one reader of public/ is the journal image probe, and it
  // only runs where public/ is on disk anyway: at build time on Vercel (those
  // pages are prerendered and never revalidate) and from the checkout on the
  // Pi. If it ever did run inside a function it falls back to default
  // dimensions rather than throwing.
  outputFileTracingExcludes: {
    "/*": ["public/**/*"],
  },
  // Turbopack's build cache has been on by default since 16.3.0, and Vercel
  // restores .next/cache before each build. The production build of 2026-09-29
  // shipped the previous build's globals.css under the new page: the new hero
  // markup, and none of its rules. A cold build is slower and cannot do that.
  experimental: {
    turbopackFileSystemCacheForBuild: false,
  },
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
      // "edition" (docs/EDITIONS.md); the old URL is baked into every console
      // page from 3.7.0 to 3.8.0 and printed in release notes, so it stays
      // forever.
      { source: "/variants", destination: "/editions", permanent: true },
      // There is no /flash page: the flasher is a button (the Pattern tab, the
      // Play guide), and /flash only holds its manifest and images. But the
      // device's own Update page ("flash it over USB at patternflow.work/flash")
      // and every release's FLASHING.md send people here, so the bare path goes
      // to the guide's Flash chapter, where the button and the steps are. Only
      // the exact path: /flash/manifest.json and /flash/bin/* are untouched.
      { source: "/flash", destination: "/guide/play#flash", permanent: false },
      // The community's workshop came down on 26 October 2026: the map of
      // directions, its threads, and the moderators' territory editor. Its
      // rows stay in the database. A link to any of it, from an old alert, a
      // post elsewhere or a bookmark, lands on the community's front page. One
      // line per page that was there.
      { source: "/community/workshop", destination: "/community", permanent: false },
      { source: "/community/workshop/:code", destination: "/community", permanent: false },
      { source: "/community/workshop/:code/t/:id", destination: "/community", permanent: false },
      { source: "/community/t/:id", destination: "/community", permanent: false },
      { source: "/community/territories", destination: "/community", permanent: false },
      // From the journal's first post on 29 April 2026 until 11 May, its own
      // links asked for English with ?lang=en. English moved to /en paths that
      // day (c44b0d7a), and these two send the old links there. The query goes
      // along, and proxy.ts takes it off and sets the language cookie.
      //
      // The first one reads /journal/en?lang=en as a post called "en" and
      // answers /journal/en/en, which proxy.ts collapses back to /journal/en.
      // /journal/en?lang=en is where the second one sends /journal?lang=en,
      // and the language switch on the Korean index has linked it since
      // 17 May.
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
