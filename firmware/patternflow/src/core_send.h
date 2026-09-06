// ═══════════════════════════════════════════════════════════
// PatternFlow - low-heap PROGMEM page sender
//
// WebServer's send_P delivered every console page for a year — until a
// resident module put internal heap near 7 KB, where big sends silently
// truncate at whatever the socket manages (~5.6 KB) and the page arrives
// with its script cut mid-statement. The old answer was to EVICT the module
// before serving (pause the pattern for the console). This is the new one:
// copy slices out of flash and hand-feed the socket, tolerating a full TCP
// window instead of giving up on it. The difference from send_P is not
// chunking (send_P also writes in pieces); it is the retry. Measured: 24 KB
// delivers reliably this way at heaps where send_P loses 3/4 of a 20 KB page.
//
// WHERE this runs decides what giving up may cost, and that changed in
// 3.9.1. Until then the drain ran inside loop(): nothing rendered while a
// page went out, and a HARD 5 s budget was the difference between a slow
// page and a panel that reads as dead. Since 3.9.1 handlers run on the
// network task (core_net_task.h, Core 0) and the render never sees a page
// send — but the budget was kept, and on a slow link it became the bug it
// had guarded against. Measured 2026-09-06 on a panel whose link moved
// 2–5 KB/s — round trips of ~0.4 s with retransmissions, and the Wi-Fi
// driver's eight transmit buffers shared with a MIDI stream; the TCP window
// alone would have allowed ten times that — every page over ~15 KB arrived
// cut short with the header already promising the full Content-Length:
// 25088 of 26551 bytes for /, 18432 of 37520 for /patterns, never more than
// 41 KB of a 63 KB feature page. The budget did exactly what it said, five
// seconds past the point where it made anything better.
//
// So there are two policies now, chosen by PFLoopSync::onLoopTask():
//   - On the loop task (the single-core fallback when the network task
//     could not be created, or a handler that came through
//     PFLoopSync::run) the render still pays for every millisecond spent
//     here, and the 5 s cap stays.
//   - On the network task nobody waits but the browser. A send is
//     abandoned only when it stops making PROGRESS — no byte accepted for
//     ~20 s — or reaches a generous ceiling, 120 s, which exists so a peer
//     trickling one segment a minute cannot hold the one-connection
//     server forever.
// In both cases an abandoned send CUTS the connection, so the peer sees the
// transfer die (curl: "transfer closed with N bytes remaining"; a browser: a
// network error and a retry) instead of rendering a page whose script ends
// mid-word.
//
// Pages go out gzip-compressed (gz() below; the arrays are generated right
// after each page's literal, in the same header): a third of the bytes, so
// a third of the round trips, on exactly the links where round trips are
// the whole cost.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <pgmspace.h>
#include "webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall (see src/webserver/VENDORED.md)
#include "core_loop_sync.h"       // onLoopTask(): which of the two budgets applies

