#pragma once

// Deliver a response body that is larger than one TCP bufferful, on a heap
// too small to hold one.
//
// The failure this replaces, traced through the core rather than guessed at:
// NetworkClient::write() sends with MSG_DONTWAIT and counts *consecutive*
// non-writable selects. After WIFI_CLIENT_MAX_WRITE_RETRY (10) of them, each
// with a WIFI_CLIENT_SELECT_TIMEOUT_US (1 s) timeout, it returns however many
// bytes it managed and stops. WebServer::send_P never looks at that count. So
// with a pattern module resident — internal heap ~4.9 KB, lwIP unable to
// allocate pbufs — /patterns stalled for exactly ten seconds and arrived
// truncated at 5,633 bytes (four segments, one bufferful), its script cut
// mid-statement. The page rendered blank while every API underneath answered
// fine, and the symptom looked like anything but a send-buffer problem.
//
// Two changes fix it without more RAM:
//
//   * Write in small slices. lwIP then only has to find one small pbuf at a
//     time instead of a segment chain, which is the difference between
//     "cannot allocate" and "slow".
//   * Be patient on a wall clock, not a retry count. Any forward progress
//     resets the deadline, so a slow link is not an error — only genuinely
//     making no progress for STALL_TIMEOUT_MS is.
//
// This is what lets a console page load while a pattern keeps running, so
// nothing here needs to evict the module first.

#include <Arduino.h>
#include <NetworkClient.h>
#include <WebServer.h>

namespace PatternflowHttpSend {

// Small enough that lwIP can nearly always find a pbuf for it even with a
// module resident, large enough to keep filling TCP segments.
constexpr size_t SLICE_BYTES = 512;

// How long delivery may make no progress at all before the peer is treated as
// gone. Generous: a browser on a weak signal legitimately pauses for seconds.
constexpr uint32_t STALL_TIMEOUT_MS = 10000;

// Write the whole buffer, or return false if the client went away or wedged.
inline bool writeAll(NetworkClient& client, const uint8_t* data, size_t length) {
  size_t sent = 0;
  uint32_t lastProgressMs = millis();

  while (sent < length) {
    if (!client.connected()) return false;

    const size_t remaining = length - sent;
    const size_t slice = remaining < SLICE_BYTES ? remaining : SLICE_BYTES;
    const size_t written = client.write(data + sent, slice);

    if (written > 0) {
      sent += written;
      lastProgressMs = millis();
      continue;
    }

    if (millis() - lastProgressMs > STALL_TIMEOUT_MS) return false;
    // Nothing went out. Yield so lwIP can process ACKs and release pbufs;
    // spinning here would starve the very task that frees the buffer space.
    delay(2);
  }
  return true;
}

// Headers through WebServer (they are small and always fit), body through the
// paced writer above. setContentLength makes _prepareHeader emit the real
// length even though send() is handed an empty body.
inline bool sendLarge(WebServer& server, int code, const char* contentType,
                      const char* body, size_t length) {
  server.setContentLength(length);
  server.send(code, contentType, "");
  return writeAll(server.client(), reinterpret_cast<const uint8_t*>(body), length);
}

inline bool sendLarge(WebServer& server, int code, const char* contentType,
                      const String& body) {
  return sendLarge(server, code, contentType, body.c_str(), body.length());
}

}  // namespace PatternflowHttpSend
