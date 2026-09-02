"use client";

import { useEffect, useState } from "react";

// SSR-safe media query hook: renders `false` on the server and first client
// paint, then tracks the real match. Callers must tolerate the one-frame
// desktop-first render (they already do — the same is true of any measured
// layout on this site).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    // `change` is the real signal; the resize listener is a fallback for
    // embedded WebViews / emulated viewports that resize the window without
    // dispatching MediaQueryList change events.
    mql.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mql.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [query]);

  return matches;
}

// One shared definition of "mobile" for the community feed: a small screen, or
// a touch device that can't hover (so hover-to-play previews are dead weight).
export const MOBILE_MEDIA_QUERY = "(max-width: 768px), (hover: none)";

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
