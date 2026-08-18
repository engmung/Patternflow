// ═══════════════════════════════════════════════════════════
// PatternFlow - low-heap PROGMEM page sender
//
// WebServer's send_P delivered every console page for a year — until a
// resident module put internal heap near 7 KB, where big sends silently
// truncate at whatever the socket manages (~5.6 KB) and the page arrives
// with its script cut mid-statement. The old answer was to EVICT the module
// before serving (pause the pattern for the console). This is the new one:
// copy small slices out of flash and hand-feed the socket, yielding between
// writes so lwIP can drain, tolerating stalls instead of giving up.
//
// The difference from send_P is not chunking (send_P also writes in
// pieces); it is the explicit stall-and-retry. When the TCP window is full
// at low heap, send_P's underlying write returns short and the remainder
// is dropped; here a short write is just a reason to wait 2 ms and try
// again. Measured: 24 KB of frame data delivers reliably this way at heaps
// where send_P loses 3/4 of a 20 KB page.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall (see src/webserver/VENDORED.md)
#include <pgmspace.h>

namespace PFSend {

// Serve a PROGMEM page (or any PROGMEM asset) with a bounded, stall-tolerant
// drain. cacheControl lets immutable assets (fflate.js) keep their max-age.
inline void progmem(WebServer& server, const char* pgm,
                    const char* contentType = "text/html",
                    const char* cacheControl = "no-store") {
  size_t total = strlen_P(pgm);
  server.sendHeader("Cache-Control", cacheControl);
  server.setContentLength(total);
  server.send(200, contentType, "");

  WiFiClient client = server.client();
  size_t offset = 0;
  int stalls = 0;
  uint8_t slice[512];
  // Hard ceiling on how long one response may own the loop. This function
  // runs INSIDE loop(): while it drains, nothing renders and nothing else is
  // served. The ceiling is what makes the no-pause console survivable — the
  // deadly failure mode was an UNBOUNDED drain at fragmented heap holding
  // the loop for over a minute, which reads as "the device is dead". Five
  // seconds covers every page at module-resident heap (measured 0.5–4.4 s);
  // a send that cannot finish inside it is talking to a starved socket or a
  // hung client, and the browser retrying beats the panel freezing.
  const uint32_t startedMs = millis();
  const uint32_t BUDGET_MS = 5000;
  while (offset < total && client.connected()) {
    if (millis() - startedMs > BUDGET_MS) break;
    size_t n = total - offset;
    if (n > sizeof(slice)) n = sizeof(slice);
    memcpy_P(slice, pgm + offset, n);
    size_t wrote = client.write(slice, n);
    if (wrote == 0) {
      // Socket buffer full. Brief waits only — the budget above is the cap.
      if (++stalls > 100) break;
      delay(2);
      continue;
    }
    stalls = 0;
    offset += wrote;
    yield();
  }
}

}  // namespace PFSend
