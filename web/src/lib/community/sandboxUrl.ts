// Single source of the sandbox iframe URL. The ?v= param cache-busts the
// static /pattern-sandbox.html — bump it whenever that file changes, or stale
// browser caches will keep running the old runtime (and silently ignore new
// protocol features like the @ramp annotation).
export const PATTERN_SANDBOX_URL = "/pattern-sandbox.html?v=2";
