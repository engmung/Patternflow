// Hotspot — the panel as a network of its own.
//
// A panel that cannot join a network, or is somewhere with none, raises an
// access point of its own ("patternflow-a1b2", WPA2), and the console is at
// http://192.168.4.1/ on it: the same pages, the same API, patterns installed
// from a phone that carries them, a Wi-Fi network added for the next place.
// Core, not a feature: Wi-Fi is the device's, and every image has this.
//
// Three modes, kept in NVS and set on /wifi: `off`; `auto` (the default —
// up while the station has had no link for PF_HOTSPOT_AUTO_AFTER_MS, down
// again once the station joins and nobody is on the hotspot); `always`.
//
// What the bench taught on 2026-09-22, each of which is a line below:
//  - The channel is chosen from a scan, never fixed. Hard-coding channel 1
//    put the beacon under three -33 dBm networks on channel 3 and the SSID
//    flickered or never showed; the least loaded of 1/6/11 is quiet.
//  - Every console service used to wait for WL_CONNECTED, so a phone joined,
//    got an address, and port 80 was never open. PatternflowWifi::linkUp()
//    is the condition now, and the hotspot raises the same link edge the
//    station does; every begin() behind it is idempotent.
//  - A station retry is a scan with the AP off the air, and the IDF's own
//    auto-reconnect re-issues one after every failure. Retries are the
//    tick's business while the hotspot is up: slow with nobody on it, none
//    with someone on it (PatternflowWifi::tick()).
//  - A phone treats a network without internet as suspect, and decides with
//    a DNS lookup and an HTTP probe. Left unanswered, the lookup times out
//    and the phone sits for twenty seconds before a browser on it does
//    anything. So the hotspot answers DNS - every name resolves to the
//    panel - and the probe fails at once with a plain 404: the verdict is
//    "no internet" within a second, which is the truth, and the phone
//    stays. Pretending to be the internet (a 204) was tried and put a
//    Samsung into its limited-connectivity state, which drops the network.
//
// License: MIT
#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <Preferences.h>
#include <esp_wifi.h>

#include "../net_config.h"
#include "core_wifi.h"
#include "core_http.h"

