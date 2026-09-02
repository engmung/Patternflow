// ═══════════════════════════════════════════════════════════
// PatternFlow - the names a panel answers to on the LAN
//
// `patternflow.local` is the address everything points at - the console, the
// site's "send to my panel" links, the docs - and it fails for a real share
// of people, almost never because of the panel:
//
//   - Android does not resolve .local in the browser at all;
//   - Windows resolves it natively but gives up quietly behind a VPN, a
//     virtual adapter or some Wi-Fi drivers, and then caches the failure;
//   - routers with AP isolation or IGMP snooping drop the multicast;
//   - two panels on one network fight over one name.
//
// The panel cannot fix the client's resolver, so it answers to more names
// instead, and tells the site its address so the site stops needing a name:
//
//   1. NetBIOS. Windows resolves `patternflow` (no .local) over NetBIOS
//      without mDNS at all, so http://patternflow/ works where
//      http://patternflow.local/ does not. One UDP listener on port 137.
//   2. A per-panel mDNS alias, `patternflow-<4 hex of the MAC>.local`,
//      delegated beside the shared name. Two panels keep the shared name
//      between them and each has one of its own; the alias is what the
//      status API and the console show.
//   3. (In pf-console.js) every link from the console to patternflow.work
//      carries `?device=<ip>`, and the site remembers it - so a person who
//      opened the console once, by any route, never needs the name again.
//
// Re-announced on every Wi-Fi connect edge: the delegated alias carries an
// address, and the address can change with a new lease.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "config.h"
#include "core_wifi.h"

#ifdef PF_WIFI_NEEDED
#include <ESPmDNS.h>
#include <NetBIOS.h>
#include <mdns.h>
#endif

namespace PatternflowNames {

#ifdef PF_WIFI_NEEDED

inline char aliasBuf[24] = "";
inline bool netbiosUp = false;

// "patternflow-a1b2": the shared name plus the last two bytes of the STA MAC,
// which is what the panel shows on its NETWORK screen and status page.
inline const char* alias() {
  if (aliasBuf[0] == 0) {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    snprintf(aliasBuf, sizeof(aliasBuf), "%s-%02x%02x", PF_OTA_HOSTNAME, mac[4], mac[5]);
  }
  return aliasBuf;
}

// Call on every connect edge, after mDNS itself is up (ArduinoOTA or
// core_web_update starts it). Idempotent for NetBIOS; the alias is
// re-delegated each time so it always carries the current address.
inline void announce() {
  if (!PatternflowWifi::isConnected()) return;

  if (!netbiosUp) {
    netbiosUp = NBNS.begin(PF_OTA_HOSTNAME);
    Serial.printf("[NAMES] NetBIOS \"%s\" %s\n", PF_OTA_HOSTNAME, netbiosUp ? "up" : "FAILED");
  }

  mdns_ip_addr_t addr;
  memset(&addr, 0, sizeof(addr));
  addr.addr.type = ESP_IPADDR_TYPE_V4;
  addr.addr.u_addr.ip4.addr = (uint32_t)WiFi.localIP();
  addr.next = nullptr;
  mdns_delegate_hostname_remove(alias());   // harmless when absent
  esp_err_t rc = mdns_delegate_hostname_add(alias(), &addr);
  Serial.printf("[NAMES] mDNS %s.local + %s.local (%s)\n", PF_OTA_HOSTNAME, alias(),
                rc == ESP_OK ? "ok" : esp_err_to_name(rc));
}

#else

inline const char* alias() { return PF_OTA_HOSTNAME; }
inline void announce() {}

#endif

}  // namespace PatternflowNames
