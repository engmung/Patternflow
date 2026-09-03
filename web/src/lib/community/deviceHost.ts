"use client";

// Where "Send over Wi-Fi" points, shared by every place that offers it.
//
// patternflow.local works on most platforms; Android cannot resolve .local, so
// the address is editable and remembered across visits and across every
// surface that offers the handoff — telling us the board's IP once should be
// enough. DeviceHostCapture writes the same key when a panel's console links
// here with ?device=<ip>.
//
// The URLs handed to the device must be absolute even when the community API
// is same-origin, because it is the *device* that fetches them, from its own
// origin on the LAN.
//
// Read through useSyncExternalStore with a server snapshot, not a lazy
// useState: the edition shelf, /update and the deck panel all server-render,
// and a first client render that already knew the saved address disagreed
// with the HTML — a hydration mismatch on every visit to /editions. The
// server snapshot is the fallback name, so the first paint matches, and the
// saved address arrives on the very next render.

import { useSyncExternalStore } from "react";

import { communityApiUrl } from "./apiBase";

const KEY = "pf-device-host";
const FALLBACK = "patternflow.local";
const CHANGE_EVENT = "pf-device-host-change";

function readStored(): string {
  try {
    return window.localStorage.getItem(KEY) ?? FALLBACK;
  } catch {
    return FALLBACK; /* private mode */
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useDeviceHost() {
  const deviceHost = useSyncExternalStore(subscribe, readStored, () => FALLBACK);

  const changeDeviceHost = (value: string) => {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
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
