// ═══════════════════════════════════════════════════════════
// PatternFlow - MQTT sidechannel (knobs + pattern name over a broker)
//
// The same shape as core_osc.h, pointed at brokers instead of DAWs. Where
// OSC talks to Ableton over UDP in device-local terms (indices, deltas),
// this publishes plain retained values on plain topics, so the other end
// can be a second panel, Home Assistant, or a shell one-liner:
//
//   <prefix>/knob/1..4   absolute click count, retained
//   <prefix>/pattern     display name, retained
//
// Retained is the point. A Subscriber that joins late still gets the
// current state — hence "turn on the second panel and it catches up"
// rather than "wait for the first knob to move".
//
// Roles, chosen on /mqtt and kept in NVS:
//   Off         socket closed, nothing published
//   Publisher   sends knob clicks + pattern name as they change
//   Subscriber  applies the retained snapshot, then follows live changes
//
// Inbound values are absolute, but patterns only understand deltas, so
// applyRemoteKnob() differences against the previous value and queues the
// result. consumeKnobDelta() then reads exactly like the OSC one, which is
// why the sketch merges both with adjacent lines.
//
// Compiled in by default, but inert until a role is picked AND a broker
// host is configured — see the MQTT block in net_config.h.
//
// Include AFTER pattern_registry.h: name lookup walks patterns[], the same
// arrangement core_patterns_http.h uses.
//
// Originally written by Simone Majocchi (@SimonePDA) for his Patternflow
// fork and contributed upstream. Adapted here to this tree's pattern
// registry and given a non-blocking connect path; the protocol design,
// the role model, and the topic layout are his.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "config.h"
#include "core_encoders.h"

#if PF_MQTT_ENABLED
#include <WiFi.h>
#include <Preferences.h>
#include "pubsubclient/PubSubClient.h"
#endif

