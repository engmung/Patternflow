import type { Metadata } from "next";
import SetupClient from "./SetupClient";

// /setup — hand a panel a Wi-Fi network from a phone, over Bluetooth.
//
// The USB flasher already does this at first install (Improv-Serial). This
// is the same protocol over BLE, for the moment the panel moves house and no
// computer is around: a build that carries the `ble` feature advertises
// itself whenever it cannot join, and a phone with Chrome connects from here.

export const metadata: Metadata = {
  title: "Wi-Fi setup / Patternflow",
  description:
    "Connect a Patternflow panel to a new Wi-Fi network from your phone, over Bluetooth. No cable, no app.",
};

export default function SetupPage() {
  return <SetupClient />;
}
