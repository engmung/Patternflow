"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useDeviceHost } from "@/lib/community/deviceHost";
import shelf from "../editions/Editions.module.css";
import styles from "./Features.module.css";
import type { TryOut } from "./features-data";

// "Try it" on a feature that is not on the shelf: one button that installs a
// frozen image the way the shelf installs a live one. Same mechanism - the
// panel's own /update page takes a `?src=` URL and the browser does the fetch
// and the POST - so this is a plain link to the panel, and the address is the
// one the shelf and the deck panel already share.
//
// What is different is said, once, under the button: the image is the whole
// firmware as it was when it was built, core included, and nobody bumps it
// when the core moves. The way back is the shelf.

const SITE = "https://patternflow.work";

export default function TryInstall({ t }: { t: TryOut }) {
  const { deviceHost, changeDeviceHost } = useDeviceHost();
  // The panel's page fetches the image, so the URL has to be absolute. The
  // production origin is the server-side answer, so the first paint matches;
  // a preview or a dev server reads its own in on the client. A store that
  // never changes, read the way the device address is, rather than an effect
  // setting state after mount.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => SITE,
  );

  const host = deviceHost.trim() || "patternflow.local";
  const src = new URL(t.url, origin).toString();
  const href = `http://${host}/update?src=${encodeURIComponent(src)}`;

  return (
    <div className={styles.tryOut}>
      <p className={styles.tryHead}>Try it</p>
      <div className={shelf.actions}>
        <a className={shelf.install} href={href}>
          Install to try
        </a>
      </div>
      <p className={shelf.versions}>
        <span>
          <span className={shelf.vLabel}>image</span> {t.version}
        </span>
        <span>
          <span className={shelf.vLabel}>core</span> {t.core}
        </span>
        <span>
          <span className={shelf.vLabel}>built</span> {t.built}
        </span>
      </p>
      <label className={shelf.hostRow}>
        <span>your panel</span>
        <input
          type="text"
          value={deviceHost}
          spellCheck={false}
          autoCapitalize="none"
          onChange={(e) => changeDeviceHost(e.target.value)}
          placeholder="patternflow.local"
        />
      </label>
      <p className={shelf.note}>
        {t.note} A frozen image: the whole firmware as it was on the day it was
        built, core included, and it is not kept up with the core. Your
        patterns, Wi-Fi networks and settings stay; the way back is one click on{" "}
        <Link href="/editions">the shelf</Link>.
      </p>
    </div>
  );
}
