// CORS for the community API.
//
// Only origins named in COMMUNITY_ALLOWED_ORIGINS are answered — the header is
// echoed back per request rather than wildcarded, because `*` is not allowed
// together with credentials, and credentials are exactly what these routes
// need. Requests from anywhere else get no CORS headers and the browser blocks
// them; the routes' own auth checks are the real gate regardless.

function allowList(): string[] {
  return (process.env.COMMUNITY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null; // same-origin requests don't send Origin on GET
  return allowList().includes(origin) ? origin : null;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    // Responses differ by Origin, so caches must not share them.
    Vary: "Origin",
  };
}

/** This deployment's own public origin, as seen through any proxy/tunnel. */
function selfOrigin(request: Request): string | null {
  const host = request.headers.get("host");
  if (!host) return null;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Reject foreign origins at the door, not just in the response headers.
 *
 * CORS headers alone are not enough: a POST with no Content-Type (the like
 * toggle) is a "simple request", so the browser sends it WITHOUT a preflight
 * and only hides the response afterwards — the write would already have
 * happened. Checking Origin server-side is what actually stops that CSRF.
 *
 * A missing Origin header is allowed: same-origin navigations and non-browser
 * callers don't send one, and those are gated by the session check instead.
 */
export function originBlocked(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === selfOrigin(request)) return null;
  if (allowList().includes(origin)) return null;
  return Response.json({ error: "Origin not allowed." }, { status: 403 });
}

/** Attach CORS headers to a route's response. */
export function withCors(request: Request, response: Response): Response {
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    response.headers.set(key, value);
  }
  return response;
}

/** OPTIONS preflight handler, shared by every community route. */
export function preflight(request: Request): Response {
  const headers = corsHeaders(request);
  if (Object.keys(headers).length === 0) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
