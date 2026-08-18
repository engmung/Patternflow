// ═══════════════════════════════════════════════════════════
// PatternFlow - MQTT sidechannel (knobs + pattern + absolute params)
//
// Topics per prefix (no wildcards — ACL-friendly exact list):
//
//   <prefix>/knob/1..4   absolute click counts (live; non-retain)
//   <prefix>/pattern     display name (live; non-retain)
//   <prefix>/message     banner text (broadcast: retain; channels: live)
//   <prefix>/param/1..4  absolute 0..1000 (live; non-retain)
//   <prefix>/sleep       in: 1/on/true/sleep · 0/off/false/wake · toggle
//   <prefix>/sleep/state out: 0 or 1, published on every change (non-retain)
//   <prefix>/snapshot    compact JSON mid-join state (channels 1–5 only; retain)
//   Director-only (local broker, not the public ACL):
//   <prefix>/query       panel → inventory
//   <prefix>/select      Director → mark modules on /patterns for ZIP export
//   <prefix>/select/ack  panel → {matched,presets,missing,rev}
//
// Retention policy (Performance Director proposal):
//   Broadcast message          retain
//   Channel/Live snapshot      retain
//   Everything else            non-retain
//
// Roles on /mqtt:
//   Off         socket closed
//   Publisher   sends knobs + pattern (+ Live snapshot heartbeat)
//   Subscriber  applies snapshot (on channels) then follows live topics
//
// /message and /sleep are obeyed in EITHER role, unlike the knob and pattern
// topics. Both are "tell the panels something" rather than "mirror this panel",
// and a panel that publishes its knobs is still a panel you want to be able to
// switch off from home automation.
//
// Channel presets set the prefix: patternflow / patternflow1..4 / patternflow5.
// Channels 1–4 force Subscriber; Broadcast and Live allow Pub or Sub.
//
// Include AFTER pattern_registry.h.
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
#include "core_pack_select.h"
#endif