namespace PatternflowMqtt {

enum Role : uint8_t {
  ROLE_OFF = 0,
  ROLE_PUBLISHER = 1,
  ROLE_SUBSCRIBER = 2
};

#if PF_MQTT_ENABLED

// Long enough for any preset name or module slug; nothing in the registry
// is allowed to be longer on the wire.
constexpr size_t NAME_BYTES = 48;

// Everything below exists because this runs in the single loop that also
// renders the panel and answers the web console. A broker that stops
// answering must cost that loop a bounded, occasional pause — never a
// multi-second stall every few seconds, which reads from outside as "the
// device is up (it pings, it accepts TCP) but the console is dead".
//
// Three things could block, and all three are now capped:
//   DNS       resolved once and cached, not on every attempt
//   TCP       setConnectionTimeout below
//   handshake setSocketTimeout below
constexpr uint32_t CONNECT_TIMEOUT_MS = 1500;
constexpr uint32_t SOCKET_TIMEOUT_S = 1;
// Retry pacing. A broker that is simply gone should be retried rarely.
constexpr uint32_t RECONNECT_MIN_MS = 5000;
constexpr uint32_t RECONNECT_MID_MS = 15000;
constexpr uint32_t RECONNECT_MAX_MS = 60000;
// After this many consecutive failures the cached address is dropped, in
// case the broker moved rather than went away.
constexpr uint8_t RERESOLVE_AFTER = 4;

inline WiFiClient net;
inline PubSubClient client(net);
inline bool started = false;
inline Role role = ROLE_OFF;
inline uint32_t lastReconnectMs = 0;
inline char clientId[20] = {};
inline char lastError[80] = {};
inline char lastPattern[NAME_BYTES] = {};
inline char publishedPattern[NAME_BYTES] = {};
inline long lastKnobs[4] = {0, 0, 0, 0};
inline bool haveKnob[4] = {false, false, false, false};
inline long lastRemoteKnob[4] = {0, 0, 0, 0};
inline int32_t pendingKnobDelta[4] = {0, 0, 0, 0};
inline int pendingPatternIdx = -1;
inline IPAddress brokerIp;
inline bool brokerResolved = false;
inline uint8_t failures = 0;

// ── Broker settings, entered on /mqtt and kept in NVS ────────────────────
//
// Typed in rather than compiled in, for the same reason Wi-Fi is: a broker
// is per-owner, and the alternative is either everybody sharing one set of
// credentials in the public source or nobody having a broker at all. The
// PF_MQTT_* macros remain as build-time defaults for people who do want to
// bake their own in; anything saved here wins over them.
//
// Sizes are deliberate — this is internal DRAM, which is the scarce thing on
// this board (see the measurements in net_config.h). 176 bytes total.
constexpr size_t HOST_BYTES = 64;
constexpr size_t USER_BYTES = 32;
constexpr size_t PASS_BYTES = 48;
constexpr size_t PREFIX_BYTES = 32;

inline char cfgHost[HOST_BYTES] = PF_MQTT_HOST;
inline char cfgUser[USER_BYTES] = PF_MQTT_USER;
inline char cfgPass[PASS_BYTES] = PF_MQTT_PASS;
inline char cfgPrefix[PREFIX_BYTES] = PF_MQTT_PREFIX;
inline uint16_t cfgPort = PF_MQTT_PORT;

// ── Message banner (@SimonePDA) ──────────────────────────────────────────
//
// Anything published to <prefix>/message is drawn over the running pattern
// for a few seconds. Receive-only: a panel never publishes here, so the
// sender is Home Assistant, a script, or somebody with MQTT Explorer open.
//
// Deliberately a broadcast — every panel on the prefix shows it. There is no
// per-device topic on purpose: addressing one panel would need a wildcard in
// the broker's ACL, and a fixed topic list is what keeps a shared broker
// from becoming somewhere anyone can invent topics.
//
// Shown per receipt rather than held. A retained payload — which is how you
// would leave a note for a panel that is currently off — otherwise comes
// back on every reconnect and every reboot, and a banner you cannot clear by
// power-cycling is a fault, not a feature.
constexpr size_t MESSAGE_BYTES = 80;
inline char overlayText[MESSAGE_BYTES] = {};
inline uint32_t overlayUntilMs = 0;

inline bool hasBroker() { return cfgHost[0] != '\0'; }

// Back off as failures pile up: a broker that is down stays down, and each
// attempt costs the loop up to CONNECT_TIMEOUT_MS.
inline uint32_t reconnectDelayMs() {
  if (failures == 0) return RECONNECT_MIN_MS;
  if (failures < RERESOLVE_AFTER) return RECONNECT_MID_MS;
  return RECONNECT_MAX_MS;
}

inline void setError(const char* message) {
  snprintf(lastError, sizeof(lastError), "%s", message ? message : "");
}

inline const char* roleName(Role r) {
  switch (r) {
    case ROLE_PUBLISHER: return "publisher";
    case ROLE_SUBSCRIBER: return "subscriber";
    default: return "off";
  }
}

inline const char* stateText() {
  if (!hasBroker()) return "no broker configured";
  if (role == ROLE_OFF) return "off";
  if (WiFi.status() != WL_CONNECTED) return "wifi down";
  if (client.connected()) return "connected";
  switch (client.state()) {
    case MQTT_CONNECTION_TIMEOUT: return "timeout";
    case MQTT_CONNECTION_LOST: return "lost";
    case MQTT_CONNECT_FAILED: return "connect failed";
    case MQTT_DISCONNECTED: return "disconnected";
    case MQTT_CONNECT_BAD_PROTOCOL: return "bad protocol";
    case MQTT_CONNECT_BAD_CLIENT_ID: return "bad client id";
    case MQTT_CONNECT_UNAVAILABLE: return "broker unavailable";
    case MQTT_CONNECT_BAD_CREDENTIALS: return "bad credentials";
    case MQTT_CONNECT_UNAUTHORIZED: return "unauthorized";
    default: return "connecting";
  }
}

inline void topicKnob(char* buf, size_t n, int index) {
  snprintf(buf, n, "%s/knob/%d", cfgPrefix, index + 1);
}

inline void topicPattern(char* buf, size_t n) {
  snprintf(buf, n, "%s/pattern", cfgPrefix);
}

inline void topicMessage(char* buf, size_t n) {
  snprintf(buf, n, "%s/message", cfgPrefix);
}

inline bool topicIsMessage(const char* topic) {
  char expected[48];
  topicMessage(expected, sizeof(expected));
  return topic && strcmp(topic, expected) == 0;
}

inline bool topicIsPattern(const char* topic) {
  char expected[48];
  topicPattern(expected, sizeof(expected));
  return topic && strcmp(topic, expected) == 0;
}

inline int topicKnobIndex(const char* topic) {
  if (!topic) return -1;
  const char* slash = strrchr(topic, '/');
  if (!slash || !slash[1]) return -1;
  int n = atoi(slash + 1);
  if (n < 1 || n > 4) return -1;
  char expected[48];
  topicKnob(expected, sizeof(expected), n - 1);
  return strcmp(topic, expected) == 0 ? (n - 1) : -1;
}

// "/patterns/cell_ripple.pfm" → "cell_ripple". Empty for a preset, whose
// modulePath is null because its code lives in firmware.bin.
inline void slugFromModulePath(const char* path, char* out, size_t n) {
  if (!path || !path[0]) { out[0] = '\0'; return; }
  const char* filename = strrchr(path, '/');
  snprintf(out, n, "%s", filename ? filename + 1 : path);
  char* extension = strrchr(out, '.');
  if (extension) *extension = '\0';
}

// Display name first (that is what we publish), then a case-insensitive
// pass, then the on-disk slug — so both "Cell Ripple" and "cell_ripple"
// select the same pattern from a shell or an automation rule.
inline int findPatternByName(const char* name) {
  if (!name || !name[0] || !patterns) return -1;
  for (int i = 0; i < NUM_PATTERNS; ++i) {
    if (patterns[i].name && strcmp(patterns[i].name, name) == 0) return i;
  }
  for (int i = 0; i < NUM_PATTERNS; ++i) {
    if (patterns[i].name && strcasecmp(patterns[i].name, name) == 0) return i;
  }
  char slug[NAME_BYTES];
  for (int i = 0; i < NUM_PATTERNS; ++i) {
    slugFromModulePath(patterns[i].modulePath, slug, sizeof(slug));
    if (slug[0] && strcasecmp(slug, name) == 0) return i;
  }
  return -1;
}

// Remote knobs arrive as absolute counts; patterns consume deltas.
//
// The first value after (re)subscribing is the retained snapshot, and
// catching up to it means closing the gap against OUR knob, not adding the
// publisher's number to ours: a panel sitting at 100 receiving a retained
// 417 has to move +317. (Taking the remote value as the delta only looks
// right from a fresh boot, where the local count happens to be 0.)
// Afterwards it is ordinary differencing between successive remotes.
inline void applyRemoteKnob(int index, long remote) {
  if (index < 0 || index > 3) return;
  int32_t delta;
  if (!haveKnob[index]) {
    haveKnob[index] = true;
    delta = (int32_t)(remote - lastKnobs[index]);
  } else {
    delta = (int32_t)(remote - lastRemoteKnob[index]);
  }
  lastRemoteKnob[index] = remote;
  if (delta) pendingKnobDelta[index] += delta;
}

inline void applyRemotePattern(const char* name) {
  int index = findPatternByName(name);
  if (index >= 0) pendingPatternIdx = index;
}

/**
 * Show a banner, or clear it.
 *
 * An empty payload clears — which is also how you retract a retained one, so
 * "publish empty with retain" both wipes the topic and takes the banner off
 * every panel watching it.
 */
inline void applyRemoteMessage(const char* text) {
  if (!text || !text[0]) {
    overlayText[0] = '\0';
    overlayUntilMs = 0;
    return;
  }
  snprintf(overlayText, sizeof(overlayText), "%s", text);
  overlayUntilMs = millis() + PF_MQTT_MESSAGE_DURATION_MS;
}

inline bool overlayActive() {
  if (!overlayText[0]) return false;
  // millis() wraps after ~49 days; the subtraction is what makes that safe.
  if ((int32_t)(millis() - overlayUntilMs) >= 0) {
    overlayText[0] = '\0';
    return false;
  }
  return true;
}

inline const char* overlayMessage() { return overlayText; }

/** Milliseconds left on the banner, for the console. */
inline uint32_t overlayRemainingMs() {
  if (!overlayActive()) return 0;
  return overlayUntilMs - millis();
}

inline void onMessage(char* topic, uint8_t* payload, unsigned int length) {
  char body[96];
  unsigned int n = length < sizeof(body) - 1 ? length : sizeof(body) - 1;
  memcpy(body, payload, n);
  body[n] = '\0';
  while (n && (body[n - 1] == '\n' || body[n - 1] == '\r' || body[n - 1] == ' ')) {
    body[--n] = '\0';
  }

  // Before the subscriber gate on purpose: a banner is worth having on a
  // one-panel setup, where the panel is the publisher and Home Assistant is
  // the only thing talking back. Mirroring knobs is the part that only makes
  // sense as a subscriber.
  if (topicIsMessage(topic)) {
    applyRemoteMessage(body);
    return;
  }

  if (role != ROLE_SUBSCRIBER) return;

  if (topicIsPattern(topic)) {
    applyRemotePattern(body);
    return;
  }
  int knob = topicKnobIndex(topic);
  if (knob >= 0) applyRemoteKnob(knob, atol(body));
}

inline void publishKnob(int index, long clicks) {
  char topic[48];
  char payload[16];
  topicKnob(topic, sizeof(topic), index);
  snprintf(payload, sizeof(payload), "%ld", clicks);
  client.publish(topic, payload, true);
}

inline void publishPatternName(const char* name) {
  char topic[48];
  topicPattern(topic, sizeof(topic));
  client.publish(topic, name ? name : "", true);
}

inline void publishSnapshot() {
  if (!client.connected() || role != ROLE_PUBLISHER) return;
  for (int i = 0; i < 4; ++i) publishKnob(i, lastKnobs[i]);
  if (lastPattern[0]) {
    publishPatternName(lastPattern);
    snprintf(publishedPattern, sizeof(publishedPattern), "%s", lastPattern);
  }
}

inline void ensureClientId() {
  if (clientId[0]) return;
  uint64_t mac = ESP.getEfuseMac();
  snprintf(clientId, sizeof(clientId), "pf%06X",
           (unsigned)((mac >> 24) & 0xFFFFFF));
}

// Each knob topic by name, rather than one `knob/+` subscription.
//
// A wildcard needs the broker to grant the wildcard. An ACL written as the
// exact list of topics a device may touch — which is how you would lock down
// a broker shared with strangers, and how @SimonePDA's is configured —
// refuses `patternflow/knob/+` outright, and the failure is silent: the
// device connects, reports "connected", and simply never receives a knob.
// Four subscriptions cost four small packets once per connect.
inline void subscribeMessage() {
  char topic[48];
  topicMessage(topic, sizeof(topic));
  client.subscribe(topic);
}

inline void subscribeAll() {
  char topic[48];
  for (int i = 0; i < 4; ++i) {
    topicKnob(topic, sizeof(topic), i);
    client.subscribe(topic);
  }
  topicPattern(topic, sizeof(topic));
  client.subscribe(topic);
  subscribeMessage();
}

// A literal address costs nothing to "resolve"; a hostname costs a blocking
// DNS query, and PubSubClient would pay it again on every connect attempt.
// Do it once and hand it the address.
inline bool resolveBroker() {
  if (brokerResolved) return true;
  if (brokerIp.fromString(cfgHost)) {
    brokerResolved = true;
    return true;
  }
  if (WiFi.hostByName(cfgHost, brokerIp) == 1) {
    brokerResolved = true;
    Serial.printf("[MQTT] %s resolved to %s\n",
                  cfgHost, brokerIp.toString().c_str());
    return true;
  }
  setError("cannot resolve broker");
  return false;
}

inline void applyClientSettings() {
  net.setConnectionTimeout(CONNECT_TIMEOUT_MS);
  client.setCallback(onMessage);
  client.setBufferSize(256);
  client.setKeepAlive(15);
  client.setSocketTimeout(SOCKET_TIMEOUT_S);
}

inline bool tryConnect() {
  if (!hasBroker()) {
    setError("no broker configured");
    return false;
  }
  if (WiFi.status() != WL_CONNECTED) {
    setError("wifi down");
    return false;
  }
  ensureClientId();
  applyClientSettings();
  if (!resolveBroker()) {
    if (++failures == 0) failures = RERESOLVE_AFTER;  // never wrap to "healthy"
    return false;
  }
  client.setServer(brokerIp, cfgPort);

  bool ok;
  if (cfgUser[0] != '\0') {
    ok = client.connect(clientId, cfgUser, cfgPass);
  } else {
    ok = client.connect(clientId);
  }
  if (!ok) {
    if (++failures == 0) failures = RERESOLVE_AFTER;
    // Enough refusals in a row and the address itself is suspect — drop it so
    // the next attempt looks the name up again.
    if (failures >= RERESOLVE_AFTER) brokerResolved = false;
    snprintf(lastError, sizeof(lastError), "connect state %d", client.state());
    Serial.printf("[MQTT] connect failed (%s), retry in %lus\n",
                  stateText(), (unsigned long)(reconnectDelayMs() / 1000));
    return false;
  }

  failures = 0;
  setError("");
  Serial.printf("[MQTT] connected as %s (%s) to %s:%d\n",
                clientId, roleName(role), cfgHost, cfgPort);
  if (role == ROLE_SUBSCRIBER) {
    // Forget remote baselines: the retained snapshot about to arrive is
    // what we resync against.
    for (int i = 0; i < 4; ++i) haveKnob[i] = false;
    subscribeAll();
  } else if (role == ROLE_PUBLISHER) {
    publishSnapshot();
    // A publisher subscribes to exactly one thing: banners. It mirrors
    // nobody's knobs, but there is no reason it should not be able to be
    // told something.
    subscribeMessage();
  }
  return true;
}

inline void setRole(Role next) {
  if (next > ROLE_SUBSCRIBER) next = ROLE_OFF;
  if (role == next) return;
  role = next;
  for (int i = 0; i < 4; ++i) {
    haveKnob[i] = false;
    pendingKnobDelta[i] = 0;
  }
  pendingPatternIdx = -1;
  publishedPattern[0] = '\0';
  if (client.connected()) client.disconnect();
  // Picking a role on /mqtt is a deliberate "try now": clear the backoff so
  // the user is not left waiting out a minute earned by an earlier outage.
  failures = 0;
  lastReconnectMs = 0;
  Serial.printf("[MQTT] role → %s\n", roleName(role));
}

inline Role currentRole() { return role; }
inline bool isCompiledIn() { return true; }
inline bool isConnected() { return client.connected(); }
inline const char* error() { return lastError; }
inline const char* host() { return cfgHost; }
inline uint16_t port() { return cfgPort; }
inline const char* user() { return cfgUser; }
inline const char* prefix() { return cfgPrefix; }
/** Whether a password is set — the value itself never leaves the device. */
inline bool hasPassword() { return cfgPass[0] != '\0'; }
inline const char* lastPatternName() { return lastPattern; }

// ── Settings persistence ─────────────────────────────────────────────────

inline void copyField(char* dest, size_t size, const char* src) {
  if (!src) src = "";
  strncpy(dest, src, size - 1);
  dest[size - 1] = '\0';
}

/**
 * Load saved settings over the compiled-in defaults.
 *
 * Each key is read only if it exists, so a device that has saved a host but
 * never touched the prefix keeps the built-in prefix rather than being handed
 * an empty string.
 */
inline void loadConfig() {
  Preferences prefs;
  if (!prefs.begin("patternflow", true)) return;
  if (prefs.isKey("mq_host")) prefs.getString("mq_host", cfgHost, sizeof(cfgHost));
  if (prefs.isKey("mq_user")) prefs.getString("mq_user", cfgUser, sizeof(cfgUser));
  if (prefs.isKey("mq_pass")) prefs.getString("mq_pass", cfgPass, sizeof(cfgPass));
  if (prefs.isKey("mq_prefix")) prefs.getString("mq_prefix", cfgPrefix, sizeof(cfgPrefix));
  if (prefs.isKey("mq_port")) cfgPort = prefs.getUShort("mq_port", cfgPort);
  prefs.end();
}

/** Drop the connection so the next attempt uses the new settings. */
inline void applyConfigChange() {
  brokerResolved = false;
  failures = 0;
  lastReconnectMs = 0;
  lastError[0] = '\0';
  for (int i = 0; i < 4; ++i) haveKnob[i] = false;
  if (client.connected()) client.disconnect();
}

/**
 * Save what was entered on /mqtt.
 *
 * A null password means "leave it alone", which is what lets the page show a
 * form without ever having been sent the current one — the field arrives
 * empty and an empty field must not wipe a working login. Clearing is a
 * separate, explicit act (see the clear route).
 */
inline void saveConfig(const char* newHost, uint16_t newPort, const char* newUser,
                       const char* newPass, const char* newPrefix) {
  copyField(cfgHost, sizeof(cfgHost), newHost);
  copyField(cfgUser, sizeof(cfgUser), newUser);
  copyField(cfgPrefix, sizeof(cfgPrefix), newPrefix);
  cfgPort = newPort ? newPort : 1883;
  if (newPass) copyField(cfgPass, sizeof(cfgPass), newPass);

  Preferences prefs;
  if (prefs.begin("patternflow", false)) {
    prefs.putString("mq_host", cfgHost);
    prefs.putString("mq_user", cfgUser);
    prefs.putString("mq_prefix", cfgPrefix);
    prefs.putUShort("mq_port", cfgPort);
    if (newPass) prefs.putString("mq_pass", cfgPass);
    prefs.end();
  }
  applyConfigChange();
}

/** Forget the broker entirely, including the password. */
inline void clearConfig() {
  cfgHost[0] = '\0';
  cfgUser[0] = '\0';
  cfgPass[0] = '\0';
  cfgPort = 1883;
  Preferences prefs;
  if (prefs.begin("patternflow", false)) {
    prefs.remove("mq_host");
    prefs.remove("mq_user");
    prefs.remove("mq_pass");
    prefs.remove("mq_port");
    prefs.end();
  }
  applyConfigChange();
}

inline void lastKnobsCopy(long out[4]) {
  for (int i = 0; i < 4; ++i) out[i] = lastKnobs[i];
}

inline void begin() {
  if (WiFi.status() != WL_CONNECTED) return;
  started = true;
  ensureClientId();
  client.setClient(net);
  applyClientSettings();
  lastReconnectMs = 0;
  if (hasBroker()) {
    Serial.printf("[MQTT] ready — broker %s:%d  page /mqtt\n",
                  cfgHost, cfgPort);
  } else {
    Serial.println("[MQTT] compiled in, no broker set — see /mqtt");
  }
}

inline void handle() {
  if (!started || role == ROLE_OFF || !hasBroker()) {
    if (client.connected()) client.disconnect();
    return;
  }
  if (WiFi.status() != WL_CONNECTED) return;

  if (!client.connected()) {
    uint32_t now = millis();
    if (lastReconnectMs != 0 && (now - lastReconnectMs) < reconnectDelayMs()) return;
    lastReconnectMs = now;
    tryConnect();
    return;
  }
  client.loop();
}

inline int32_t consumeKnobDelta(int idx) {
  if (idx < 0 || idx > 3) return 0;
  int32_t d = pendingKnobDelta[idx];
  pendingKnobDelta[idx] = 0;
  return d;
}

inline bool consumePatternIdx(int& outIdx) {
  if (pendingPatternIdx < 0) return false;
  outIdx = pendingPatternIdx;
  pendingPatternIdx = -1;
  return true;
}

// Called every frame: keeps the status page honest even when off, and
// publishes only the knobs that actually moved.
inline void update(const InputFrame& input, const char* contentName) {
  for (int i = 0; i < 4; ++i) lastKnobs[i] = input.knobs[i];
  if (contentName) snprintf(lastPattern, sizeof(lastPattern), "%s", contentName);
  if (role != ROLE_PUBLISHER || !client.connected()) return;

  for (int i = 0; i < 4; ++i) {
    if (input.knobDeltas[i] != 0) publishKnob(i, input.knobs[i]);
  }
}

// Separate from update() because the pattern name changes far less often
// than the knobs, and republishing it every frame would hammer the broker.
inline void notePattern(const char* contentName) {
  if (contentName) snprintf(lastPattern, sizeof(lastPattern), "%s", contentName);
  if (role != ROLE_PUBLISHER || !client.connected() || !lastPattern[0]) return;
  if (strcmp(publishedPattern, lastPattern) == 0) return;
  snprintf(publishedPattern, sizeof(publishedPattern), "%s", lastPattern);
  publishPatternName(lastPattern);
}

#else

inline void begin() {}
inline void handle() {}
inline void update(const InputFrame&, const char*) {}
inline void notePattern(const char*) {}
inline void setRole(Role) {}
inline Role currentRole() { return ROLE_OFF; }
inline bool isCompiledIn() { return false; }
inline bool isConnected() { return false; }
inline bool hasBroker() { return false; }
inline const char* roleName(Role) { return "off"; }
inline const char* stateText() { return "off (compile-time)"; }
inline const char* error() { return ""; }
inline const char* host() { return ""; }
inline uint16_t port() { return 0; }
inline const char* user() { return ""; }
inline const char* prefix() { return ""; }
inline const char* lastPatternName() { return ""; }
inline void lastKnobsCopy(long out[4]) {
  for (int i = 0; i < 4; ++i) out[i] = 0;
}
inline int32_t consumeKnobDelta(int) { return 0; }
inline bool consumePatternIdx(int&) { return false; }

#endif

}  // namespace PatternflowMqtt