namespace PatternflowHotspot {

enum Mode : uint8_t { OFF = 0, AUTO = 1, ALWAYS = 2 };

inline Mode mode = AUTO;
inline char pass[65] = PF_HOTSPOT_PASS;
inline char ssidBuf[40] = {0};
inline bool up = false;
inline int channel = 0;
inline uint32_t startedAtMs = 0;
inline uint32_t staLastUpMs = 0;
inline uint32_t starts = 0;
inline uint32_t dnsAnswered = 0;
inline uint32_t dnsFailures = 0;
inline bool routesRegistered = false;

inline WiFiUDP dns;
inline bool dnsUp = false;
inline uint32_t dnsRetryAtMs = 0;
inline uint32_t reportAtMs = 0;
inline int reportedClients = -1;
// The last probe request heard: a phone scanning, which is a phone about
// to join. Station probes (core_wifi.h) keep away from that moment.
inline uint32_t lastProbeReqMs = 0;
inline uint32_t probeReqs = 0;
inline bool eventsHooked = false;

// Every association and probe request the AP sees, on the log with a
// stamp - the bench cannot see the radio any other way, and a field
// report with this line in it answers most questions.
inline void onWifiEvent(WiFiEvent_t e, WiFiEventInfo_t info) {
  switch (e) {
    case ARDUINO_EVENT_WIFI_AP_PROBEREQRECVED:
      lastProbeReqMs = millis();
      probeReqs++;
      break;
    case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
      Serial.printf("[HOTSPOT] client joined %02x:%02x:%02x:%02x:%02x:%02x (aid %d)\n",
                    info.wifi_ap_staconnected.mac[0], info.wifi_ap_staconnected.mac[1],
                    info.wifi_ap_staconnected.mac[2], info.wifi_ap_staconnected.mac[3],
                    info.wifi_ap_staconnected.mac[4], info.wifi_ap_staconnected.mac[5],
                    (int)info.wifi_ap_staconnected.aid);
      break;
    case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
      Serial.printf("[HOTSPOT] client left %02x:%02x:%02x:%02x:%02x:%02x\n",
                    info.wifi_ap_stadisconnected.mac[0], info.wifi_ap_stadisconnected.mac[1],
                    info.wifi_ap_stadisconnected.mac[2], info.wifi_ap_stadisconnected.mac[3],
                    info.wifi_ap_stadisconnected.mac[4], info.wifi_ap_stadisconnected.mac[5]);
      break;
    case ARDUINO_EVENT_WIFI_AP_STAIPASSIGNED:
      Serial.println("[HOTSPOT] client has an address");
      break;
    default: break;
  }
}


inline const char* modeName(Mode m) {
  return m == OFF ? "off" : m == ALWAYS ? "always" : "auto";
}

inline bool parseMode(const String& s, Mode* out) {
  if (s == "off") { *out = OFF; return true; }
  if (s == "auto") { *out = AUTO; return true; }
  if (s == "always") { *out = ALWAYS; return true; }
  return false;
}

// "patternflow-a1b2": the shared name plus the last two bytes of the station
// MAC - the same alias the NETWORK screen and the status page show.
inline const char* name() {
  if (ssidBuf[0] == 0) {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    snprintf(ssidBuf, sizeof(ssidBuf), "%s-%02x%02x", PF_OTA_HOSTNAME, mac[4], mac[5]);
  }
  return ssidBuf;
}

inline bool validPass(const String& p) {
  return p.length() >= 8 && p.length() <= 63;
}

inline void load() {
  Preferences p;
  if (!p.begin("pf_hotspot", /*readOnly=*/true)) return;
  uint8_t m = p.getUChar("mode", AUTO);
  mode = (m <= ALWAYS) ? (Mode)m : AUTO;
  String pw = p.getString("pass", PF_HOTSPOT_PASS);
  if (validPass(pw)) strlcpy(pass, pw.c_str(), sizeof(pass));
  p.end();
}

inline void save() {
  Preferences p;
  if (!p.begin("pf_hotspot", /*readOnly=*/false)) return;
  p.putUChar("mode", (uint8_t)mode);
  p.putString("pass", pass);
  p.end();
}

// ── Channel ─────────────────────────────────────────────────────────────
//
// The radio has one channel. With the station connected the AP shares its
// channel, so that is the answer. Alone, a scan says what is on the air here
// and the least loaded of 1/6/11 wins - every network within two channels of
// a candidate loads it, weighted by how loud it is. A scan costs ~1.5 s and
// some internal RAM, once, at the moment the hotspot comes up.
inline int pickChannel() {
  if (WiFi.status() == WL_CONNECTED) return WiFi.channel();
  // A scan fails (-2) while a station attempt is in flight, and the tick
  // may have issued one this very pass: abort it first, and try twice.
  WiFi.disconnect();
  delay(100);
  int n = WiFi.scanNetworks(false, true, false, 120);
  if (n < 0) { delay(400); n = WiFi.scanNetworks(false, true, false, 120); }
  if (n < 0) {
    Serial.println("[HOTSPOT] scan failed twice - channel 6");
    return 6;
  }
  const int cand[3] = {1, 6, 11};
  int load[3] = {0, 0, 0};
  for (int i = 0; i < n && i < 40; i++) {
    const int ch = WiFi.channel(i);
    int w = WiFi.RSSI(i) + 100;
    if (w < 1) w = 1;
    for (int k = 0; k < 3; k++) {
      if (ch >= cand[k] - 2 && ch <= cand[k] + 2) load[k] += w;
    }
  }
  WiFi.scanDelete();
  int best = 0;
  for (int k = 1; k < 3; k++) if (load[k] < load[best]) best = k;
  Serial.printf("[HOTSPOT] %d network(s) around, load ch1=%d ch6=%d ch11=%d\n",
                n, load[0], load[1], load[2]);
  return cand[best];
}

// ── Up and down ─────────────────────────────────────────────────────────
inline void start() {
  if (up) return;
  channel = pickChannel();
  WiFi.mode(WIFI_AP_STA);
  if (!WiFi.softAP(name(), pass, channel, /*hidden=*/0, PF_HOTSPOT_MAX_CLIENTS)) {
    Serial.println("[HOTSPOT] softAP() failed");
    WiFi.mode(WIFI_STA);
    return;
  }
  // 20 MHz: the narrower channel is the more robust one, and nothing here
  // needs the width. Set before anyone joins - changing it later restarts
  // the AP and drops every client.
  esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);
  up = true;
  starts++;
  esp_wifi_set_event_mask(0);  // probe requests are masked by default; hear them
  startedAtMs = millis();
  dnsUp = false;
  dnsRetryAtMs = startedAtMs + 1000;  // the AP netif needs a moment before a socket on it answers
  // The IDF would re-scan on every failed station attempt, taking the AP
  // off the air each time; PatternflowWifi::tick() paces retries instead.
  WiFi.setAutoReconnect(false);
  PatternflowWifi::hotspotUp = true;
  PatternflowWifi::hotspotClients = 0;
  PatternflowWifi::raiseLinkEdge();  // the console starts on this link too
  Serial.printf("[HOTSPOT] \"%s\" pass \"%s\" ch%d at %s (%s)\n", name(), pass, channel,
                WiFi.softAPIP().toString().c_str(), modeName(mode));
}

