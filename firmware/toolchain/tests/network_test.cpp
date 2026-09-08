#include <algorithm>
#include <atomic>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <set>
#include <string>
#include <vector>
#ifdef _MSC_VER
#define __ATOMIC_ACQUIRE 0
#define __ATOMIC_RELEASE 0
#define __ATOMIC_ACQ_REL 0
template<class T> T __atomic_exchange_n(T* p, T v, int) { return std::atomic_ref<T>(*p).exchange(v); }
template<class T> void __atomic_store_n(T* p, T v, int) { std::atomic_ref<T>(*p).store(v); }
#endif
using String = std::string;
using std::min;
using std::max;
#define PF_WIFI_ENABLED 1
#define PF_WIFI_RETRY_INTERVAL_MS 5000
#define PF_WIFI_SSID "first"
#define PF_WIFI_PASS ""
#define PF_WIFI_TX_POWER 52
#define PF_OTA_HOSTNAME "patternflow"
#define PF_OTA_PASSWORD ""
#define PF_OTA_ENABLED 1
static uint32_t testMillis = 100;
static uint32_t millis() { return testMillis; }
struct Log { template<class... A> void printf(const char*, A...) {} void println(const char*) {} } Serial;
struct Preferences {
  bool begin(const char*, bool) { return true; }
  void putInt(const char*, int) {}
  void putString(const char*, const String&) {}
  int getInt(const char*, int fallback) { return fallback; }
  String getString(const char*, const char* fallback) { return fallback; }
  void end() {}
};
enum wl_status_t { WL_IDLE_STATUS, WL_CONNECTED, WL_NO_SSID_AVAIL, WL_CONNECT_FAILED, WL_DISCONNECTED };
constexpr int WIFI_STA = 1;
struct IPAddress {
  uint32_t value = 1;
  operator uint32_t() const { return value; }
  String toString() const { return "192.0.2.1"; }
};
struct Radio {
  wl_status_t state = WL_DISCONNECTED;
  IPAddress ip;
  std::vector<String> attempts;
  unsigned disconnectCalls = 0;
  wl_status_t status() const { return state; }
  IPAddress localIP() const { return ip; }
  void persistent(bool) {}
  void mode(int) {}
  void setHostname(const char*) {}
  void setSleep(bool) {}
  void setAutoReconnect(bool) {}
  void begin(const char* ssid, const char*) { attempts.emplace_back(ssid); state = WL_DISCONNECTED; }
  bool setTxPower(int) { return true; }
  int getTxPower() { return PF_WIFI_TX_POWER; }
  void disconnect() { ++disconnectCalls; state = WL_DISCONNECTED; }
  void reconnect() { disconnect(); }
  void macAddress(uint8_t* mac) { memset(mac, 0, 6); mac[4] = 0x12; mac[5] = 0x34; }
} WiFi;
using esp_err_t = int;
constexpr int ESP_OK = 0, ESP_FAIL = -1, ESP_IPADDR_TYPE_V4 = 0;
static const char* esp_err_to_name(int) { return "mock failure"; }
struct mdns_ip_addr_t {
  struct { int type; struct { struct { uint32_t addr; } ip4; } u_addr; } addr;
  mdns_ip_addr_t* next;
};
static std::set<String> services;
static bool failBegin = true, failService = false, failAlias = false;
static uint32_t aliasAddress = 0;
static unsigned aliasAdds = 0;
static unsigned beginCalls = 0;
static bool mdns_service_exists(const char* type, const char* proto, const char*) {
  return services.count(String(type) + proto) != 0;
}
static int mdns_service_add(const char*, const char* type, const char* proto, int, void*, int) {
  if (failService) return ESP_FAIL;
  services.insert(String(type) + proto); return ESP_OK;
}
static void mdns_delegate_hostname_remove(const char*) { aliasAddress = 0; }
static int mdns_delegate_hostname_add(const char*, mdns_ip_addr_t* ip) {
  ++aliasAdds;
  if (failAlias) return ESP_FAIL;
  aliasAddress = ip->addr.u_addr.ip4.addr; return ESP_OK;
}
struct Names {
  bool begin(const char*) { ++beginCalls; return !failBegin; }
  void enableArduino(int, bool) { services.insert("_arduino_tcp"); }
} MDNS;
struct Netbios { bool fail = true; bool begin(const char*) { return !fail; } } NBNS;

