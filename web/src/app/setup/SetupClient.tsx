"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./setup.module.css";

// Improv Wi-Fi's own launch button (the `improv-wifi-sdk` package, bundled
// here: their CDN copy is an ES module served without CORS headers, so a
// cross-origin <script type=module> is refused). It owns the whole Web
// Bluetooth flow — device chooser, network entry, the result — and tells us
// where it is through `state-changed`, which is all this page needs to
// narrate what is happening. The firmware side is features/ble/ in the repo;
// the protocol is https://www.improv-wifi.com/ble/.
type LaunchButtonProps = { children?: React.ReactNode };
const ImprovLaunchButton = "improv-wifi-launch-button" as unknown as React.ElementType<LaunchButtonProps>;

type ImprovState =
  | "IDLE"
  | "CONNECTING"
  | "AUTHORIZATION_REQUIRED"
  | "AUTHORIZED"
  | "PROVISIONING"
  | "PROVISIONED"
  | "ERROR"
  | "UNKNOWN";

const NARRATION: Record<ImprovState, string> = {
  IDLE: "",
  CONNECTING: "Connecting to the panel…",
  AUTHORIZATION_REQUIRED: "Touch the panel — turn any knob or press any button — to allow setup.",
  AUTHORIZED: "Allowed. Enter the network name and password.",
  PROVISIONING: "The panel is joining the network…",
  PROVISIONED: "Joined. The panel's console address is in the dialog — open it on the same Wi-Fi.",
  ERROR: "That did not work. Check the password, or that the network is 2.4 GHz.",
  UNKNOWN: "",
};

export default function SetupClient() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ImprovState>("IDLE");
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // Web Bluetooth: Chrome and Edge on Android, Windows, macOS, Linux.
    // Not Safari, and nothing on iOS.
    setSupported(typeof navigator !== "undefined" && "bluetooth" in navigator);
    // Registers <improv-wifi-launch-button>. Client-only: it touches window.
    import("improv-wifi-sdk").catch(() => setSupported(false));
    const host = hostRef.current;
    if (!host) return;
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: ImprovState }>).detail;
      if (detail?.state) setState(detail.state);
    };
    host.addEventListener("state-changed", onState);
    return () => host.removeEventListener("state-changed", onState);
  }, []);

  return (
    <main className={styles.wrap}>
      <p className={styles.kicker}>Setup</p>
      <h1 className={styles.title}>Give your panel a new Wi-Fi network</h1>
      <p className={styles.lede}>
        From a phone, over Bluetooth. No cable, no app — the panel is
        listening whenever it cannot reach a network it knows.
      </p>

      <section className={styles.card}>
        <ol className={styles.steps}>
          <li>
            <b>Power the panel</b> where the new network is. If it cannot join
            a remembered network within about a minute, it starts advertising
            as <code>Patternflow-XXXX</code>. (A panel with no network saved
            advertises right away.)
          </li>
          <li>
            <b>Open this page in Chrome</b> on an Android phone or a laptop
            with Bluetooth, and press the button.
          </li>
          <li>
            <b>Touch the panel when asked</b> — any knob, any button. That is
            the panel agreeing to take a network from you.
          </li>
          <li>
            <b>Type the network and password.</b> The panel joins, hands back
            its console address, and switches Bluetooth off again.
          </li>
        </ol>

        <div ref={hostRef} className={styles.launch}>
          {supported === false ? (
            <p className={styles.bad}>
              This browser has no Web Bluetooth. Use <b>Chrome on Android</b>,
              or Chrome/Edge on a computer with Bluetooth. iPhones cannot do
              this — use the <a href="/#flash">USB flasher</a>, which also sets Wi-Fi.
            </p>
          ) : (
            <ImprovLaunchButton>
              <button slot="activate" className={styles.go}>
                Connect a panel
              </button>
              <span slot="unsupported" className={styles.bad}>
                This browser has no Web Bluetooth. Use Chrome on Android.
              </span>
              <span slot="not-allowed" className={styles.bad}>
                Bluetooth needs a secure page — open this over https.
              </span>
            </ImprovLaunchButton>
          )}
          {NARRATION[state] && <p className={styles.state}>{NARRATION[state]}</p>}
        </div>
      </section>

      <section className={styles.fallback}>
        <p>
          <b>Which firmware does this?</b> The Bluetooth setup radio ships in
          the <a href="/variants#audio">Audio edition</a>. The default firmware
          sets Wi-Fi over USB at flash time instead — plug the panel into a
          computer and use the <a href="/#flash">flasher</a>; it offers a
          Wi-Fi step without reflashing.
        </p>
        <p>
          <b>Already on a network?</b> The panel's own console has a Wi-Fi
          page: <code>http://patternflow.local/wifi</code>. Up to five
          networks are remembered.
        </p>
      </section>
    </main>
  );
}
