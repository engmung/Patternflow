// Single source of the sandbox iframe URL. The ?v= param cache-busts the
// static /pattern-sandbox.html — bump it whenever that file changes, or stale
// browser caches will keep running the old runtime (and silently ignore new
// protocol features like the @ramp annotation).
//
// Bumping is not optional: next.config serves this file with a year-long
// immutable Cache-Control (every feed card boots an iframe from it, and
// without the cache each boot is a round trip to the Pi). An edit without a
// bump ships to nobody who has ever visited.
export const PATTERN_SANDBOX_URL = "/pattern-sandbox.html?v=4";
