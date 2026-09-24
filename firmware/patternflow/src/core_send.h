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
// And since the console UX pass, most of them do not go out at all. The
// cheapest page on a slow link is the one the browser already has, so gz()
// also decides how a page may be cached (the policies below): a page URL
// that names the running build (?v=, core_build.h) is immutable, a bare one
// revalidates with an ETag and costs a 304, and the chrome is keyed by its
// own CRC (?h=). Every page handler gets that without passing anything.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <pgmspace.h>
#include <lwip/sockets.h>
#include <errno.h>
#include "core_net_maintenance.h"
#include "webserver/WebServer.h"  // vendored: fixes the 5 s final-chunk stall (see src/webserver/VENDORED.md)
#include "core_loop_sync.h"       // onLoopTask(): which of the two budgets applies
#include "core_build.h"           // PFBuild::id(): the build a page's ?v= must name

namespace PFSend {

// One TCP segment (TCP_MSS 1436 in this sdkconfig) per write(), up from 512.
// Each write hands lwIP a segment it can send whole instead of three it has
// to coalesce, and a 17 KB page is 13 syscalls instead of 34. The buffer is
// on the caller's stack: the network task has 8 KB with ~5.9 KB never used
// (netStackMin in /api/status), so the extra 924 bytes are paid for.
constexpr size_t SLICE_BYTES = 1436;

// Loop task: the render is stalled for the duration, and five seconds covers
// every page at module-resident heap (measured 0.5–4.4 s before gzip made
// each of them smaller). Checked between nonblocking send attempts.
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
    PFNetMaintenance::poll();
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
    // WiFiClient::write can retry internally for ~10 s. A nonblocking socket
    // send gives this loop ownership of the existing progress/stall budgets.
    const int wrote = ::send(client.fd(), slice, n, MSG_DONTWAIT);
    if (wrote < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
      cut(client, offset, total, millis() - startedMs);
      return;
    }
    if (wrote <= 0) {
      // Preserve slow-link tolerance without starving maintenance or IDLE0.
      delay(5);
      continue;
    }
    offset += wrote;
    lastProgressMs = millis();
    if (offset >= total) {
      const uint32_t took = millis() - startedMs;
      if (took > 500) Serial.printf("[SEND] %u bytes in %lu ms\n", (unsigned)total, (unsigned long)took);
    }
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

// ── Cache policies for gz() ────────────────────────────────────────────
//
// gz()'s last argument is one of these two, or a literal Cache-Control
// value, which is sent as is with no ETag and never answered with a 304 (the
// behaviour every caller had before the policies). They are told apart by
// address, never by content.
//
//   PAGE     an HTML page; the default, so every page handler, core or
//            feature, has it without being edited. ?v= names a build:
//            empty -> no-cache + ETag (typed URLs, bookmarks and ?src=
//            handoffs revalidate, so they are never stale); the running
//            build -> immutable + ETag; any other -> 302 to the same URL
//            with v= the running build.
//   STAMPED  the console chrome. ?h= is its CRC, stamped into each page by
//            console_pages.py: its own CRC -> immutable + ETag; another ->
//            the current bytes with no-store and no ETag, so a mismatched
//            copy is never kept under the old key; none -> no-cache + ETag.
//
// Neither lets a browser keep anything unless the Host can only be the panel
// (hostCacheable; otherwise no-store, no ETag, a plain 200). On the hotspot
// every DNS name resolves to the panel, and a phone must never store the
// console under the origin of a site it was trying to reach.
//
// The ETag is weak and names the uncompressed payload (the CRC and length
// from the gzip trailer), so Range must never be implemented for these
// bodies: a byte range needs a strong validator over the bytes that are sent,
// and these are the compressed ones.
inline constexpr char PAGE[] = "(page policy)";
inline constexpr char STAMPED[] = "(stamped policy)";

constexpr const char* CC_IMMUTABLE = "public, max-age=31536000, immutable";
constexpr const char* CC_REVALIDATE = "no-cache";
constexpr const char* CC_NO_STORE = "no-store";

// CRC-32 and ISIZE, the last eight bytes of a gzip member (little-endian).
// False when the array is too short to be one: 10 bytes of header, at least
// an empty deflate block, 8 of trailer.
struct Trailer {
  uint32_t crc;
  uint32_t isize;
};

inline bool trailerOf(const uint8_t* gzBytes, size_t len, Trailer& out) {
  if (!gzBytes || len < 18) return false;
  uint8_t b[8];
  memcpy_P(b, gzBytes + len - 8, 8);
  out.crc = (uint32_t)b[0] | (uint32_t)b[1] << 8 | (uint32_t)b[2] << 16 | (uint32_t)b[3] << 24;
  out.isize = (uint32_t)b[4] | (uint32_t)b[5] << 8 | (uint32_t)b[6] << 16 | (uint32_t)b[7] << 24;
  return true;
}

// W/"<crc %08x>-<isize %x>": at most 22 bytes with the NUL.
constexpr size_t ETAG_BYTES = 24;
inline void formatEtag(const Trailer& t, char* out, size_t outSize) {
  snprintf(out, outSize, "W/\"%08x-%x\"", (unsigned)t.crc, (unsigned)t.isize);
}

// If-None-Match against our tag, by weak comparison (W/ ignored on both
// sides). The header may list several tags; "*" matches anything.
inline bool inmMatches(const char* inm, const char* etag) {
  if (!inm || !etag) return false;
  if (etag[0] == 'W' && etag[1] == '/') etag += 2;
  const size_t want = strlen(etag);
  const char* p = inm;
  while (*p) {
    while (*p == ' ' || *p == '\t' || *p == ',') ++p;
    if (!*p) break;
    if (*p == '*') return true;
    if (p[0] == 'W' && p[1] == '/') p += 2;
    if (*p == '"') {
      const char* close = strchr(p + 1, '"');
      if (!close) return false;
      if ((size_t)(close - p) + 1 == want && memcmp(p, etag, want) == 0) return true;
      p = close + 1;
    }
    while (*p && *p != ',') ++p;  // the rest of a malformed entry
  }
  return false;
}

inline bool isIpv4(const char* s, size_t n) {
  int parts = 0, digits = 0, value = 0;
  for (size_t i = 0; i <= n; ++i) {
    if (i == n || s[i] == '.') {
      if (digits == 0 || value > 255) return false;
      ++parts;
      digits = value = 0;
    } else if (s[i] >= '0' && s[i] <= '9' && digits < 3) {
      value = value * 10 + (s[i] - '0');
      ++digits;
    } else {
      return false;
    }
  }
  return parts == 4;
}

// Can a response to this Host header be the panel's own, to keep? An IPv4
// literal, a name without a dot (NetBIOS `patternflow`, an IPv6 literal) or
// a .local name: yes. Anything else, or no Host at all: no. The vendored
// parser does not clear the Host between requests, so a request without
// one is judged by the previous request's; every browser sends Host.
inline bool hostCacheable(const char* host) {
  if (!host || !*host) return false;
  size_t n = strlen(host);
  const char* colon = strrchr(host, ':');
  if (colon && colon[1]) {
    bool digits = true;
    for (const char* p = colon + 1; *p; ++p) {
      if (*p < '0' || *p > '9') digits = false;
    }
    // "[::1]:80" has its port after the bracket; a bare "fe80::1" has none.
    const bool port = host[0] == '['
        ? colon > host && colon[-1] == ']'
        : memchr(host, ':', (size_t)(colon - host)) == nullptr;
    if (digits && port) n = (size_t)(colon - host);
  }
  if (n && host[n - 1] == '.') --n;  // "patternflow.local." is the same name
  if (!n) return false;
  if (isIpv4(host, n)) return true;
  if (!memchr(host, '.', n)) return true;
  static const char kLocal[] = ".local";
  const size_t k = sizeof(kLocal) - 1;
  if (n <= k) return false;
  for (size_t i = 0; i < k; ++i) {
    char c = host[n - k + i];
    if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
    if (c != kLocal[i]) return false;
  }
  return true;
}

enum class Reply : uint8_t { Full, NotModified, Redirect };

struct Decision {
  Reply reply;
  const char* cacheControl;  // Full and NotModified
  bool etag;                 // send the ETag with it
};

// The whole policy as one pure function, decided before a single header is
// queued: `param` is the request's v (PAGE) or h (STAMPED), empty when
// absent, and `expected` what it must equal to be immutable — the running
// build, or this asset's own CRC.
inline Decision decide(bool stamped, bool cacheable, const char* param,
                       const char* expected, const char* inm, const char* etag) {
  if (!cacheable) return {Reply::Full, CC_NO_STORE, false};
  const bool bare = !param || !*param;
  if (!bare && strcmp(param, expected) != 0) {
    // A page moves to the running build's URL; the chrome has no URL to
    // move to (the page names it), so it goes out current and unkept.
    return {stamped ? Reply::Full : Reply::Redirect, CC_NO_STORE, false};
  }
  const char* cc = bare ? CC_REVALIDATE : CC_IMMUTABLE;
  return {inmMatches(inm, etag) ? Reply::NotModified : Reply::Full, cc, true};
}

// Query-component escaping: unreserved characters as they are, the rest %XX.
template <class Str>
inline void appendEscaped(Str& out, const char* s) {
  static const char hex[] = "0123456789ABCDEF";
  for (; *s; ++s) {
    const uint8_t c = (uint8_t)*s;
    if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
        c == '-' || c == '.' || c == '_' || c == '~') {
      out += (char)c;
    } else {
      const char esc[4] = {'%', hex[c >> 4], hex[c & 15], '\0'};
      out += esc;
    }
  }
}