namespace PFSend {

// One TCP segment (TCP_MSS 1436 in this sdkconfig) per write(), up from 512.
// Each write hands lwIP a segment it can send whole instead of three it has
// to coalesce, and a 17 KB page is 13 syscalls instead of 34. The buffer is
// on the caller's stack: the network task has 8 KB with ~5.9 KB never used
// (netStackMin in /api/status), so the extra 924 bytes are paid for.
constexpr size_t SLICE_BYTES = 1436;

// Loop task: the render is stalled for the duration, and five seconds covers
// every page at module-resident heap (measured 0.5–4.4 s before gzip made
// each of them smaller). Checked between slices; one write() can itself wait
// up to 10 s on a dead peer (see drain), as it always could.
constexpr uint32_t LOOP_BUDGET_MS = 5000;
// Network task: give up on a peer that has accepted nothing for this long...
constexpr uint32_t NET_STALL_MS = 20000;
// ...or on a transfer that has outlived any honest link, however slowly it
// is still moving.
constexpr uint32_t NET_CEILING_MS = 120000;

// End a response the peer must not mistake for complete. Nothing lingers:
// the vendored WebServer lets go of its client the moment the handler
// returns (its keep-the-client-around branch is commented out), lwIP queues
// the FIN behind whatever the window still holds, and the peer gets a body
// shorter than the Content-Length it was promised — curl says "transfer
// closed with N bytes remaining", a browser reports the mismatch — instead
// of a page whose script ends mid-word looking complete. stop() here only
// drops this copy's handle and marks it disconnected, which is what ends the
// drain loop; the log line is the part that matters.
inline void cut(WiFiClient& client, size_t sent, size_t total, uint32_t elapsedMs) {
  Serial.printf("[SEND] cut at %u/%u bytes after %lu ms\n",
                (unsigned)sent, (unsigned)total, (unsigned long)elapsedMs);
  client.stop();
}

// The drain shared by progmem() and gz(): the headers are already out, and
// `total` bytes at `src` (flash or RAM) still have to reach the socket.
inline void drain(WebServer& server, const uint8_t* src, size_t total) {
  WiFiClient client = server.client();
  const bool onLoop = PFLoopSync::onLoopTask();
  const uint32_t startedMs = millis();
  uint32_t lastProgressMs = startedMs;
  size_t offset = 0;
  uint8_t slice[SLICE_BYTES];
  while (offset < total && client.connected()) {
    const uint32_t now = millis();
    const bool giveUp = onLoop
        ? (now - startedMs > LOOP_BUDGET_MS)
        : (now - lastProgressMs > NET_STALL_MS || now - startedMs > NET_CEILING_MS);
    if (giveUp) {
      cut(client, offset, total, now - startedMs);
      return;
    }
    size_t n = total - offset;
    if (n > sizeof(slice)) n = sizeof(slice);
    memcpy_P(slice, src + offset, n);
    const size_t wrote = client.write(slice, n);
    if (wrote == 0) {
      // WiFiClient::write() has already waited: it select()s for up to
      // WIFI_CLIENT_SELECT_TIMEOUT_US (1 s) per try, WIFI_CLIENT_MAX_WRITE_RETRY
      // (10) tries, before returning 0 with nothing sent — so a zero here is
      // usually ten seconds old, and NET_STALL_MS is two of them. It also
      // returns 0 at once when select() itself fails; the short sleep keeps
      // that case from spinning. The task watchdog on Core 0 expects the
      // idle task to run every 5 s, and a handler spinning there is a
      // reboot, not a slow page.
      delay(5);
      continue;
    }
    offset += wrote;
    lastProgressMs = millis();
    // A tick between slices rather than yield(): yield() gives way only to
    // tasks of equal or higher priority, and the one that has to get a turn
    // is IDLE0, which the watchdog watches. Costs a 17 KB page ~13 ms.
    delay(1);
  }
}

// Serve a PROGMEM literal as-is. Still the right call for a body that is not
// precompressed (a feature page whose header has no gzip array yet).
// cacheControl lets immutable assets keep their max-age.
inline void progmem(WebServer& server, const char* pgm,
                    const char* contentType = "text/html",
                    const char* cacheControl = "no-store") {
  const size_t total = strlen_P(pgm);
  server.sendHeader("Cache-Control", cacheControl);
  server.setContentLength(total);
  server.send(200, contentType, "");
  drain(server, reinterpret_cast<const uint8_t*>(pgm), total);
}

// Serve precompressed bytes with Content-Encoding: gzip (header before
// send(), the way WebServer::serveStatic announces a .gz file). Sent to
// every client regardless of Accept-Encoding: every browser decodes gzip,
// and honouring the header would keep the raw literal referenced — and in
// the image, at 2.5–3.5× the size — for the sake of curl without
// --compressed.
inline void gz(WebServer& server, const uint8_t* gzBytes, size_t len,
               const char* contentType = "text/html",
               const char* cacheControl = "no-store") {
  server.sendHeader("Cache-Control", cacheControl);
  server.sendHeader("Content-Encoding", "gzip");
  server.setContentLength(len);
  server.send(200, contentType, "");
  drain(server, gzBytes, len);
}

}  // namespace PFSend