#include "core_wifi.h"
#include "core_names.h"
int main() {
  using namespace PatternflowWifi;
  begin(); assert(WiFi.attempts.back() == "first");
  savedCountValue = 2; savedSsids[0] = "first"; savedSsids[1] = "second";
  WiFi.state = WL_CONNECTED; tick(); assert(consumeJustConnected()); assert(!consumeJustConnected());
  // A brief drop gives IDF its full grace window and then retries the same
  // working SSID once. Only a continued outage advances to another SSID.
  testMillis = 20000; WiFi.state = WL_DISCONNECTED; tick();
  assert(disconnects == 1); assert(WiFi.attempts.size() == 1);
  testMillis += 4999; tick(); assert(WiFi.attempts.size() == 1);
  ++testMillis; tick(); assert(WiFi.attempts.back() == "first");
  testMillis += 5000; tick(); assert(WiFi.attempts.back() == "second");
  testMillis += 200; WiFi.state = WL_CONNECTED; tick();
  assert(consumeJustConnected()); assert(lastReconnectMs == 10200);
  assert(savedSsids[0] == "second" && savedSsids[1] == "first");
  assert(activeSsid == "second");
  WiFi.ip.value = 2; tick(); assert(consumeJustConnected());
  tick(); assert(!consumeJustConnected());
  // HTTP-requested reconnect waits for the reply, also across millis wrap.
  testMillis = 0xffffff00; requestReconnect();
  unsigned calls = WiFi.disconnectCalls;
  testMillis += 499; tick(); assert(WiFi.disconnectCalls == calls);
  ++testMillis; tick(); assert(WiFi.disconnectCalls == calls + 1);
  testMillis += 100; WiFi.state = WL_CONNECTED; tick(); assert(lastReconnectMs == 100);

  namespace N = PatternflowNames;
  N::begin(); assert(!N::mdnsUp); N::tick(); assert(!N::ready);
  unsigned tries = beginCalls;
  testMillis += 4999; N::tick(); assert(beginCalls == tries);
  failBegin = false; failService = true;
  ++testMillis; N::tick(); assert(N::mdnsUp && !N::ready);
  // Partial failure does not destroy another owner's registered record.
  services.insert("_feature_udp"); failService = false;
  testMillis += 5000; N::tick(); assert(!N::ready); // NBNS failure
  unsigned aliases = aliasAdds;
  testMillis += 5000; N::tick(); assert(!N::ready);
  assert(aliasAdds == aliases && aliasAddress == 2);
  WiFi.ip.value = 3;
  NBNS.fail = false; failAlias = true;
  testMillis += 5000; N::tick(); assert(!N::ready);
  failAlias = false; testMillis += 5000; N::tick(); assert(N::ready);
  assert(services.count("_feature_udp")); assert(services.count("_http_tcp"));
  assert(services.count("_arduino_tcp")); assert(aliasAddress == 3);
  tries = beginCalls;
  WiFi.state = WL_DISCONNECTED; N::tick(); assert(!N::ready);
  WiFi.ip.value = 4; WiFi.state = WL_CONNECTED; N::announce(); N::tick();
  assert(N::ready && aliasAddress == 4); assert(beginCalls == tries);
  unsigned announces = N::announcements;
  N::announce(); N::tick(); assert(N::announcements == announces);
  assert(services.count("_feature_udp"));
  puts("network: retry grace, SSID rotation, DHCP edge, timer wrap, mDNS partial failure and recovery passed");
}