// PAGE with a v naming another build: send the browser to the running one,
// the same path with every other query argument kept, in order. Relative, so
// the Host is whatever the browser used. Only a GET's arguments are the
// query; a body's never go into a URL.
inline void redirectToBuild(WebServer& server) {
  auto location = server.uri();
  bool first = true, sawV = false;
  const int count = server.method() == HTTP_GET ? server.args() : 0;
  for (int i = 0; i < count; ++i) {
    const auto key = server.argName(i);
    location += first ? '?' : '&';
    first = false;
    appendEscaped(location, key.c_str());
    location += '=';
    if (strcmp(key.c_str(), "v") == 0) {
      location += PFBuild::id();
      sawV = true;
    } else {
      appendEscaped(location, server.arg(i).c_str());
    }
  }
  if (!sawV) {
    location += first ? '?' : '&';
    location += "v=";
    location += PFBuild::id();
  }
  server.sendHeader("Location", location);
  server.sendHeader("Cache-Control", CC_NO_STORE);
  server.send(302, "text/plain", "");
}

// Serve precompressed bytes with Content-Encoding: gzip (header before
// send(), the way WebServer::serveStatic announces a .gz file). Sent to
// every client regardless of Accept-Encoding: every browser decodes gzip,
// and honouring the header would keep the raw literal referenced — and in
// the image, at 2.5–3.5× the size — for the sake of curl without
// --compressed.
//
// A 304 carries the Content-Length a 200 would have: the vendored server
// writes Content-Length: 0 when none is set, and CONTENT_LENGTH_UNKNOWN
// would switch it to chunked framing, which on a 304 puts a terminating
// chunk where no body may be. With a length set, send() writes the header
// block and nothing else, and _prepareHeader() empties the queued headers,
// so none of these reach the next response.
inline void gz(WebServer& server, const uint8_t* gzBytes, size_t len,
               const char* contentType = "text/html",
               const char* policy = PAGE) {
  const bool managed = policy == PAGE || policy == STAMPED;
  Trailer trailer;
  if (!managed || !trailerOf(gzBytes, len, trailer)) {
    server.sendHeader("Cache-Control", managed ? CC_NO_STORE : policy);
    server.sendHeader("Content-Encoding", "gzip");
    server.setContentLength(len);
    server.send(200, contentType, "");
    drain(server, gzBytes, len);
    return;
  }

  const bool stamped = policy == STAMPED;
  char etag[ETAG_BYTES];
  formatEtag(trailer, etag, sizeof(etag));
  char crc[9];
  snprintf(crc, sizeof(crc), "%08x", (unsigned)trailer.crc);
  const auto host = server.hostHeader();
  const auto param = server.arg(stamped ? "h" : "v");
  const auto inm = server.header("If-None-Match");
  const Decision d = decide(stamped, hostCacheable(host.c_str()), param.c_str(),
                            stamped ? crc : PFBuild::id(), inm.c_str(), etag);

  if (d.reply == Reply::Redirect) {
    redirectToBuild(server);
    return;
  }
  if (d.reply == Reply::NotModified) {
    server.sendHeader("ETag", etag);
    server.sendHeader("Cache-Control", d.cacheControl);
    server.setContentLength(len);
    server.send(304, contentType, "");
    return;
  }
  server.sendHeader("Cache-Control", d.cacheControl);
  if (d.etag) server.sendHeader("ETag", etag);
  server.sendHeader("Content-Encoding", "gzip");
  server.setContentLength(len);
  server.send(200, contentType, "");
  drain(server, gzBytes, len);
}

// A 204 kept for a year, under the same Host rule as pages: an empty answer
// stored under another site's origin would hide that site's own for as long.
// The vendored server writes Content-Length: 0 on it; browsers accept that.
inline void noContent(WebServer& server) {
  server.sendHeader("Cache-Control",
                    hostCacheable(server.hostHeader().c_str()) ? CC_IMMUTABLE : CC_NO_STORE);
  server.send(204);
}

}  // namespace PFSend
