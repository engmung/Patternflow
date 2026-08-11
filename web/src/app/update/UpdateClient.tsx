"use client";

import { useEffect, useState } from "react";
import { useDeviceHost } from "@/lib/community/deviceHost";
import { captureEvent } from "@/lib/posthogEvents";
import styles from "./update.module.css";

// The page the device's console sends you to.
//
// A board says "v3.4.0 is out" and links here; this hands the newest release
// straight to it over Wi-Fi. Nothing is compiled and nobody signs in — the
// firmware already exists as a released image, and the whole job is pointing
// the board at it.
//
// The device never fetches over the internet. It cannot: a TLS handshake
// needs tens of KB of internal heap and the board has single digits spare.
// So the board's own /update page (served from the LAN, over plain HTTP)
// takes a `?src=` URL, and the BROWSER — which has both origins — downloads
// the .bin from here and POSTs it to the board. That is why the release
// images send CORS headers, and why this page is a link rather than a
// request to the device.
//
// USB stays as the fallback for a board that is not on the network, or one
// too old to have /update at all: the same flasher the first install uses.

type Manifest = {
  version?: string;
  builds?: { parts?: { path?: string; offset?: number }[] }[];
};

/** The app image is the part at 0x10000 — the only one an OTA slot takes. */
function appImagePath(manifest: Manifest): string | null {
  const parts = manifest.builds?.[0]?.parts ?? [];
  const app = parts.find((part) => part.offset === 65536);
  return app?.path ?? null;
}

export default function UpdateClient() {
  const { deviceHost, changeDeviceHost } = useDeviceHost();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/flash/manifest.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("manifest");
        return response.json();
      })
      .then((data: Manifest) => setManifest(data))
      .catch(() => setFailed(true));
  }, []);

  const version = manifest?.version?.replace(/^v/, "") ?? null;
  const imagePath = manifest ? appImagePath(manifest) : null;

  // Absolute, because the device's page is the one fetching it — from its own
  // origin on the LAN, where a relative path means the board itself.
  const imageUrl =
    imagePath && typeof window !== "undefined"
      ? new URL(`/flash/${imagePath}`, window.location.origin).toString()
      : null;

  const host = deviceHost.trim() || "patternflow.local";
  const wirelessUrl = imageUrl
    ? `http://${host}/update?src=${encodeURIComponent(imageUrl)}`
    : null;

  return (
    <main className={styles.wrap}>
      <p className={styles.kicker}>Firmware</p>
      <h1 className={styles.title}>
        Update over Wi-Fi.
      </h1>
      <p className={styles.lede}>
        Your patterns, your Wi-Fi networks and your storage are untouched — an update
        rewrites the program only.
      </p>

      {failed && (
        <p className={styles.bad}>
          Could not read the release manifest. Reload, or grab the image from the{" "}
          <a href="https://github.com/engmung/Patternflow/releases">releases page</a>.
        </p>
      )}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.kicker}>Latest release</span>
          <span className={styles.version}>{version ? `v${version}` : "…"}</span>
        </div>

        <label className={styles.hostRow}>
          <span>Your device&rsquo;s address</span>
          <input
            type="text"
            value={deviceHost}
            spellCheck={false}
            autoCapitalize="none"
            onChange={(event) => changeDeviceHost(event.target.value)}
            placeholder="patternflow.local"
          />
        </label>
        <p className={styles.hostNote}>
          Android cannot resolve <code>.local</code> — use the IP from the device&rsquo;s
          NETWORK screen (hold K2).
        </p>

        <a
          className={wirelessUrl ? styles.go : styles.goDisabled}
          href={wirelessUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            if (wirelessUrl) captureEvent("firmware_update_opened", { version });
          }}
        >
          Update this device &rarr;
        </a>
        <p className={styles.goNote}>
          Opens your device&rsquo;s own update page with this build linked. Press
          <b> Fetch &amp; flash</b> there — your browser downloads the image and hands it
          to the board. Keep the device powered; it reboots itself when it lands.
        </p>
      </section>

      <section className={styles.fallback}>
        <span className={styles.kicker}>If that does not work</span>
        <ul>
          <li>
            <b>Nothing opens?</b> The device and this computer have to be on the same
            Wi-Fi. Check the address above against the device&rsquo;s NETWORK screen.
          </li>
          <li>
            <b>No <code>/update</code> page on the device?</b> It predates wireless
            updating. Flash it once over USB and every update after that is wireless.
          </li>
          <li>
            <b>Prefer a file?</b>{" "}
            {imageUrl ? (
              <a href={imageUrl} download>
                Download the {version ? `v${version} ` : ""}image
              </a>
            ) : (
              "…"
            )}{" "}
            and drop it on <code>{host}/update</code> yourself.
          </li>
          <li>
            <b>USB:</b> the <a href="/pattern">browser flasher</a> writes a complete
            board from scratch — the same path as a first install.
          </li>
        </ul>
      </section>
    </main>
  );
}