namespace PatternflowMqtt {

enum Role : uint8_t {
  ROLE_OFF = 0,
  ROLE_PUBLISHER = 1,
  ROLE_SUBSCRIBER = 2
};

// UI / NVS channel preset. Off is role-only; Custom means freeform prefix.
enum Channel : uint8_t {
  CHANNEL_OFF = 0,
  CHANNEL_BROADCAST = 1,
  CHANNEL_1 = 2,
  CHANNEL_2 = 3,
  CHANNEL_3 = 4,
  CHANNEL_4 = 5,
  CHANNEL_LIVE = 6,
  CHANNEL_CUSTOM = 7
};

// Normal = saved community/HA broker. Director = local anonymous overlay
// (host = PC LAN IP, port 1883, prefix patternflow, Subscriber). Normal
// credentials stay in NVS and come back when leaving Director mode.
enum MqttMode : uint8_t {
  MQTT_MODE_NORMAL = 0,
  MQTT_MODE_DIRECTOR = 1
};

#if PF_MQTT_ENABLED

constexpr size_t NAME_BYTES = 48;
constexpr size_t MESSAGE_BYTES = 80;
constexpr size_t SNAPSHOT_BYTES = 384;

constexpr uint32_t CONNECT_TIMEOUT_MS = 1500;
constexpr uint32_t SOCKET_TIMEOUT_S = 1;
constexpr uint32_t RECONNECT_MIN_MS = 5000;
constexpr uint32_t RECONNECT_MID_MS = 15000;
constexpr uint32_t RECONNECT_MAX_MS = 60000;
constexpr uint8_t RERESOLVE_AFTER = 4;
constexpr uint32_t SNAPSHOT_HEARTBEAT_MS = 8000;

inline WiFiClient net;
inline PubSubClient client(net);
inline bool started = false;
inline Role role = ROLE_OFF;
inline Channel channel = CHANNEL_BROADCAST;
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
// -1 nothing pending, 0 wake, 1 sleep — consumed by the sketch, which owns the
// actual transition (see core_sleep.h on why a callback must not do it).
inline int8_t pendingSleep = -1;
// Last sleep state published, so noteSleep() can dedupe the same way
// notePattern() does. -1 = nothing published on this connection yet.
inline int8_t publishedSleep = -1;
inline char overlayText[MESSAGE_BYTES] = {};
inline uint32_t overlayExpiresMs = 0;
inline bool overlaySticky = false;
inline IPAddress brokerIp;
inline bool brokerResolved = false;
inline uint8_t failures = 0;

// Absolute param bus (held until physical encoder motion releases a channel).
inline bool paramHeld[4] = {false, false, false, false};
inline uint16_t paramValue[4] = {500, 500, 500, 500};
inline uint32_t paramHeldAtMs[4] = {0, 0, 0, 0};
inline uint32_t lastSnapshotPubMs = 0;
// Ignore encoder chatter briefly after an absolute set (Director spam / noise).
constexpr uint32_t ABSOLUTE_RELEASE_GRACE_MS = 250;

constexpr size_t HOST_BYTES = 64;
constexpr size_t USER_BYTES = 32;
constexpr size_t PASS_BYTES = 48;
constexpr size_t PREFIX_BYTES = 32;

inline char cfgHost[HOST_BYTES] = PF_MQTT_HOST;
inline char cfgUser[USER_BYTES] = PF_MQTT_USER;
inline char cfgPass[PASS_BYTES] = PF_MQTT_PASS;
inline char cfgPrefix[PREFIX_BYTES] = PF_MQTT_PREFIX;
inline uint16_t cfgPort = PF_MQTT_PORT;
inline MqttMode mqttMode = MQTT_MODE_NORMAL;
inline char dirHost[HOST_BYTES] = {};
// -2 idle, -1 header, 0..n-1 items, n end
inline int inventorySendIdx = -2;

inline bool isDirectorMode() { return mqttMode == MQTT_MODE_DIRECTOR; }

inline const char* livePrefix() {
  return isDirectorMode() ? "patternflow" : cfgPrefix;
}

inline const char* connectHost() {
  return isDirectorMode() ? dirHost : cfgHost;
}

inline uint16_t connectPort() {
  return isDirectorMode() ? (uint16_t)1883 : cfgPort;
}

inline bool hasBroker() { return connectHost()[0] != '\0'; }

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

inline const char* channelName(Channel c) {
  switch (c) {
    case CHANNEL_OFF: return "off";
    case CHANNEL_BROADCAST: return "broadcast";
    case CHANNEL_1: return "ch1";
    case CHANNEL_2: return "ch2";
    case CHANNEL_3: return "ch3";
    case CHANNEL_4: return "ch4";
    case CHANNEL_LIVE: return "live";
    case CHANNEL_CUSTOM: return "custom";
    default: return "custom";
  }
}

inline Channel channelFromName(const char* name) {
  if (!name || !name[0]) return CHANNEL_CUSTOM;
  if (strcasecmp(name, "off") == 0 || strcasecmp(name, "none") == 0) return CHANNEL_OFF;
  if (strcasecmp(name, "broadcast") == 0 || strcasecmp(name, "bc") == 0) return CHANNEL_BROADCAST;
  if (strcasecmp(name, "ch1") == 0 || strcmp(name, "1") == 0) return CHANNEL_1;
  if (strcasecmp(name, "ch2") == 0 || strcmp(name, "2") == 0) return CHANNEL_2;
  if (strcasecmp(name, "ch3") == 0 || strcmp(name, "3") == 0) return CHANNEL_3;
  if (strcasecmp(name, "ch4") == 0 || strcmp(name, "4") == 0) return CHANNEL_4;
  if (strcasecmp(name, "live") == 0 || strcasecmp(name, "ch5") == 0 || strcmp(name, "5") == 0) {
    return CHANNEL_LIVE;
  }
  if (strcasecmp(name, "custom") == 0) return CHANNEL_CUSTOM;
  return CHANNEL_CUSTOM;
}

inline const char* prefixForChannel(Channel c) {
  switch (c) {
    case CHANNEL_BROADCAST: return "patternflow";
    case CHANNEL_1: return "patternflow1";
    case CHANNEL_2: return "patternflow2";
    case CHANNEL_3: return "patternflow3";
    case CHANNEL_4: return "patternflow4";
    case CHANNEL_LIVE: return "patternflow5";
    default: return nullptr;
  }
}

inline Channel channelFromPrefix(const char* prefix) {
  if (!prefix || !prefix[0]) return CHANNEL_CUSTOM;
  if (strcmp(prefix, "patternflow") == 0) return CHANNEL_BROADCAST;
  if (strcmp(prefix, "patternflow1") == 0) return CHANNEL_1;
  if (strcmp(prefix, "patternflow2") == 0) return CHANNEL_2;
  if (strcmp(prefix, "patternflow3") == 0) return CHANNEL_3;
  if (strcmp(prefix, "patternflow4") == 0) return CHANNEL_4;
  if (strcmp(prefix, "patternflow5") == 0) return CHANNEL_LIVE;
  return CHANNEL_CUSTOM;
}

inline bool channelForcesSubscriber(Channel c) {
  return c >= CHANNEL_1 && c <= CHANNEL_4;
}

inline bool isBroadcastPrefix(const char* prefix) {
  return prefix && strcmp(prefix, "patternflow") == 0;
}

// patternflow1..5 — timed shows + Live (snapshot retain applies).
inline bool isChannelShowPrefix(const char* prefix) {
  if (!prefix) return false;
  if (strncmp(prefix, "patternflow", 11) != 0) return false;
  char digit = prefix[11];
  return digit >= '1' && digit <= '5' && prefix[12] == '\0';
}

inline bool retainMessageTopic() { return isBroadcastPrefix(livePrefix()); }
inline bool retainSnapshotTopic() { return isChannelShowPrefix(livePrefix()); }
inline bool retainLeafTopic() { return false; }

inline const char* stateText() {
  if (!hasBroker()) return "no broker configured";
  if (role == ROLE_OFF || channel == CHANNEL_OFF) return "off";
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
  snprintf(buf, n, "%s/knob/%d", livePrefix(), index + 1);
}

inline void topicPattern(char* buf, size_t n) {
  snprintf(buf, n, "%s/pattern", livePrefix());
}

inline void topicMessage(char* buf, size_t n) {
  snprintf(buf, n, "%s/message", livePrefix());
}

inline void topicParam(char* buf, size_t n, int index) {
  snprintf(buf, n, "%s/param/%d", livePrefix(), index + 1);
}

inline void topicSleep(char* buf, size_t n) {
  snprintf(buf, n, "%s/sleep", livePrefix());
}

inline void topicSleepState(char* buf, size_t n) {
  snprintf(buf, n, "%s/sleep/state", livePrefix());
}

inline void topicSnapshot(char* buf, size_t n) {
  snprintf(buf, n, "%s/snapshot", livePrefix());
}

inline void topicQuery(char* buf, size_t n) {
  snprintf(buf, n, "%s/query", livePrefix());
}

inline void topicInventory(char* buf, size_t n) {
  snprintf(buf, n, "%s/inventory", livePrefix());
}

inline void topicInventoryItem(char* buf, size_t n, int index) {
  snprintf(buf, n, "%s/inventory/%d", livePrefix(), index);
}

inline void topicInventoryEnd(char* buf, size_t n) {
  snprintf(buf, n, "%s/inventory/end", livePrefix());
}

inline void topicSelect(char* buf, size_t n) {
  snprintf(buf, n, "%s/select", livePrefix());
}

inline void topicSelectAck(char* buf, size_t n) {
  snprintf(buf, n, "%s/select/ack", livePrefix());
}

inline bool topicIsPattern(const char* topic) {
  char expected[48];
  topicPattern(expected, sizeof(expected));
  return topic && strcmp(topic, expected) == 0;
}

inline bool topicIsMessage(const char* topic) {
  char expected[48];
  topicMessage(expected, sizeof(expected));
  return topic && strcmp(topic, expected) == 0;
}

inline bool topicIsSleep(const char* topic) {
  char expected[48];
  topicSleep(expected, sizeof(expected));
  return topic && strcmp(topic, expected) == 0;
}

inline bool topicIsSnapshot(const char* topic) {
  char expected[48];
  topicSnapshot(expected, sizeof(expected));
  return topic && strcmp(topic, expected) == 0;
}

inline bool topicIsQuery(const char* topic) {
  char expected[48];
  topicQuery(expected, sizeof(expected));
  return topic && strcmp(topic, expected) == 0;
}

inline bool topicIsSelect(const char* topic) {
  char expected[48];
  topicSelect(expected, sizeof(expected));
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

inline int topicParamIndex(const char* topic) {
  if (!topic) return -1;
  const char* slash = strrchr(topic, '/');
  if (!slash || !slash[1]) return -1;
  int n = atoi(slash + 1);
  if (n < 1 || n > 4) return -1;
  char expected[48];
  topicParam(expected, sizeof(expected), n - 1);
  return strcmp(topic, expected) == 0 ? (n - 1) : -1;
}

// slugFromModulePath(), patternSlugAt() and findPatternByName() used to live
// here. They are registry knowledge and pattern persistence needs them without
// MQTT, so they moved to pattern_registry.h — which this file is included
// after, so the unqualified calls below still resolve.

inline void jsonEscape(const char* in, char* out, size_t n) {
  size_t j = 0;
  for (size_t i = 0; in && in[i] && j + 2 < n; ++i) {
    unsigned char c = (unsigned char)in[i];
    if (c == '"' || c == '\\') {
      if (j + 3 >= n) break;
      out[j++] = '\\';
      out[j++] = (char)c;
    } else if (c >= 0x20) {
      out[j++] = (char)c;
    }
  }
  out[j] = '\0';
}

inline void requestInventory() {
  if (!isDirectorMode()) return;
  inventorySendIdx = -1;
}

inline void publishSelectAck(uint8_t matched, uint8_t presets, uint8_t missing) {
  if (!client.connected()) return;
  char topic[56];
  char payload[128];
  topicSelectAck(topic, sizeof(topic));
  snprintf(payload, sizeof(payload),
           "{\"matched\":%u,\"presets\":%u,\"missing\":%u,\"rev\":%lu,\"total\":%u}",
           (unsigned)matched, (unsigned)presets, (unsigned)missing,
           (unsigned long)PatternflowPackSelect::rev,
           (unsigned)PatternflowPackSelect::count);
  client.publish(topic, payload, false);
}

// Director → panel: newline-separated names or slugs. "clear" empties the
// list. A leading '+' appends (chunked sends). Only installed .pfm modules
// are marked — presets live in firmware and are not ZIP-exported.
inline void applyPackSelectPayload(uint8_t* payload, unsigned int length) {
  if (!isDirectorMode()) return;
  char body[481];
  unsigned int n = length < sizeof(body) - 1 ? length : sizeof(body) - 1;
  memcpy(body, payload, n);
  body[n] = '\0';
  while (n && (body[n - 1] == '\n' || body[n - 1] == '\r' || body[n - 1] == ' ')) {
    body[--n] = '\0';
  }
  char* start = body;
  while (*start == ' ' || *start == '\n' || *start == '\r') start++;

  if (!start[0] || strcasecmp(start, "clear") == 0) {
    PatternflowPackSelect::clear();
    publishSelectAck(0, 0, 0);
    return;
  }

  bool append = false;
  if (start[0] == '+') {
    append = true;
    start++;
  }
  if (!append) PatternflowPackSelect::clear();

  uint8_t matched = 0, presets = 0, missing = 0;
  char* p = start;
  while (*p) {
    while (*p == '\n' || *p == '\r' || *p == ',') p++;
    if (!*p) break;
    char* tok = p;
    while (*p && *p != '\n' && *p != '\r' && *p != ',') p++;
    char saved = *p;
    *p = '\0';
    while (*tok == ' ') tok++;
    char* end = tok + strlen(tok);
    while (end > tok && end[-1] == ' ') *--end = '\0';
    if (tok[0] && strcasecmp(tok, "clear") != 0) {
      int idx = findPatternByName(tok);
      if (idx < 0) {
        missing++;
      } else if (!patterns[idx].modulePath) {
        presets++;
      } else {
        char slug[MODULE_NAME_BYTES];
        patternSlugAt(idx, slug, sizeof(slug));
        if (slug[0] && PatternflowPackSelect::add(slug)) matched++;
        else missing++;
      }
    }
    *p = saved;
    if (saved) p++;
  }
  PatternflowPackSelect::bump();
  Serial.printf("[MQTT] pack select matched=%u presets=%u missing=%u\n",
                (unsigned)matched, (unsigned)presets, (unsigned)missing);
  publishSelectAck(matched, presets, missing);
}

inline void publishInventoryItem(int index) {
  if (index < 0 || index >= NUM_PATTERNS || !patterns) return;
  char topic[56];
  topicInventoryItem(topic, sizeof(topic), index);
  char nameEsc[NAME_BYTES * 2];
  char slug[NAME_BYTES];
  jsonEscape(patterns[index].name ? patterns[index].name : "", nameEsc, sizeof(nameEsc));
  patternSlugAt(index, slug, sizeof(slug));
  char payload[256];
  snprintf(payload, sizeof(payload),
           "{\"i\":%d,\"name\":\"%s\",\"slug\":\"%s\",\"absoluteReady\":%s}",
           index, nameEsc, slug,
           patterns[index].absoluteReady ? "true" : "false");
  client.publish(topic, payload, false);
}

inline void pumpInventory() {
  if (inventorySendIdx < -1 || !isDirectorMode() || !client.connected()) return;
  if (inventorySendIdx == -1) {
    char topic[48];
    char payload[40];
    topicInventory(topic, sizeof(topic));
    snprintf(payload, sizeof(payload), "{\"count\":%d}", NUM_PATTERNS);
    client.publish(topic, payload, false);
    inventorySendIdx = 0;
    return;
  }
  if (inventorySendIdx < NUM_PATTERNS) {
    publishInventoryItem(inventorySendIdx);
    inventorySendIdx++;
    return;
  }
  char topic[48];
  char payload[40];
  topicInventoryEnd(topic, sizeof(topic));
  snprintf(payload, sizeof(payload), "{\"count\":%d}", NUM_PATTERNS);
  client.publish(topic, payload, false);
  inventorySendIdx = -2;
}

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

inline void applyRemoteParam(int index, long value) {
  if (index < 0 || index > 3) return;
  if (value < 0) value = 0;
  if (value > 1000) value = 1000;
  paramHeld[index] = true;
  paramValue[index] = (uint16_t)value;
  paramHeldAtMs[index] = millis();
}

inline void releaseAbsolute(int index) {
  if (index < 0 || index > 3) return;
  // Physical release only after grace — avoids encoder noise dropping Director holds.
  if (paramHeld[index] &&
      (millis() - paramHeldAtMs[index]) < ABSOLUTE_RELEASE_GRACE_MS) {
    return;
  }
  paramHeld[index] = false;
}

inline void clearAbsoluteAll() {
  for (int i = 0; i < 4; ++i) {
    paramHeld[i] = false;
    paramHeldAtMs[i] = 0;
  }
}

// Copy held absolute values into the frame. Call after physical release.
// When absolute is active, clear deltas / audio flags on that channel so
// legacy paths cannot fight the Director set-point.
inline void fillAbsolute(InputFrame& input) {
  for (int i = 0; i < 4; ++i) {
    input.paramAbsoluteActive[i] = paramHeld[i];
    input.paramAbsolute[i] = paramValue[i];
    if (paramHeld[i]) {
      input.knobDeltas[i] = 0;
      input.knobAudioActive[i] = false;
    }
  }
}

inline void applyRemoteMessage(uint8_t* payload, unsigned int length) {
  overlaySticky = false;
  char body[MESSAGE_BYTES];
  unsigned int n = length < sizeof(body) - 1 ? length : sizeof(body) - 1;
  memcpy(body, payload, n);
  body[n] = '\0';
  while (n && (body[n - 1] == '\n' || body[n - 1] == '\r' || body[n - 1] == ' ')) {
    body[--n] = '\0';
  }
  if (!body[0]) {
    overlayText[0] = '\0';
    overlayExpiresMs = 0;
    return;
  }
  snprintf(overlayText, sizeof(overlayText), "%s", body);
  overlayExpiresMs = millis() + PF_MQTT_MESSAGE_DURATION_MS;
}

// Show player: banner holds until the next message cue (empty clears).
inline void applyHeldMessage(const char* text) {
  if (!text || !text[0]) {
    overlayText[0] = '\0';
    overlayExpiresMs = 0;
    overlaySticky = false;
    return;
  }
  snprintf(overlayText, sizeof(overlayText), "%s", text);
  overlaySticky = true;
  overlayExpiresMs = 0;
}

// <prefix>/sleep. Accepts the spellings a person or an automation actually
// sends: 1/0, on/off, true/false, sleep/wake, and toggle. Anything else is
// ignored rather than guessed at — a typo should not black out a panel.
inline void applyRemoteSleep(uint8_t* payload, unsigned int length) {
  char body[16];
  unsigned int n = length < sizeof(body) - 1 ? length : sizeof(body) - 1;
  memcpy(body, payload, n);
  body[n] = '\0';
  while (n && (body[n - 1] == '\n' || body[n - 1] == '\r' || body[n - 1] == ' ')) {
    body[--n] = '\0';
  }
  const char* value = body;
  while (*value == ' ') value++;
  if (!value[0]) return;

  if (strcasecmp(value, "toggle") == 0) {
    // Against the last state we published, which is the one the sender saw.
    pendingSleep = publishedSleep == 1 ? 0 : 1;
    return;
  }
  if (strcmp(value, "1") == 0 || strcasecmp(value, "on") == 0 ||
      strcasecmp(value, "true") == 0 || strcasecmp(value, "sleep") == 0) {
    pendingSleep = 1;
    return;
  }
  if (strcmp(value, "0") == 0 || strcasecmp(value, "off") == 0 ||
      strcasecmp(value, "false") == 0 || strcasecmp(value, "wake") == 0) {
    pendingSleep = 0;
    return;
  }
  Serial.printf("[MQTT] ignoring sleep payload \"%s\"\n", value);
}

// Minimal snapshot parser — looks for "pattern", "param":[a,b,c,d], "message".
// Empty payload clears absolute holds and the banner (end-of-show sweep).
inline void applyRemoteSnapshot(uint8_t* payload, unsigned int length) {
  if (!payload || length == 0) {
    clearAbsoluteAll();
    overlayText[0] = '\0';
    overlayExpiresMs = 0;
    return;
  }

  char body[SNAPSHOT_BYTES];
  unsigned int n = length < sizeof(body) - 1 ? length : sizeof(body) - 1;
  memcpy(body, payload, n);
  body[n] = '\0';

  const char* patKey = strstr(body, "\"pattern\"");
  if (patKey) {
    const char* colon = strchr(patKey + 9, ':');
    if (colon) {
      const char* q1 = strchr(colon + 1, '"');
      if (q1) {
        const char* q2 = strchr(q1 + 1, '"');
        if (q2 && q2 > q1 + 1) {
          char name[NAME_BYTES];
          size_t len = (size_t)(q2 - (q1 + 1));
          if (len >= sizeof(name)) len = sizeof(name) - 1;
          memcpy(name, q1 + 1, len);
          name[len] = '\0';
          applyRemotePattern(name);
        }
      }
    }
  }

  const char* paramKey = strstr(body, "\"param\"");
  if (paramKey) {
    const char* bracket = strchr(paramKey + 7, '[');
    if (bracket) {
      const char* p = bracket + 1;
      for (int i = 0; i < 4; ++i) {
        while (*p == ' ' || *p == '\t' || *p == ',') ++p;
        char* end = nullptr;
        long v = strtol(p, &end, 10);
        if (end == p) break;
        applyRemoteParam(i, v);
        p = end;
      }
    }
  }

  const char* msgKey = strstr(body, "\"message\"");
  if (msgKey) {
    const char* colon = strchr(msgKey + 9, ':');
    if (colon) {
      const char* q1 = strchr(colon + 1, '"');
      if (q1) {
        const char* q2 = strchr(q1 + 1, '"');
        if (q2) {
          char msg[MESSAGE_BYTES];
          size_t len = (size_t)(q2 - (q1 + 1));
          if (len >= sizeof(msg)) len = sizeof(msg) - 1;
          memcpy(msg, q1 + 1, len);
          msg[len] = '\0';
          applyRemoteMessage((uint8_t*)msg, (unsigned int)len);
        }
      }
    }
  }
}

inline bool overlayActive() {
  if (!overlayText[0]) return false;
  if (overlaySticky) return true;
  if (overlayExpiresMs == 0) return false;
  if ((int32_t)(millis() - overlayExpiresMs) >= 0) {
    overlayText[0] = '\0';
    overlayExpiresMs = 0;
    return false;
  }
  return true;
}

inline const char* overlayMessage() { return overlayText; }

inline uint32_t overlayRemainingMs() {
  if (!overlayActive()) return 0;
  return overlayExpiresMs - millis();
}

inline void onMessage(char* topic, uint8_t* payload, unsigned int length) {
  if (isDirectorMode() && topicIsQuery(topic)) {
    requestInventory();
    return;
  }
  if (isDirectorMode() && topicIsSelect(topic)) {
    applyPackSelectPayload(payload, length);
    return;
  }
  if (topicIsMessage(topic)) {
    applyRemoteMessage(payload, length);
    return;
  }
  if (topicIsSleep(topic)) {
    // Above the role check on purpose: a Publisher is still a panel somebody
    // wants to be able to switch off. See the roles note in the header.
    applyRemoteSleep(payload, length);
    return;
  }
  if (topicIsSnapshot(topic)) {
    // Snapshot is useful for any connected role on a channel (mid-join).
    applyRemoteSnapshot(payload, length);
    return;
  }
  if (role != ROLE_SUBSCRIBER) return;

  char body[96];
  unsigned int n = length < sizeof(body) - 1 ? length : sizeof(body) - 1;
  memcpy(body, payload, n);
  body[n] = '\0';
  while (n && (body[n - 1] == '\n' || body[n - 1] == '\r' || body[n - 1] == ' ')) {
    body[--n] = '\0';
  }

  if (topicIsPattern(topic)) {
    applyRemotePattern(body);
    return;
  }
  int param = topicParamIndex(topic);
  if (param >= 0) {
    if (!body[0]) {
      releaseAbsolute(param);
    } else {
      applyRemoteParam(param, atol(body));
    }
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
  client.publish(topic, payload, retainLeafTopic());
}

inline void publishPatternName(const char* name) {
  char topic[48];
  topicPattern(topic, sizeof(topic));
  client.publish(topic, name ? name : "", retainLeafTopic());
}

inline void publishParam(int index, uint16_t value) {
  char topic[48];
  char payload[8];
  topicParam(topic, sizeof(topic), index);
  if (value > 1000) value = 1000;
  snprintf(payload, sizeof(payload), "%u", (unsigned)value);
  client.publish(topic, payload, retainLeafTopic());
}

inline void publishSleepState(bool asleep) {
  char topic[56];
  topicSleepState(topic, sizeof(topic));
  client.publish(topic, asleep ? "1" : "0", retainLeafTopic());
}

inline void publishChannelSnapshot(bool force) {
  if (!retainSnapshotTopic()) return;
  if (role != ROLE_PUBLISHER || !client.connected()) return;
  uint32_t now = millis();
  if (!force && lastSnapshotPubMs != 0 &&
      (now - lastSnapshotPubMs) < SNAPSHOT_HEARTBEAT_MS) {
    return;
  }
  lastSnapshotPubMs = now;

  char topic[48];
  char payload[SNAPSHOT_BYTES];
  topicSnapshot(topic, sizeof(topic));
  snprintf(payload, sizeof(payload),
           "{\"pattern\":\"%s\",\"param\":[%u,%u,%u,%u],\"message\":\"\"}",
           lastPattern[0] ? lastPattern : "",
           (unsigned)paramValue[0], (unsigned)paramValue[1],
           (unsigned)paramValue[2], (unsigned)paramValue[3]);
  client.publish(topic, payload, true);
}

// Live leaf burst for currently connected peers (non-retain). Channel
// mid-join uses retained snapshot instead.
inline void publishLiveBurst() {
  if (!client.connected() || role != ROLE_PUBLISHER) return;
  for (int i = 0; i < 4; ++i) publishKnob(i, lastKnobs[i]);
  if (lastPattern[0]) {
    publishPatternName(lastPattern);
    snprintf(publishedPattern, sizeof(publishedPattern), "%s", lastPattern);
  }
  for (int i = 0; i < 4; ++i) {
    if (paramHeld[i]) publishParam(i, paramValue[i]);
  }
  publishChannelSnapshot(true);
}

inline void ensureClientId() {
  if (clientId[0]) return;
  uint64_t mac = ESP.getEfuseMac();
  snprintf(clientId, sizeof(clientId), "pf%06X",
           (unsigned)((mac >> 24) & 0xFFFFFF));
}

// The two topics both roles obey. Kept together so a role path cannot end up
// listening for a banner but not for "lights out".
inline void subscribeMessage() {
  char topic[48];
  topicMessage(topic, sizeof(topic));
  client.subscribe(topic);
  topicSleep(topic, sizeof(topic));
  client.subscribe(topic);
}

inline void subscribeAll() {
  subscribeMessage();
  char topic[48];
  for (int i = 0; i < 4; ++i) {
    topicKnob(topic, sizeof(topic), i);
    client.subscribe(topic);
    topicParam(topic, sizeof(topic), i);
    client.subscribe(topic);
  }
  topicPattern(topic, sizeof(topic));
  client.subscribe(topic);
  if (isChannelShowPrefix(livePrefix())) {
    topicSnapshot(topic, sizeof(topic));
    client.subscribe(topic);
  }
  if (isDirectorMode()) {
    topicQuery(topic, sizeof(topic));
    client.subscribe(topic);
    topicSelect(topic, sizeof(topic));
    client.subscribe(topic);
  }
}

// Publisher on a channel also listens for snapshot (ops clear) + message.
inline void subscribePublisherExtras() {
  subscribeMessage();
  if (isChannelShowPrefix(livePrefix())) {
    char topic[48];
    topicSnapshot(topic, sizeof(topic));
    client.subscribe(topic);
  }
}

inline void unsubscribeAll() {
  if (!client.connected() || livePrefix()[0] == '\0') return;
  char topic[48];
  topicMessage(topic, sizeof(topic));
  client.unsubscribe(topic);
  topicSleep(topic, sizeof(topic));
  client.unsubscribe(topic);
  topicPattern(topic, sizeof(topic));
  client.unsubscribe(topic);
  topicSnapshot(topic, sizeof(topic));
  client.unsubscribe(topic);
  topicQuery(topic, sizeof(topic));
  client.unsubscribe(topic);
  topicSelect(topic, sizeof(topic));
  client.unsubscribe(topic);
  for (int i = 0; i < 4; ++i) {
    topicKnob(topic, sizeof(topic), i);
    client.unsubscribe(topic);
    topicParam(topic, sizeof(topic), i);
    client.unsubscribe(topic);
  }
}

inline bool resolveBroker() {
  if (brokerResolved) return true;
  const char* host = connectHost();
  if (brokerIp.fromString(host)) {
    brokerResolved = true;
    return true;
  }
  if (WiFi.hostByName(host, brokerIp) == 1) {
    brokerResolved = true;
    Serial.printf("[MQTT] %s resolved to %s\n",
                  host, brokerIp.toString().c_str());
    return true;
  }
  setError("cannot resolve broker");
  return false;
}

inline void applyClientSettings() {
#if defined(ESP_ARDUINO_VERSION) && \
    ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  net.setConnectionTimeout(CONNECT_TIMEOUT_MS);
#else
  net.setTimeout((CONNECT_TIMEOUT_MS + 999U) / 1000U);
#endif
  client.setCallback(onMessage);
  client.setBufferSize(512);
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
    if (++failures == 0) failures = RERESOLVE_AFTER;
    return false;
  }
  client.setServer(brokerIp, connectPort());

  bool ok;
  if (!isDirectorMode() && cfgUser[0] != '\0') {
    ok = client.connect(clientId, cfgUser, cfgPass);
  } else {
    ok = client.connect(clientId);
  }
  if (!ok) {
    if (++failures == 0) failures = RERESOLVE_AFTER;
    if (failures >= RERESOLVE_AFTER) brokerResolved = false;
    snprintf(lastError, sizeof(lastError), "connect state %d", client.state());
    Serial.printf("[MQTT] connect failed (%s), retry in %lus\n",
                  stateText(), (unsigned long)(reconnectDelayMs() / 1000));
    return false;
  }

  failures = 0;
  setError("");
  Serial.printf("[MQTT] connected as %s (%s) mode=%s ch=%s prefix=%s to %s:%d\n",
                clientId, roleName(role),
                isDirectorMode() ? "director" : "normal",
                channelName(channel), livePrefix(),
                connectHost(), connectPort());
  if (role == ROLE_SUBSCRIBER) {
    for (int i = 0; i < 4; ++i) haveKnob[i] = false;
    subscribeAll();
  } else if (role == ROLE_PUBLISHER) {
    subscribePublisherExtras();
    publishLiveBurst();
  }
  return true;
}

inline void resetSessionState() {
  for (int i = 0; i < 4; ++i) {
    haveKnob[i] = false;
    pendingKnobDelta[i] = 0;
  }
  pendingPatternIdx = -1;
  pendingSleep = -1;
  // Forget what was published so the sketch's next noteSleep() re-announces on
  // this connection. Cheaper and less fragile than a burst that has to know
  // the sleep state itself.
  publishedSleep = -1;
  publishedPattern[0] = '\0';
  overlayText[0] = '\0';
  overlayExpiresMs = 0;
  overlaySticky = false;
  lastSnapshotPubMs = 0;
}

inline void setRole(Role next) {
  if (next > ROLE_SUBSCRIBER) next = ROLE_OFF;
  if (channelForcesSubscriber(channel) && next == ROLE_PUBLISHER) {
    next = ROLE_SUBSCRIBER;
  }
  if (role == next) return;
  if (client.connected()) {
    unsubscribeAll();
    client.disconnect();
  }
  role = next;
  if (next == ROLE_OFF) channel = CHANNEL_OFF;
  else if (channel == CHANNEL_OFF) channel = channelFromPrefix(cfgPrefix);
  resetSessionState();
  failures = 0;
  lastReconnectMs = 0;
  Serial.printf("[MQTT] role → %s\n", roleName(role));
}

inline void applyChannel(Channel next, Role preferredRole) {
  Channel prev = channel;
  char prevPrefix[PREFIX_BYTES];
  snprintf(prevPrefix, sizeof(prevPrefix), "%s", cfgPrefix);

  if (next == CHANNEL_OFF) {
    channel = CHANNEL_OFF;
    role = ROLE_OFF;
  } else {
    channel = next;
    const char* preset = prefixForChannel(next);
    if (preset) {
      snprintf(cfgPrefix, sizeof(cfgPrefix), "%s", preset);
    }
    if (channelForcesSubscriber(next)) {
      role = ROLE_SUBSCRIBER;
    } else if (preferredRole == ROLE_OFF) {
      role = ROLE_SUBSCRIBER;
    } else {
      role = preferredRole;
    }
  }

  if (client.connected()) {
    unsubscribeAll();
    client.disconnect();
  }
  resetSessionState();
  failures = 0;
  lastReconnectMs = 0;
  Serial.printf("[MQTT] channel → %s (was %s) prefix %s→%s role=%s\n",
                channelName(channel), channelName(prev),
                prevPrefix, cfgPrefix, roleName(role));
}

inline Role currentRole() { return role; }
inline Channel currentChannel() { return channel; }
inline bool isCompiledIn() { return true; }
inline bool isConnected() { return client.connected(); }
inline const char* error() { return lastError; }
inline const char* host() { return connectHost(); }
inline uint16_t port() { return connectPort(); }
inline const char* user() { return isDirectorMode() ? "" : cfgUser; }
inline const char* prefix() { return livePrefix(); }
inline bool hasPassword() { return !isDirectorMode() && cfgPass[0] != '\0'; }
inline const char* lastPatternName() { return lastPattern; }
inline const char* normalHost() { return cfgHost; }
inline const char* directorHost() { return dirHost; }
inline const char* modeName() { return isDirectorMode() ? "director" : "normal"; }
inline uint16_t normalPort() { return cfgPort; }
inline const char* normalUser() { return cfgUser; }
inline const char* normalPrefix() { return cfgPrefix; }
inline bool normalHasPassword() { return cfgPass[0] != '\0'; }

inline void copyField(char* dest, size_t size, const char* src) {
  if (!src) src = "";
  strncpy(dest, src, size - 1);
  dest[size - 1] = '\0';
}

inline void applyConfigChange();

inline void persistMqttMode() {
  Preferences prefs;
  if (!prefs.begin("patternflow", false)) return;
  prefs.putUChar("mq_mode", (uint8_t)mqttMode);
  prefs.putString("mq_dirhost", dirHost);
  prefs.end();
}

inline void applyDirectorOverlay() {
  channel = CHANNEL_BROADCAST;
  role = ROLE_SUBSCRIBER;
}

inline void restoreNormalChannelAndRole() {
  Preferences prefs;
  Channel ch = CHANNEL_OFF;
  Role savedRole = ROLE_OFF;
  if (prefs.begin("patternflow", true)) {
    ch = (Channel)prefs.getUChar("mq_channel", (uint8_t)CHANNEL_OFF);
    savedRole = (Role)prefs.getUChar("mqtt_role", (uint8_t)ROLE_OFF);
    prefs.end();
  }
  if (savedRole == ROLE_OFF || ch == CHANNEL_OFF) {
    applyChannel(CHANNEL_OFF, ROLE_OFF);
  } else {
    applyChannel(ch, savedRole);
  }
}

inline bool setDirectorHost(const char* host) {
  copyField(dirHost, sizeof(dirHost), host);
  persistMqttMode();
  if (isDirectorMode()) applyConfigChange();
  return dirHost[0] != '\0';
}

inline void setMqttMode(MqttMode next) {
  if (next == MQTT_MODE_DIRECTOR && dirHost[0] == '\0') {
    mqttMode = MQTT_MODE_DIRECTOR;
    persistMqttMode();
    applyDirectorOverlay();
    applyConfigChange();
    setError("set Director PC IP");
    return;
  }
  if (mqttMode == next) {
    if (next == MQTT_MODE_DIRECTOR) applyDirectorOverlay();
    return;
  }
  mqttMode = next;
  persistMqttMode();
  if (next == MQTT_MODE_DIRECTOR) {
    applyDirectorOverlay();
    applyConfigChange();
  } else {
    restoreNormalChannelAndRole();
    applyConfigChange();
  }
  Serial.printf("[MQTT] mode → %s\n", modeName());
}

inline void applySavedMode() {
  if (mqttMode == MQTT_MODE_DIRECTOR) applyDirectorOverlay();
}

inline void persistChannelAndRole() {
  if (isDirectorMode()) return;
  Preferences prefs;
  if (!prefs.begin("patternflow", false)) return;
  prefs.putUChar("mqtt_role", (uint8_t)role);
  prefs.putUChar("mq_channel", (uint8_t)channel);
  prefs.putString("mq_prefix", cfgPrefix);
  prefs.end();
}

inline void loadConfig() {
  Preferences prefs;
  if (!prefs.begin("patternflow", true)) return;
  if (prefs.isKey("mq_host")) prefs.getString("mq_host", cfgHost, sizeof(cfgHost));
  if (prefs.isKey("mq_user")) prefs.getString("mq_user", cfgUser, sizeof(cfgUser));
  if (prefs.isKey("mq_pass")) prefs.getString("mq_pass", cfgPass, sizeof(cfgPass));
  if (prefs.isKey("mq_prefix")) prefs.getString("mq_prefix", cfgPrefix, sizeof(cfgPrefix));
  if (prefs.isKey("mq_port")) cfgPort = prefs.getUShort("mq_port", cfgPort);
  if (prefs.isKey("mq_dirhost")) prefs.getString("mq_dirhost", dirHost, sizeof(dirHost));
  if (prefs.isKey("mq_mode")) {
    mqttMode = (MqttMode)prefs.getUChar("mq_mode", (uint8_t)MQTT_MODE_NORMAL);
  }
  if (prefs.isKey("mq_channel")) {
    channel = (Channel)prefs.getUChar("mq_channel", (uint8_t)CHANNEL_BROADCAST);
  } else {
    channel = channelFromPrefix(cfgPrefix);
  }
  prefs.end();
  if (channel == CHANNEL_OFF) {
    role = ROLE_OFF;
  } else if (channelForcesSubscriber(channel)) {
    // Role may still be loaded separately; force Sub on timed channels.
  }
}

inline void applyConfigChange() {
  brokerResolved = false;
  failures = 0;
  lastReconnectMs = 0;
  lastError[0] = '\0';
  for (int i = 0; i < 4; ++i) haveKnob[i] = false;
  if (client.connected()) {
    unsubscribeAll();
    client.disconnect();
  }
}

inline void saveConfig(const char* newHost, uint16_t newPort, const char* newUser,
                       const char* newPass, const char* newPrefix) {
  copyField(cfgHost, sizeof(cfgHost), newHost);
  copyField(cfgUser, sizeof(cfgUser), newUser);
  copyField(cfgPrefix, sizeof(cfgPrefix), newPrefix);
  cfgPort = newPort ? newPort : 1883;
  if (newPass) copyField(cfgPass, sizeof(cfgPass), newPass);

  Channel detected = channelFromPrefix(cfgPrefix);
  if (detected != CHANNEL_CUSTOM) {
    channel = detected;
    if (channelForcesSubscriber(channel) && role == ROLE_PUBLISHER) {
      role = ROLE_SUBSCRIBER;
    }
  } else if (channel != CHANNEL_OFF) {
    channel = CHANNEL_CUSTOM;
  }

  Preferences prefs;
  if (prefs.begin("patternflow", false)) {
    prefs.putString("mq_host", cfgHost);
    prefs.putString("mq_user", cfgUser);
    prefs.putString("mq_prefix", cfgPrefix);
    prefs.putUShort("mq_port", cfgPort);
    prefs.putUChar("mq_channel", (uint8_t)channel);
    prefs.putUChar("mqtt_role", (uint8_t)role);
    if (newPass) prefs.putString("mq_pass", cfgPass);
    prefs.end();
  }
  applyConfigChange();
}

inline void clearConfig() {
  cfgHost[0] = '\0';
  cfgUser[0] = '\0';
  cfgPass[0] = '\0';
  cfgPort = 1883;
  snprintf(cfgPrefix, sizeof(cfgPrefix), "%s", "patternflow");
  channel = CHANNEL_BROADCAST;
  Preferences prefs;
  if (prefs.begin("patternflow", false)) {
    prefs.remove("mq_host");
    prefs.remove("mq_user");
    prefs.remove("mq_pass");
    prefs.remove("mq_port");
    prefs.putString("mq_prefix", cfgPrefix);
    prefs.putUChar("mq_channel", (uint8_t)channel);
    prefs.end();
  }
  applyConfigChange();
}

inline void lastKnobsCopy(long out[4]) {
  for (int i = 0; i < 4; ++i) out[i] = lastKnobs[i];
}

inline void lastParamsCopy(uint16_t out[4], bool activeOut[4]) {
  for (int i = 0; i < 4; ++i) {
    out[i] = paramValue[i];
    activeOut[i] = paramHeld[i];
  }
}

inline void begin() {
  if (WiFi.status() != WL_CONNECTED) return;
  started = true;
  ensureClientId();
  client.setClient(net);
  applyClientSettings();
  lastReconnectMs = 0;
  if (hasBroker()) {
    Serial.printf("[MQTT] ready — %s broker %s:%d  page /mqtt\n",
                  isDirectorMode() ? "director" : "normal",
                  connectHost(), connectPort());
  } else {
    Serial.println("[MQTT] compiled in, no broker set — see /mqtt");
  }
}

inline void handle() {
  if (!started || role == ROLE_OFF || channel == CHANNEL_OFF || !hasBroker()) {
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
  pumpInventory();
  if (role == ROLE_PUBLISHER) publishChannelSnapshot(false);
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

inline bool consumeSleepRequest(bool& outSleep) {
  if (pendingSleep < 0) return false;
  outSleep = pendingSleep == 1;
  pendingSleep = -1;
  return true;
}

inline void update(const InputFrame& input, const char* contentName) {
  for (int i = 0; i < 4; ++i) lastKnobs[i] = input.knobs[i];
  if (contentName) snprintf(lastPattern, sizeof(lastPattern), "%s", contentName);
  if (role != ROLE_PUBLISHER || !client.connected()) return;

  for (int i = 0; i < 4; ++i) {
    if (input.knobDeltas[i] != 0) publishKnob(i, input.knobs[i]);
  }
}

inline void notePattern(const char* contentName) {
  if (contentName) snprintf(lastPattern, sizeof(lastPattern), "%s", contentName);
  if (role != ROLE_PUBLISHER || !client.connected() || !lastPattern[0]) return;
  if (strcmp(publishedPattern, lastPattern) == 0) return;
  snprintf(publishedPattern, sizeof(publishedPattern), "%s", lastPattern);
  publishPatternName(lastPattern);
  publishChannelSnapshot(true);
}

// Mirror of notePattern() for the sleep state, with two differences: it runs in
// EITHER role (a Subscriber panel is exactly the one an automation wants a
// state from), and the first call after a connect always publishes, because
// resetSessionState() clears what was published.
//
// Called every loop; the dedupe is what keeps that from being a publish per
// frame.
inline void noteSleep(bool asleep) {
  const int8_t next = asleep ? 1 : 0;
  if (!client.connected() || role == ROLE_OFF) return;
  if (publishedSleep == next) return;
  publishedSleep = next;
  publishSleepState(asleep);
}

#else

inline void begin() {}
inline void handle() {}
inline void update(const InputFrame&, const char*) {}
inline void notePattern(const char*) {}
inline void noteSleep(bool) {}
inline void setRole(Role) {}
inline void applyChannel(Channel, Role) {}
inline void loadConfig() {}
inline void saveConfig(const char*, uint16_t, const char*, const char*, const char*) {}
inline void clearConfig() {}
inline void persistChannelAndRole() {}
inline void setMqttMode(MqttMode) {}
inline bool setDirectorHost(const char*) { return false; }
inline void applySavedMode() {}
inline Role currentRole() { return ROLE_OFF; }
inline Channel currentChannel() { return CHANNEL_OFF; }
inline bool isCompiledIn() { return false; }
inline bool isConnected() { return false; }
inline bool hasBroker() { return false; }
inline bool hasPassword() { return false; }
inline bool isDirectorMode() { return false; }
inline const char* roleName(Role) { return "off"; }
inline const char* channelName(Channel) { return "off"; }
inline Channel channelFromName(const char*) { return CHANNEL_OFF; }
inline bool channelForcesSubscriber(Channel) { return false; }
inline const char* stateText() { return "off (compile-time)"; }
inline const char* error() { return ""; }
inline const char* host() { return ""; }
inline uint16_t port() { return 0; }
inline const char* user() { return ""; }
inline const char* prefix() { return ""; }
inline const char* lastPatternName() { return ""; }
inline const char* normalHost() { return ""; }
inline const char* directorHost() { return ""; }
inline const char* modeName() { return "normal"; }
inline uint16_t normalPort() { return 0; }
inline const char* normalUser() { return ""; }
inline const char* normalPrefix() { return ""; }
inline bool normalHasPassword() { return false; }
inline void lastKnobsCopy(long out[4]) {
  for (int i = 0; i < 4; ++i) out[i] = 0;
}
inline void lastParamsCopy(uint16_t out[4], bool activeOut[4]) {
  for (int i = 0; i < 4; ++i) {
    out[i] = 0;
    activeOut[i] = false;
  }
}
inline int32_t consumeKnobDelta(int) { return 0; }
inline bool consumePatternIdx(int& outIdx) { return false; }
inline bool consumeSleepRequest(bool& outSleep) { return false; }
inline void applyRemoteParam(int, long) {}
inline void applyHeldMessage(const char*) {}
inline void clearAbsoluteAll() {}
inline bool overlayActive() { return false; }
inline const char* overlayMessage() { return ""; }
inline uint32_t overlayRemainingMs() { return 0; }
inline void releaseAbsolute(int) {}
inline void fillAbsolute(InputFrame& input) {
  for (int i = 0; i < 4; ++i) {
    input.paramAbsoluteActive[i] = false;
    input.paramAbsolute[i] = 0;
  }
}

#endif

}  // namespace PatternflowMqtt
