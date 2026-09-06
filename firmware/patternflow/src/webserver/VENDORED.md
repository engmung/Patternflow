# Vendored: WebServer (arduino-esp32 core 2.0.17)

Copied verbatim from the Arduino core's bundled library
(`libraries/WebServer/src`, core 2.0.17 / IDF 4.4.7), plus **two Patternflow
fixes**. Same arrangement as `src/hub75` and `src/pubsubclient`: every firmware
include points at this copy (`#include "webserver/WebServer.h"`), so the
Library Manager / core-bundled version is never compiled and its version does
not matter.

## Fix 1 (Parsing.cpp, raw body loop): ask for what remains

Stock 2.x reads the raw request body with

```cpp
client.readBytes(_currentRaw->buf, HTTP_RAW_BUFLEN);
```

`readBytes` blocks until it fills the **whole** buffer or the 5 s stream
timeout expires. The final chunk of a body is almost never a whole buffer, so
every raw `PUT` — which is how the console installs every pattern — stalled
for the timeout before completing. Measured on hardware: a 1,436-byte body
(exactly `HTTP_RAW_BUFLEN`) completes in 0.4 s, a 1,437-byte body in 5.5 s.

The fix asks for exactly the bytes that remain, which is what the core 3.x
rewrite of this loop does:

```cpp
size_t remaining = _clientContentLength - _currentRaw->totalSize;
size_t want = remaining < (size_t)HTTP_RAW_BUFLEN ? remaining : (size_t)HTTP_RAW_BUFLEN;
_currentRaw->currentSize = client.readBytes(_currentRaw->buf, want);
```

Marked `PATTERNFLOW FIX` at the site. (Fix 2 below later turned that
`client.readBytes()` into `readBody()`; the "ask for what remains" part is
unchanged.)

## Fix 2 (Parsing.cpp readers): no spinning on Core 0

Stock reads the request line, every header and the raw body with
`client.readStringUntil('\r')` / `client.readBytes()`. Both sit on Arduino's
`Stream::timedRead()` (`cores/esp32/Stream.cpp`), which is

```cpp
do { c = read(); if (c >= 0) return c; } while (millis() - _startMillis < _timeout);
```

over a non-blocking `read()` — a pure spin, no yield. The timeout bounds the
gap between two bytes, not the request: a request that trickles in keeps the
spin alive for as long as it trickles.

Since 3.9.1 this server is serviced by `pf-net`, a task pinned to Core 0
(`src/core_net_task.h`). The Task WDT watches Core 0's idle task with a 5 s
panic (`CONFIG_ESP_TASK_WDT_CHECK_IDLE_TASK_CPU0`, `CONFIG_ESP_TASK_WDT_PANIC`;
Core 1's idle task is not watched). A spinning `pf-net` starves IDLE0, so a
request that keeps the spin busy for 5 s reboots the board. Before 3.9.1 the
same spin ran on Core 1 and only froze the render. Seen 2026-09-06 on a board
whose Wi-Fi link had ≈400 ms RTT and 8 % loss: pages arrived truncated and the
board rebooted spontaneously with the console open (reset reason not
captured; this is the only unyielding loop on Core 0 that was found).

The fix is three file-local helpers at the top of Parsing.cpp —
`waitForByte()`, `readLine()`, `readBody()` — that wait with `delay(1)`
between checks, bounded by the client's stream timeout exactly as
`timedRead()` was, and give up when the client disconnects. Every
`readStringUntil('\r')` + `readStringUntil('\n')` pair in the file (request
line, both header loops, the multipart parser) is now `readLine(client)`; the
raw-body loop's `readBytes()` is now `readBody()`. Callers see what they saw
before: a line without its CR/LF, an empty String on timeout (which still
ends the header block), a short body on timeout (which still aborts the
request). `readBytesWithTimeout()` and `_uploadReadByte()` already delayed
and are untouched.

Two deliberate small differences from stock. `readLine()` only waits for the
LF once it has seen a CR, so a read that times out no longer spends a second
timeout waiting for an LF that is not coming. And the multipart parser's
"retry an empty first line" loop now retries whole lines, so a body that
opens with a blank line before its boundary is accepted rather than rejected.

Marked `PATTERNFLOW FIX` at the readers and at each call site.

Considered and dropped at the same time: a per-client `setNoDelay(true)` in
`handleClient()`, on the theory that Nagle was holding the small second write
of every reply for a round trip. It already is off — stock `WebServer::begin()`
calls `_server.setNoDelay(true)` and `WiFiServer::available()` writes that
flag into `TCP_NODELAY` on every accepted socket. Slow small replies on a bad
link are the link, not Nagle; do not re-add the call.

## Why vendor instead of upgrading the core

The core 3.x builds fix this loop but cost ~71 KB of internal RAM before the
sketch starts (mostly a bigger cache carve-out), which is what stops large
`.pfm` modules loading at all — see the platformio.ini header. Vendoring lets
the firmware keep core 2.x's memory layout and core 3.x's upload behaviour.

The multipart upload path (`/update`, browser firmware update) still uses the
stock byte-at-a-time parser and is ~30 % slower than core 3.x on bulk
transfers. That is parser cost, not a stall, and updates are rare — left
alone deliberately. Port the core 3.x buffered `_uploadReadByte` here if it
ever matters.

## Updating this copy

Diff against the core's `libraries/WebServer/src` before replacing wholesale;
both fixes above must survive (grep `PATTERNFLOW FIX`, `readLine`,
`readBody`). If the project ever moves to core 3.x, this directory can be
deleted and the includes pointed back at `<WebServer.h>` — but check first
that its parser yields between bytes; the Core-0 watchdog does not care which
version is spinning.
