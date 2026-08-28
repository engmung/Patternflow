// ═══════════════════════════════════════════════════════════
// PatternFlow - MQTT, as an addon
//
// The third port, and the one that finished the hook set. Sequences needed
// six hooks, weather added two, and MQTT added three more:
//
//   observeFrame  - it mirrors the FINISHED input frame outward (knob values
//                   as they move, the pattern name when it changes). That is
//                   the opposite end of the frame from fillInput, and no
//                   earlier addon had wanted to look rather than write.
//   onSleep       - the panel slept or woke, and anything publishing device
//                   state has to say so.
//   requestSleep  - a broker message can ask the device to sleep. Like
//                   takePattern it is a request: stopping the DMA engine and
//                   reclocking the CPU stays the sketch's job.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Preferences.h>
#include "../pf_addon.h"
#include "core_mqtt.h"
#include "core_mqtt_http.h"

namespace PFAddonMqtt {

// Restore the saved channel first (it constrains the role), then the role.
// Defaults stay Off, so a device that has never been told otherwise never
// dials a broker. This used to sit in the sketch's setup(), reading the
// sketch's Preferences handle; an addon owns its own.
inline void setup() {
  PatternflowMqtt::loadConfig();
  Preferences prefs;
  prefs.begin("patternflow", /*readOnly=*/true);
  auto savedRole =
      (PatternflowMqtt::Role)prefs.getUChar("mqtt_role", PatternflowMqtt::ROLE_OFF);
  prefs.end();
  auto ch = PatternflowMqtt::currentChannel();
  if (savedRole == PatternflowMqtt::ROLE_OFF || ch == PatternflowMqtt::CHANNEL_OFF) {
    PatternflowMqtt::applyChannel(PatternflowMqtt::CHANNEL_OFF, PatternflowMqtt::ROLE_OFF);
  } else {
    PatternflowMqtt::applyChannel(ch, savedRole);
  }
  // Director mode (local authoring broker) survives reboots the same way
  // the normal broker does.
  PatternflowMqtt::applySavedMode();
}

inline void onNetwork() {
  PatternflowMqttHttp::begin();
  PatternflowMqtt::begin();
}

inline void loop(const PFAddonFrame&) {
  PatternflowMqtt::handle();
}

// Knob deltas arriving from a broker join the frame like any other source.
inline void fillInput(InputFrame& input) {
  for (int i = 0; i < 4; i++) {
    input.knobDeltas[i] += PatternflowMqtt::consumeKnobDelta(i);
  }
}

// The finished frame, mirrored outward. notePattern dedupes, so this does
// not republish every frame.
inline void observeFrame(const InputFrame& input, const PFAddonFrame& frame) {
  const char* patternName = frame.patternName;
  PatternflowMqtt::update(input, patternName);
  PatternflowMqtt::notePattern(patternName);
}

inline void onSleep(bool sleeping) {
  PatternflowMqtt::noteSleep(sleeping);
}

inline bool requestSleep(bool* sleeping) {
  return PatternflowMqtt::consumeSleepRequest(*sleeping);
}

// A retained <prefix>/pattern message. The name was already resolved to an
// index inside core_mqtt.h, so a rename on the broker side cannot select the
// wrong slot here.
// "Why is the other panel not following?" answerable from one page. Role
// and connection state only — never the credentials.
inline void appendStatus(String& json) {
  json += ",\"mqttRole\":\"";
  json += PatternflowMqtt::roleName(PatternflowMqtt::currentRole());
  json += "\",\"mqttState\":\"";
  json += PatternflowMqtt::stateText();
  json += "\",\"mqttConnected\":";
  json += PatternflowMqtt::isConnected() ? "true" : "false";
}

inline bool takePattern(int* idx) {
  return PatternflowMqtt::consumePatternIdx(*idx);
}

inline const PFAddon descriptor = {
    "mqtt",
    "mqtt",
    setup,
    onNetwork,
    loop,
    observeFrame,
    fillInput,
    nullptr,       // onUserInput
    nullptr,       // claimsPattern
    takePattern,
    onSleep,
    requestSleep,
    nullptr,       // shortName - not listed in the device menu
    nullptr,       // isRuntimeEnabled
    nullptr,       // setRuntimeEnabled
    appendStatus,
    nullptr,       // drawOverlay
    "/mqtt",       // navPath - the console header link
    "MQTT",        // navLabel
    "Mirror one panel onto another, or hand the knobs to home automation.",
};

}  // namespace PFAddonMqtt
