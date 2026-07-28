"use client";

// Where "Send over Wi-Fi" points, shared by every place that offers it.
//
// patternflow.local works on most platforms; Android cannot resolve .local, so
// the address is editable and remembered across visits and across the three
// modals that offer the handoff — telling us the board's IP once should be
// enough.
//
// The URLs handed to the device must be absolute even when the community API
// is same-origin, because it is the *device* that fetches them, from its own
// origin on the LAN.

import { useState } from "react";

import { communityApiUrl } from "./apiBase";

const KEY = "pf-device-host";
const FALLBACK = "patternflow.local";

export function useDeviceHost() {
  // Lazy init rather than an effect: these modals only ever mount client-side,
  // so localStorage is readable during the first render and there is no
  // server-rendered default to mismatch on hydration.
  const [deviceHost, setDeviceHost] = useState(() => {
    if (typeof window === "undefined") return FALLBACK;
    try {
      return window.localStorage.getItem(KEY) ?? FALLBACK;
    } catch {
      return FALLBACK; /* private mode */
    }
  });

  const changeDeviceHost = (value: string) => {
    setDeviceHost(value);
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      /* private mode */
    }
  };

  const absolute = (apiPath: string) =>
    new URL(communityApiUrl(apiPath), window.location.origin).toString();

  /** Device's pattern manager, told to fetch and install a module build. */
  const patternsUrl = (modulesUrl: string) => {
    if (typeof window === "undefined") return "#";
    return `http://${deviceHost.trim()}/patterns?src=${encodeURIComponent(absolute(modulesUrl))}`;
  };

  /** Device's update page, told to fetch and flash a firmware build. */
  const updateUrl = (buildId: string) => {
    if (typeof window === "undefined") return "#";
    const firmware = absolute(`/api/community/builds/${buildId}/firmware`);
    return `http://${deviceHost.trim()}/update?src=${encodeURIComponent(firmware)}`;
  };

  return { deviceHost, changeDeviceHost, patternsUrl, updateUrl };
}
