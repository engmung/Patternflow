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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatches(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// One shared definition of "mobile" for the community feed: a small screen, or
// a touch device that can't hover (so hover-to-play previews are dead weight).
export const MOBILE_MEDIA_QUERY = "(max-width: 768px), (hover: none)";

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
