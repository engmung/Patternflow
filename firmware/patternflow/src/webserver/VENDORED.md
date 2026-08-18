# Vendored: WebServer (arduino-esp32 core 2.0.17)

Copied verbatim from the Arduino core's bundled library
(`libraries/WebServer/src`, core 2.0.17 / IDF 4.4.7), plus **one Patternflow
fix**. Same arrangement as `src/hub75` and `src/pubsubclient`: every firmware
include points at this copy (`#include "webserver/WebServer.h"`), so the
Library Manager / core-bundled version is never compiled and its version does
not matter.

## The fix (Parsing.cpp, raw body loop)

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

Marked `PATTERNFLOW FIX` at the site.

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
the raw-loop fix above must survive. If the project ever moves to core 3.x,
this directory can be deleted and the includes pointed back at
`<WebServer.h>`.
