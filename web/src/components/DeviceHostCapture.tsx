"use client";

import { useEffect } from "react";

// The panel tells the site where it is.
//
// Every link from a panel's console to this site carries `?device=<ip>`
// (firmware: src/core_names.h and the click handler in pf-console.js). This
// takes that address, remembers it where the "Send over Wi-Fi" buttons
// already look (the same key useDeviceHost reads), and removes it from the
// URL. From then on the buttons point at the address and not at
// patternflow.local - which is the one name an Android phone cannot resolve,
// and the reason a share of people could not send patterns to their panel.
//
// It also carries the address across our own origins (patternflow.work and
// community.patternflow.work keep separate storage): a click on a link to
// the other host gets the same parameter appended, so the handoff survives.

const KEY = "pf-device-host";
const OK = /^[a-z0-9.-]{1,64}$/i;

// Module scope on purpose: this runs while the client bundle loads, before
// any page component initialises its own copy of the stored host.
if (typeof window !== "undefined") {
  try {
    const u = new URL(window.location.href);
    const d = u.searchParams.get("device");
    if (d && OK.test(d)) window.localStorage.setItem(KEY, d);
  } catch {
    /* private mode, or a URL the browser will not let us touch */
  }
}

export default function DeviceHostCapture() {
  useEffect(() => {
    // Strip the parameter after hydration - Next's router restores the URL it
    // rendered with if this runs earlier.
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("device")) {
        u.searchParams.delete("device");
        window.history.replaceState(window.history.state, "", u.toString());
      }
    } catch {
      /* leave the URL alone */
    }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      let host: string | null = null;
      try {
        host = window.localStorage.getItem(KEY);
      } catch {
        return;
      }
      if (!host || !OK.test(host)) return;
      try {
        const t = new URL(a.href, window.location.href);
        if (t.origin === window.location.origin) return;
        if (!/(^|\.)patternflow\.work$/.test(t.hostname)) return;
        if (t.searchParams.has("device")) return;
        t.searchParams.set("device", host);
        a.href = t.toString();
      } catch {
        /* not a URL we can rewrite */
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
