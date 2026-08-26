// ═══════════════════════════════════════════════════════════
// PatternFlow - the banner: a line of text on the panel
//
// Someone wants to put words on the display for a moment — a message from
// the network, a cue in a show, a notice from a scheduler. This owns the
// text, its expiry, and how it is drawn.
//
// It lived inside core_mqtt.h because MQTT was the first thing to send one,
// which left the show player calling PatternflowMqtt::applyHeldMessage() to
// display its own cue — a feature reaching into an unrelated feature to use
// the screen. Same accident as the web server inside audio, the parameter
// bus inside MQTT, and the clock inside weather.
//
// Two kinds of message, which is the whole of the logic here:
//   - timed  (show(): fades out on its own; network messages)
//   - held   (hold(): stays until replaced or cleared; show cues)
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

namespace PatternflowBanner {

constexpr size_t MESSAGE_BYTES = 80;

inline char text[MESSAGE_BYTES] = {};
inline uint32_t expiresMs = 0;
inline bool sticky = false;

inline void clear() {
  text[0] = '\0';
  expiresMs = 0;
  sticky = false;
}

// A message that fades on its own after durationMs.
inline void show(const char* body, uint32_t durationMs) {
  sticky = false;
  if (!body || !body[0]) {
    clear();
    return;
  }
  snprintf(text, sizeof(text), "%s", body);
  expiresMs = millis() + durationMs;
}

// A message that stays until something replaces or clears it — what a show
// cue wants, since the next cue is what should end it.
inline void hold(const char* body) {
  if (!body || !body[0]) {
    clear();
    return;
  }
  snprintf(text, sizeof(text), "%s", body);
  sticky = true;
  expiresMs = 0;
}

inline bool active() {
  if (!text[0]) return false;
  if (sticky) return true;
  return millis() < expiresMs;
}

inline const char* message() { return text; }

}  // namespace PatternflowBanner