inline void stop() {
  if (!up) return;
  if (dnsUp) { dns.stop(); dnsUp = false; }
  PatternflowWifi::hotspotUp = false;  // before the mode change: stationOff() must not fire
  WiFi.softAPdisconnect(true);  // AP off, mode back to station-only
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  up = false;
  PatternflowWifi::hotspotUp = false;
  PatternflowWifi::hotspotClients = 0;
  Serial.println("[HOTSPOT] down");
}

inline void begin() {
  load();
  if (!eventsHooked) { WiFi.onEvent(onWifiEvent); eventsHooked = true; }
  staLastUpMs = millis();  // auto mode counts from boot
  Serial.printf("[HOTSPOT] mode %s, name \"%s\"\n", modeName(mode), name());
}

// ── The DNS responder ───────────────────────────────────────────────────
//
// Every A query from the hotspot's own subnet is answered with the panel's
// address; other types get an empty NOERROR so the client stops asking.
// Hand-built on WiFiUDP rather than the core's DNSServer, which stopped
// answering after minutes on core 2.x (the 2026-08 portal bench); a socket
// that fails to send is simply recreated.
inline bool fromHotspot(const IPAddress& from) {
  const uint32_t a = (uint32_t)from, b = (uint32_t)WiFi.softAPIP();
  return (a & 0x00FFFFFF) == (b & 0x00FFFFFF);
}

inline void dnsPump() {
  if (!up) return;
  const uint32_t now = millis();
  if (!dnsUp) {
    if ((int32_t)(now - dnsRetryAtMs) < 0) return;
    dnsUp = dns.begin(53);
    if (!dnsUp) { dnsRetryAtMs = now + 2000; return; }
    Serial.println("[HOTSPOT] dns responder up");
  }
  int len = dns.parsePacket();
  if (len <= 0) return;
  uint8_t q[512];
  int n = dns.read(q, sizeof(q));
  IPAddress from = dns.remoteIP();
  uint16_t port = dns.remotePort();
  while (dns.parsePacket() > 0) { /* drain anything queued behind it */ }
  if (n < 17 || !fromHotspot(from)) return;
  // The question: labels until a zero byte, then type and class.
  int i = 12;
  while (i < n && q[i] != 0) {
    const int l = q[i];
    if (l >= 0xC0 || i + l + 1 >= n) return;  // compressed or malformed: ignore
    i += l + 1;
  }
  if (i + 4 >= n) return;
  i++;
  const uint16_t qtype = (uint16_t)(q[i] << 8) | q[i + 1];
  const uint16_t qclass = (uint16_t)(q[i + 2] << 8) | q[i + 3];
  const int qend = i + 4;
  const bool answerA = (qtype == 1 && qclass == 1);
  uint8_t r[512 + 16];
  memcpy(r, q, qend);
  r[2] = 0x80 | (q[2] & 0x01);  // response; recursion desired copied
  r[3] = 0x80;                  // recursion available, no error
  r[4] = 0; r[5] = 1;           // one question
  r[6] = 0; r[7] = answerA ? 1 : 0;
  r[8] = r[9] = r[10] = r[11] = 0;
  int rlen = qend;
  if (answerA) {
    const IPAddress ip = WiFi.softAPIP();
    const uint8_t answer[16] = {0xC0, 0x0C, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3C,
                                0x00, 0x04, ip[0], ip[1], ip[2], ip[3]};
    memcpy(r + rlen, answer, sizeof(answer));
    rlen += sizeof(answer);
  }
  bool sent = dns.beginPacket(from, port) && dns.write(r, rlen) == (size_t)rlen && dns.endPacket();
  if (!sent) {
    dnsFailures++;
    dns.stop();
    dnsUp = false;
    dnsRetryAtMs = now + 500;
    return;
  }
  dnsAnswered++;
}

