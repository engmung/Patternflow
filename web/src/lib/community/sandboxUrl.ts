// Single source of the sandbox iframe URL. The ?v= param cache-busts the
// static /pattern-sandbox.html, which next.config serves with a year-long
// immutable Cache-Control (every feed card boots an iframe from it, and
// without the cache each boot is a round trip to the Pi).
//
// The token is a hash of that document, computed by next.config at build time
// and inlined here — NOT a number anyone has to remember to bump. It was a
// hand-bumped number until the OKLab/OKLCH ramp modes shipped a rewritten
// runtime under an unchanged ?v=5: browsers with a warm cache kept the old
// one, which does not know those mode names, so it dropped their `// @ramp`
// lines and painted those patterns with the default ramp. Phones showed it
// (a cache months old), the machine it was written on did not.
//
// The fallback only applies where next.config did not do the inlining — a
// unit test importing this module, say. Nothing serves the site that way.
export const PATTERN_SANDBOX_VERSION = process.env.PATTERN_SANDBOX_VERSION || "dev";

export const PATTERN_SANDBOX_URL = `/pattern-sandbox.html?v=${PATTERN_SANDBOX_VERSION}`;
