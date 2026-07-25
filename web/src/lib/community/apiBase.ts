// Where the community API actually lives.
//
// The community runs on its own deployment (its own database), while Pattern
// Lab is also served from the main site. So a "Share to Community" click can
// originate from either origin, and the request has to reach the community
// host either way.
//
// Same-origin stays relative — no CORS, no preflight — and only a genuinely
// cross-origin call is rewritten to the absolute URL. Set
// NEXT_PUBLIC_COMMUNITY_URL to the community's public URL on every deployment
// (including the community's own, where it will simply match and stay
// relative); leave it unset for local development.
//
// The two origins are subdomains of one registrable domain, so the session
// cookie is same-site and rides along with `credentials: "include"` — there is
// no SameSite=None / third-party-cookie problem to solve here.

function configuredOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_COMMUNITY_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Is a community reachable from this build at all?
 *
 * Surfaces that publish to the community (Pattern Lab's share button) are
 * hidden when it is not, so a deployment that ships before the community host
 * exists doesn't offer a button that can only fail. Set
 * NEXT_PUBLIC_COMMUNITY_URL to switch them on.
 */
export function communityConfigured(): boolean {
  return configuredOrigin() !== null;
}

/**
 * Href for a community page, usable from any deployment and from either the
 * server or the client.
 *
 * Unlike `crossOriginCommunityBase` this never inspects `window`, so it
 * renders identically during SSR and hydration — a link whose target flipped
 * between the two would be a hydration mismatch.
 */
export function communityHref(path = "/community"): string {
  const origin = configuredOrigin();
  return origin ? `${origin}${path}` : path;
}

/**
 * Does the community this page talks to compile firmware?
 *
 * Separate from `communityConfigured` because the build worker is its own
 * process: a community can be running perfectly well with nobody to compile
 * for it, and offering a button that can only 503 is worse than not offering
 * one. Set NEXT_PUBLIC_BUILD_ENABLED alongside the server's BUILD_ENABLED.
 */
export function buildsConfigured(): boolean {
  return process.env.NEXT_PUBLIC_BUILD_ENABLED === "1";
}

/** Absolute community origin, or null when the API is same-origin. */
export function crossOriginCommunityBase(): string | null {
  if (typeof window === "undefined") return null;
  const origin = configuredOrigin();
  if (!origin || origin === window.location.origin) return null;
  return origin;
}

/** Build a URL for a community API path (relative when same-origin). */
export function communityApiUrl(path: string): string {
  const base = crossOriginCommunityBase();
  return base ? `${base}${path}` : path;
}

/**
 * Fetch options every community mutation needs. `credentials: "include"` is
 * required for the cookie to be sent cross-origin, and is harmless same-origin.
 */
export const COMMUNITY_FETCH_INIT: Pick<RequestInit, "credentials"> = {
  credentials: "include",
};