// ── Policy, on the network task ─────────────────────────────────────────
inline void tick() {
  const uint32_t now = millis();
  const bool sta = PatternflowWifi::isConnected();
  if (sta) staLastUpMs = now;
  if (up) PatternflowWifi::hotspotClients = WiFi.softAPgetStationNum();
  bool want = false;
  switch (mode) {
    case OFF: want = false; break;
    case ALWAYS: want = true; break;
    default:
      if (!sta) want = (uint32_t)(now - staLastUpMs) >= PF_HOTSPOT_AUTO_AFTER_MS;
      else want = up && PatternflowWifi::hotspotClients > 0;  // the station is back: keep it only for whoever is on it
      break;
  }
  if (want && !up) start();
  else if (!want && up) stop();
  // Alone, the radio is the hotspot's (PatternflowWifi::stationOff()): a
  // station interface that is merely present drags the AP to a crawl. But
  // only once the station has had its chance - `always` at boot used to
  // switch it off before its first attempt could finish, and the panel
  // never joined the network it had credentials for. A probe in flight
  // ends on its own schedule (core_wifi.h).
  if (up && !sta && !PatternflowWifi::staProbing &&
      (WiFi.getMode() & WIFI_MODE_STA) &&
      (uint32_t)(now - staLastUpMs) >= PF_HOTSPOT_AUTO_AFTER_MS) {
    PatternflowWifi::stationOff();
    Serial.println("[HOTSPOT] no station link - radio is the hotspot's");
  }
  if (up) {
    dnsPump();
    // One line when the client count changes, and one every five minutes
    // regardless, so a serial log of a show says who was on the hotspot.
    if (PatternflowWifi::hotspotClients != reportedClients || (int32_t)(now - reportAtMs) >= 0) {
      reportedClients = PatternflowWifi::hotspotClients;
      reportAtMs = now + 300000;
      Serial.printf("[HOTSPOT] ch%d clients=%d dns=%lu scans=%lu mode=%d heap=%u\n", channel,
                    PatternflowWifi::hotspotClients, (unsigned long)dnsAnswered,
                    (unsigned long)probeReqs, (int)WiFi.getMode(),
                    (unsigned)ESP.getFreeHeap());
    }
  }
}

inline void appendStatus(String& json);

// ── Settings routes ─────────────────────────────────────────────────────
// Registered on the console server like any core page, from the same edge.
// The phone's connectivity probe lands here too and gets the console's
// ordinary 404 - see the header for why that is the right answer.
inline void registerRoutes() {
  if (routesRegistered) return;
  if (!PatternflowWifi::linkUp()) return;
  PatternflowHttp::begin();  // idempotent; whoever is first starts it
  WebServer& s = PatternflowHttp::server();
  // Settings: GET the state, POST mode=off|auto|always and/or pass=... .
  s.on("/api/hotspot", HTTP_GET, []() {
    String json;
    json.reserve(256);
    json += "{\"ok\":true,";
    appendStatus(json);
    json += "\"pass\":\"";
    json += pass;
    json += "\"}";
    PatternflowHttp::server().sendHeader("Cache-Control", "no-store");
    PatternflowHttp::server().send(200, "application/json", json);
  });
  s.on("/api/hotspot", HTTP_POST, []() {
    WebServer& srv = PatternflowHttp::server();
    bool changed = false;
    if (srv.hasArg("mode")) {
      Mode m;
      if (!parseMode(srv.arg("mode"), &m)) {
        srv.send(400, "application/json", "{\"ok\":false,\"error\":\"mode is off, auto or always\"}");
        return;
      }
      if (m != mode) { mode = m; changed = true; }
    }
    if (srv.hasArg("pass")) {
      String pw = srv.arg("pass");
      if (!validPass(pw)) {
        srv.send(400, "application/json", "{\"ok\":false,\"error\":\"password is 8 to 63 characters\"}");
        return;
      }
      if (pw != pass) { strlcpy(pass, pw.c_str(), sizeof(pass)); changed = true; }
    }
    if (changed) {
      save();
      // A new password or a mode that says off takes effect now; the
      // policy tick brings it back up if the mode still wants it.
      if (up) stop();
    }
    String json;
    json.reserve(256);
    json += "{\"ok\":true,";
    appendStatus(json);
    json += "\"pass\":\"";
    json += pass;
    json += "\"}";
    srv.sendHeader("Cache-Control", "no-store");
    srv.send(200, "application/json", json);
  });
  routesRegistered = true;
}

// `"hotspot":{...},` for /api/status and /api/hotspot.
inline void appendStatus(String& json) {
  json += "\"hotspot\":{\"mode\":\"";
  json += modeName(mode);
  json += "\",\"up\":";
  json += up ? "true" : "false";
  json += ",\"ssid\":\"";
  json += name();
  json += "\",\"ip\":\"";
  json += up ? WiFi.softAPIP().toString() : String("");
  json += "\",\"channel\":";
  json += up ? channel : 0;
  json += ",\"clients\":";
  json += up ? PatternflowWifi::hotspotClients : 0;
  json += ",\"dns\":";
  json += dnsAnswered;
  json += "},";
}

}  // namespace PatternflowHotspot
