"""The device console, on your laptop, with fake device data.

    python firmware/toolchain/console_serve.py        # http://localhost:8322

Every console page, served from console/*.html straight off disk, with the
shared chrome pulled live out of theme_index.h and every /api/* endpoint
answered from fixtures captured off a real panel. Edit the HTML, hit
refresh, see it. No build, no flash, no device — and devtools work, which
they never did against PROGMEM.

The state is real enough to design against: selecting a pattern moves the
active marker, forgetting a Wi-Fi network removes the row, sleep toggles.
It is in memory only and resets when you restart the server.

Capabilities decide which pages the nav offers, and a build genuinely may
not have them — so you can look at both:

    /mock?caps=bare                    core only (no Sequences/Audio/MQTT/Weather)
    /mock?caps=full                    everything (the default)
    /mock?caps=patterns,params,shows   whatever you want to see
    /mock?variant=simone-pd            pretend this is somebody else's firmware
    /mock?hotspot=1                    /api/status says you are on its hotspot
    /mock?busy=update                  ...or busy (update, storage; empty clears)

What this is NOT: the firmware. It answers the same URLs with the same
JSON shapes, and that is all it promises. Behaviour that lives in C++ —
what the panel does, whether an upload actually parses — is not modelled
here, and a page that works against the mock still has to be tried on a
device before you believe it.

One exception, because one page is an editor: /audio-in. Its endpoints
(/api/audio-in, /api/audio-in/reset, /api/audio) are a port of the firmware's
handlers, not a fixture: a request changes only the fields it carries, the
pairs settle as they do on the panel, a bad curve table is ignored with
{"ok":true}, replies have the handler's field order and decimals. The
sound is made up; what is done with it is not. And what the panel hears is
a state you pick, each entered as if it had been so for a while (each of
these addresses lands on /audio-in):

    /mock?audio=music     the microphone on, a room with music in it (the default)
    /mock?audio=silence   on, a quiet room: the gates shut, every knob at rest
    /mock?audio=off       switched off after music: the analysis is parked and
                          the poll's numbers are the last window's, not zeros
    /mock?audio=fresh     a panel nobody has configured: off, nothing heard,
                          nothing learned, the factory mapping
    /mock?audio=nomic     on, nothing on the data pin:
                          source "pdm (no mic - data pin idle)"
    /mock?audio=stalled   on, the microphone stopped answering: source
                          "synth (mic stalled)", and the numbers are the
                          built-in test tones (levels far above 1), not a room
    /mock?audio=phone     off, the phone app posting monitor frames: source
                          "phone", ext:true, its own 0..1 units - while levelsN
                          and outputs stay the microphone's stale ones
    /mock?audio=ext       off, the browser extension holding the :81 socket
                          (audioClients 1); nothing of its sound reaches a page
    /mock?audio=noread    the configuration read (GET /api/audio-in) gets no
                          reply, and only that: the poll and every POST still
                          answer. Any other state ends it.

The switches on the page work from any of them (mic=1 says "synth" for the
quarter second the driver takes, as on the panel), and the routes follow the
caps: /mock?caps=patterns,params,sleep,audio-in is the microphone without the
browser path, where /api/audio is a 404.

Pages and the chrome, though, go out exactly as the panel sends them
(src/core_send.h): each page stamped by console_pages.py's own code (the
chrome's ?h= and the fallback PF), with the same ETag, the same 304, and the
same cache policy — `?v=<build>` immutable, a stale `v` 302'd to the
current one, bare URLs revalidated, the chrome immutable only under its own
`h`, and nothing cacheable under a Host that is not an address, a bare name
or .local. The build here changes whenever a page, the chrome or the
fallback is saved, so a saved edit still shows on refresh: the old `v` is
redirected. /audio-in is not read off disk: it is assembled from its sources
(build_audio_in_page.py, on every request), so saving the editor, the
adapter or the panel's CSS shows on refresh like any other page.

The link can be made as bad as the panel's. On the desk every request is
instant and parallel; on the panel's own hotspot it is a phone in power
save talking to a one-connection server, and that is where the console is
slow. These make the desk that slow:

    --device         gzip on the wire, as the panel sends it
    --rtt 0.4        round trip in seconds; every request is a fresh
                     connection (Connection: close), and every 5,760 bytes
                     of a reply waits one more round trip for its ACK
    --bps 5000       reply bandwidth, bytes per second
    --serial         one request at a time, like the panel's server
    --slow           all four at hotspot-like values
    --host 0.0.0.0   listen beyond localhost, to try it from a phone
    --chrome404      /pf-console.js answers 404: the pages run on the
                     fallback PF stamped into them
    --sketch DIR     serve another copy of firmware/patternflow

Timing something on the desk? Open it as http://127.0.0.1:8322. This listens
on IPv4 only, a browser tries IPv6 first under the name localhost, and every
request here is a connection of its own - so that detour is paid each time
(Chromium on Windows: /audio-in polls 9.4 times a second under 127.0.0.1 and
4.8 under localhost).
"""

import argparse
import gzip
import json
import math
import threading
import time
import os
import posixpath
import random
import re
import struct
import sys
import urllib.parse
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SKETCH = os.path.normpath(os.path.join(HERE, "..", "patternflow"))
HTML_DIR = os.path.join(SKETCH, "console")

sys.path.insert(0, HERE)
import console_pages  # noqa: E402  the stamp is its code, not a copy of it
import build_audio_in_page  # noqa: E402  /audio-in is assembled, by its code

PORT = int(os.environ.get("PF_CONSOLE_PORT", "8322"))

# URL -> console/<name>.html. Mirrors the routes the firmware registers.
ROUTES = {
    "/": "home",
    "/patterns": "patterns",
    "/status": "status",
    "/wifi": "wifi",
    "/knobs": "knobs",
    "/update": "update",
    "/show": "show",
    "/weather": "weather",
    "/mqtt": "mqtt",
    "/audio-in": "audio-in",
    "/midi": "midi",
    "/clock": "clock",
}


class Link:
    """How bad the pretend link is. Zeroes are the desk: instant, parallel."""
    device = False
    rtt = 0.0
    bps = 0
    serial = False
    chrome404 = False
    lock = threading.Lock()


# The panel's cache policies (src/core_send.h: PFSend::PAGE and ::STAMPED).
IMMUTABLE = "public, max-age=31536000, immutable"
REVALIDATE = "no-cache"
NO_STORE = "no-store"
DESK_CACHE = "no-cache"
TCP_WINDOW = 5760  # lwIP TCP_SND_BUF on the panel: one round trip per this many bytes


def payload_etag(payload):
    """The panel's ETag for a page: CRC32 and length of the uncompressed bytes,
    straight out of the gzip trailer it stores - so the same page gets the same
    tag here and on the device. Weak, because the bytes on the wire are gzip
    and the tag names what they decompress to."""
    return 'W/"%08x-%x"' % (zlib.crc32(payload) & 0xFFFFFFFF, len(payload) & 0xFFFFFFFF)


def etag_matches(header, tag):
    """PFSend::inmMatches: If-None-Match by weak comparison - `*`, or any
    listed quoted tag equal to ours once each side has lost its W/."""
    if not header:
        return False
    want = tag[2:] if tag.startswith("W/") else tag
    for t in header.split(","):
        t = t.strip(" \t")
        if t.startswith("*"):
            return True
        t = t[2:] if t.startswith("W/") else t
        end = t.find('"', 1)
        if t.startswith('"') and end > 0 and t[:end + 1] == want:
            return True
    return False


def host_cacheable(host):
    """PFSend::hostCacheable: whether a browser may keep the console under
    this Host. The hotspot answers every DNS name with the panel, so only a
    name that can mean this panel - an IPv4 address, a name without a dot
    (NetBIOS, an IPv6 literal) or a .local - gets a cacheable reply."""
    h = host or ""
    colon = h.rfind(":")
    if colon >= 0 and h[colon + 1:].isdigit():
        # "[::1]:80" has its port after the bracket; a bare "fe80::1" has none
        port = h[colon - 1:colon] == "]" if h.startswith("[") else ":" not in h[:colon]
        if port:
            h = h[:colon]
    if h.endswith("."):
        h = h[:-1]  # "patternflow.local." is the same name
    if not h:
        return False
    parts = h.split(".")
    if len(parts) == 4 and all(p.isdigit() and len(p) <= 3 and int(p) <= 255 for p in parts):
        return True
    return "." not in h or (len(h) > 6 and h[-6:].lower() == ".local")

# Assets the device serves out of its own headers, extracted live so a change
# to the shared chrome shows up on refresh like everything else.
RAW_ASSETS = {
    "/pf-console.js": ("src/theme_index.h", "JS", "application/javascript"),
    "/patterns/fflate.js": ("src/fflate_js.h", "FFLATE", "application/javascript"),
}
CHROME_SRC = RAW_ASSETS["/pf-console.js"][:2]

CAPS_FULL = ["patterns", "params", "sleep", "osc", "shows", "weather", "mqtt", "clock",
             "audio", "audio-in", "midi"]
CAPS_BARE = ["patterns", "params", "sleep"]


def feature_nav():
    """cap -> [navPath, navLabel, navDesc], read out of each feature's
    descriptor, so the mock's header shows exactly the tabs a device with those
    caps would - and cannot drift from them."""
    out = {}
    root = os.path.join(SKETCH, "features")
    for d in sorted(os.listdir(root)):
        f = os.path.join(root, d, "feature_%s.h" % d)
        if not os.path.exists(f):
            continue
        text = read(f)
        m = re.search(r'descriptor\s*=\s*\{\s*"[^"]*",[^\n]*\n\s*"([^"]*)"', text)
        path = re.search(r'"([^"]*)",\s*//\s*navPath', text)
        label = re.search(r'"([^"]*)",\s*//\s*navLabel\s*\n', text)
        if not (m and path and label):
            continue
        desc = ""
        rest = text[label.end():]
        dm = re.match(r'((?:\s*"(?:[^"\\]|\\.)*")+)\s*,', rest)
        if dm:
            desc = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', dm.group(1)))
        out[m.group(1)] = [path.group(1), label.group(1), desc]
    return out


def console_build():
    """The panel's `build` changes whenever its pages could have; here, whenever
    a page, the chrome, the fallback or the stamping code is saved - so the
    self-heal path runs on the desk, and an immutable page never outlives
    an edit. The assembled page's sources count too: most of them are not in
    console/ at all (the editor is the extension's)."""
    h = 0
    for name in sorted(os.listdir(HTML_DIR)):
        if name.endswith((".html", ".js")):
            h = zlib.crc32(("%s:%d" % (name, os.stat(os.path.join(HTML_DIR, name)).st_mtime_ns)).encode(), h)
    for f in (os.path.join(SKETCH, "src", "theme_index.h"), os.path.join(HERE, "console_pages.py")):
        h = zlib.crc32(str(os.stat(f).st_mtime_ns).encode(), h)
    for f in build_audio_in_page.sources(SKETCH) + [build_audio_in_page.__file__]:
        try:
            h = zlib.crc32(str(os.stat(f).st_mtime_ns).encode(), h)
        except OSError:
            h = zlib.crc32(b"missing", h)   # assemble() says which, when the page is asked for
    return "%08x" % (h & 0xFFFFFFFF)
# What the hotspot's channel scan "saw", for the /wifi page's name suggestions.
SEEN_NETWORKS = ["wifiiii", "SK_WiFiGIGA7A1C", "olleh_WiFi_2F3B", "U+Net4E21", "iptime"]


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def raw_literal(rel, tag):
    text = read(os.path.join(SKETCH, rel.replace("/", os.sep)))
    m = re.search('R"' + tag + r"\((.*?)\)" + tag + '";', text, re.S)
    if not m:
        raise RuntimeError(rel + ": no R\"" + tag + '( literal')
    return m.group(1)


# ── mock device state ────────────────────────────────────────────────────
# Seeded from a real panel's responses (v3.6.3, 128x64), then padded out:
# three Wi-Fi networks and a few shows, because a list with one row hides
# every layout problem a list with several would show you.
class Device:
    def __init__(self):
        self.caps = list(CAPS_FULL)
        self.variant = "core"
        self.uptime = 748
        self.sleep = False
        self.console_paused = False
        self.active = 0
        self.patterns = [
            {"index": 0, "name": "Origin", "module": None},
            {"index": 1, "name": "Bloom", "module": None},
            {"index": 2, "name": "gogogo", "module": "gogogo"},
            {"index": 3, "name": "Tideline", "module": "tideline"},
        ]
        self.presets = 2
        self.wifi = [
            {"ssid": "wifiiii"},
            {"ssid": "studio-2g"},
            {"ssid": "venue-guest-network-long-name"},
        ]
        self.boot_idx = 0
        self.shows = [
            {"slug": "aramp", "title": "Ease Ramp", "length": 50, "cues": 2, "loop": False},
            {"slug": "nightfall", "title": "Nightfall", "length": 1800, "cues": 24, "loop": True},
            {"slug": "opening", "title": "Opening Sequence", "length": 120, "cues": 9, "loop": False},
        ]
        self.show_playing = False
        self.show_paused = False
        self.show_slug = ""
        self.via_hotspot = False  # /mock?hotspot=1
        self.busy = ""            # /mock?busy=update|storage

    def status(self):
        p = self.patterns[self.active] if self.patterns else None
        hs = getattr(self, "hotspot", {"mode": "auto", "up": False})
        return dict({
            "version": "3.10.4",
            "build": console_build(),
            "variant": self.variant,
            "variantVersion": "" if self.variant == "core" else "v0.4.0",
            "caps": self.caps,
            "featureNav": [FEATURE_NAV[c] for c in self.caps if c in FEATURE_NAV],
            "uptime": self.uptime,
            "resetReason": "power-on",
            "panel": "128x64",
            "wifi": True,
            "ssid": self.wifi[self.boot_idx]["ssid"] if self.wifi else "",
            "ip": "192.168.0.196",
            "rssi": -47,
            "host": "patternflow",
            "hostAlias": "patternflow-a1b2",
            "hotspot": {"mode": hs["mode"], "up": hs["up"], "ssid": "patternflow-a1b2",
                        "ip": "192.168.4.1" if hs["up"] else "", "channel": 6 if hs["up"] else 0,
                        "clients": 0},
            "viaHotspot": self.via_hotspot,
            "busy": self.busy,
            "heapInternal": 82300,
            "heapLargest": 73716,
            "heapPsram": 8336335,
            "fsMounted": True,
            "fsTotal": 10240000,
            "fsUsed": 24576,
            "fsError": "",
            "flashId": "c84018",
            "patterns": len(self.patterns),
            "presets": self.presets,
            "modules": len(self.patterns) - self.presets,
            "active": p["name"] if p else "-",
            "activeIsModule": bool(p and p["module"]),
            "sleep": self.sleep,
            "consolePaused": self.console_paused,
            "frameUs": 16551,
            "presentUs": 9947,
            "loopCore": 1,
            "colorBits": 8,
            "refreshHz": 300,
            "loadError": "",
            "load": {"total": 0, "read": 0, "relocate": 0, "setup": 0},
            "mqttRole": "off",
            "mqttState": "off",
            "mqttConnected": False,
        }, **AUDIO.status(self.caps))   # appended by the features, when the build has them

    def show_state(self):
        cur = next((s for s in self.shows if s["slug"] == self.show_slug), None)
        return {
            "playing": self.show_playing, "paused": self.show_paused,
            "loaded": bool(cur), "loop": False, "t": 0,
            "length": cur["length"] if cur else 0,
            "cues": cur["cues"] if cur else 0,
            "slug": self.show_slug, "title": cur["title"] if cur else "",
            "missing": [], "playlist": False, "playlistLoop": False,
            "playlistIndex": 0, "playlistCount": 0, "playlistSlugs": [],
            "sequenceMode": False, "storedCount": 0, "storedLoop": True,
            "storedSlugs": [], "variance": False, "varianceCue": 2,
            "varianceParam": 0, "schedEnabled": False, "nightAt": "23:00",
            "wakeAt": "07:00", "wakeSlug": "", "repeat": True,
            "nightClock": True, "nightDim": 15,
            "phase": "playing" if self.show_playing else "idle",
            "timeSynced": True, "localTime": "23:13:54", "snoozeMs": 0,
        }


# ── the audio features: /api/audio-in and /api/audio ─────────────────────
#
# Everything else here answers with a fixture. This cannot: /audio-in is an
# editor, and what has to be right on the desk is what the firmware DOES with
# what the page sends it - a request carrying one edge of one box, a pair of
# fields that settle together, a curve table refused without a word, levels
# that are stale rather than zero. A kinder mock hides exactly the mistakes
# that lose somebody's mapping on a panel.
#
# So this part is a port, not a fixture: of features/audio_in/
# core_audio_in_http.h (handleGet, handleSet, applyBandArgs, handleReset,
# parseFrame), core_audio_in_map.h (the defaults, clampRange, the gate, the
# mapping), the analysis task in feature_audio_in.h and the two /api/audio
# routes in features/audio/feature_audio.h - same order of fields, same
# decimals, same clamps, same refusals. docs/rest-api.md ("Microphone") is the
# contract in prose. WHEN ONE OF THOSE HANDLERS CHANGES, CHANGE THIS WITH IT.
#
# What is not ported is the sound. There is no FFT here: Room below is what one
# would have produced, for a room this file makes up.

BIN_HZ = 16000.0 / 512.0             # a 512-point transform at 16 kHz
MAX_BIN = 256
MIN_HZ, MAX_HZ = BIN_HZ, MAX_BIN * BIN_HZ
LUT_POINTS = 33
SPEC_BUCKETS = 64
BAND_FIELDS = ("hzMin", "hzMax", "inMin", "inMax", "gain", "outMin", "outMax", "knob",
               "muted", "lut", "meta")
# core_audio_in_map.h resetBand(): hzMin hzMax inMin inMax gain outMin outMax
BAND_DEFAULTS = ((62.0, 375.0, 0.200, 0.900, 1.0, 0.30, 0.85),
                 (375.0, 1500.0, 0.120, 0.650, 1.2, 0.30, 0.85),
                 (1500.0, 5000.0, 0.045, 0.160, 1.6, 0.30, 0.85),
                 (5000.0, 8000.0, 0.012, 0.030, 1.8, 0.30, 0.85))
AUDIO_ROUTES = ("/api/audio-in", "/api/audio-in/reset", "/api/audio")

# /mock?audio=<state>: the microphone switch, what is on the data pin, whether
# the phone app is posting monitor frames, how many senders hold the :81
# socket. Each is entered as if the panel had been that way for a while.
#
# The start: the gate's noise reference is whatever the first two seconds of
# analysis bottom out at (trackEnvelopes' warm-up), and the first window is
# half empty with the transform's own smoothing climbing from zero - so a
# microphone that comes up in a steady room teaches the reference a fraction
# of the real level, and the gate then stands open on a sound that never
# changes. The real headers do exactly that when built on a host and fed a
# steady tone (reference at half the level, gate open, knob at its top).
# Whether a panel does it in a quiet room depends on what its microphone's
# first windows really hold, and nobody at this desk has measured that. The
# room here starts with a pop (see window()), which lands the reference on
# the floor: the behaviour the firmware's own notes describe. Until a panel
# says otherwise, "silence: every gate shut" is that assumption.
AUDIO_STATES = {
    #           switch, on the pin, phone frames, socket senders
    "music":   (True, "music", False, 0),
    "silence": (True, "silence", False, 0),
    "off":     (False, "music", False, 0),
    "fresh":   (False, "music", False, 0),
    "nomic":   (True, "rail", False, 0),
    "stalled": (True, "tones", False, 0),
    "phone":   (False, "music", True, 1),
    "ext":     (False, "music", False, 1),
}


def f32(v):
    """A C float. Every number the firmware keeps is one, and what it prints is
    the float's value, not the decimal the request carried."""
    try:
        return struct.unpack("f", struct.pack("f", v))[0]
    except OverflowError:
        return math.copysign(math.inf, v)


def fstr(v, prec):
    """Arduino's String(float, prec), which is the ESP32 core's dtostrf: half a
    last digit is added and the rest cut off, digit by digit. Not printf: an
    input gain of 8.25 reads back as 8.3 here and on the panel, 8.2 from '%.1f'."""
    if v != v:
        return "nan"
    if v in (math.inf, -math.inf):
        return "inf"
    neg = v < 0.0
    if neg:
        v = -v
    rounding = 2.0
    for _ in range(prec):
        rounding *= 10.0
    v += 1.0 / rounding
    tenpow, digits = 1.0, 1
    while v >= 10.0 * tenpow:
        tenpow *= 10.0
        digits += 1
    v /= tenpow
    out = ["-"] if neg else []
    left = digits + prec
    while left > 0:
        left -= 1
        d = min(9, int(v))
        out.append(chr(48 + d))
        if left == prec and prec > 0:
            out.append(".")
        v = (v - d) * 10.0
    return "".join(out)


ATOF = re.compile(r"[ \t\n\v\f\r]*([+-]?(?:[0-9]+\.?[0-9]*(?:[eE][+-]?[0-9]+)?"
                  r"|\.[0-9]+(?:[eE][+-]?[0-9]+)?|inf(?:inity)?|nan))", re.I)
ATOL = re.compile(r"[ \t\n\v\f\r]*([+-]?[0-9]+)")


def to_float(s):
    """String::toFloat(): the number the text starts with, 0 when it starts
    with none - so "abc" is 0, "1.5x" is 1.5 and "nan" is a NaN that every
    clamp then lets through, here as there."""
    m = ATOF.match(s)
    return f32(float(m.group(1))) if m else 0.0


def to_int(s):
    m = ATOL.match(s)
    return int(m.group(1)) if m else 0


def constrain(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def clamp01(v):
    return 0.0 if v < 0.0 else 1.0 if v > 1.0 else v


def truthy(v):
    return v in ("1", "true")


def bin_of(hz):
    """core_audio_in_map.h binOf(). A NaN edge lands on bin 1 here; on the
    panel that cast is undefined, and nothing sane depends on it."""
    b = int(hz / BIN_HZ + 0.5) if hz == hz else 1
    return 1 if b < 1 else MAX_BIN if b > MAX_BIN else b


class Args:
    """server.hasArg() and server.arg(), over what the panel's web server
    would have parsed (src/webserver/Parsing.cpp). Its rules, because a page
    can be wrong about each of them and still work on a kinder parser:

    - the query string first, then the body, and arg() is the FIRST value;
    - the body only under Content-Type: application/x-www-form-urlencoded. A
      POST without that header reaches the handler with no body arguments at
      all - a `band=2` reset sent that way resets every band;
    - a name with no `=` is not an argument (`?levels` is the configuration);
    - a name with an empty value is one (`lut2=` clears a table).

    Not read here, though the panel reads it: a multipart body (FormData).

    Values are kept as bytes-in-a-str (latin-1), as the panel keeps bytes: a
    curve's `meta` is cut to 31 of them, not 31 characters."""

    def __init__(self, query, body, ctype):
        data = query
        if body and ctype.startswith("application/x-www-form-urlencoded"):
            data = (data + "&" if data else "") + body
        self.list = []
        for part in data.split("&"):
            k, eq, v = part.partition("=")
            if eq:
                self.list.append(tuple(
                    urllib.parse.unquote_to_bytes(x.replace("+", " ")).decode("latin-1")
                    for x in (k, v)))

    def has(self, name):
        return any(k == name for k, _ in self.list)

    def get(self, name):
        return next((v for k, v in self.list if k == name), "")

    def num(self, name, fallback):
        """argFloat(): absent or empty leaves the stored value alone."""
        v = self.get(name)
        return to_float(v) if v else fallback


def parse_lut(csv):
    """33 samples, 0..255, commas and digits only; anything else is no table."""
    out, acc, has = [], 0, False
    for c in csv + ",":
        if "0" <= c <= "9":
            acc, has = acc * 10 + ord(c) - 48, True
            if acc > 255:
                return None
        elif c == ",":
            if not has or len(out) >= LUT_POINTS:
                return None
            out.append(acc)
            acc, has = 0, False
        else:
            return None
    return out if len(out) == LUT_POINTS else None


class Room:
    """What a window of sound would have come out of the transform as: a
    magnitude per FFT bin, in the firmware's unit (linear, unnormalized), built
    from a few fixed shapes whose loudness is all that changes from one window
    to the next. fold() and spectrum() are averages over bins, so the mock
    takes the same averages of these.

    The numbers are sized from core_audio_in_map.h's own measurements at input
    gain 8: the quiet-room medians (0.146 / 0.040 / 0.020 / 0.017 per default
    band) for the floor, and music's p10..p90 (0.24..0.66, 0.16..0.49,
    0.05..0.12, 0.011..0.019) for the four voices - including the top band
    barely clearing its own noise, which is the content and not a bug."""

    FLOOR = ((31, 0.30), (62, 0.26), (125, 0.185), (250, 0.118), (375, 0.078), (750, 0.044),
             (1500, 0.027), (3000, 0.019), (5000, 0.017), (8000, 0.016))
    #         centre Hz, width in decades, loudness
    VOICES = ((150.0, 0.45, 0.76),     # kick and bass
              (750.0, 0.26, 0.52),     # the mids: chords, a voice
              (2600.0, 0.22, 0.125),   # presence
              (6600.0, 0.10, 0.09))    # hats: the only thing the top band hears
    # The built-in three-tone test signal (120 / 900 / 4200 Hz), which the
    # analysis runs on when the microphone is not delivering: its 64-bucket
    # spectrum as the real handler printed it on a host build (GET
    # ?levels=1 with the I2S install failing). Nothing here is under 1.0 by
    # accident - the transform is not normalized.
    TONES = (0.89, 0.89, 0.89, 0.89, 0.89, 4.416, 4.416, 4.416, 4.416, 4.416, 4.416, 79.407,
             79.407, 79.407, 79.407, 125.878, 125.878, 125.878, 48.977, 48.977, 2.49, 2.49,
             0.699, 0.699, 0.295, 0.152, 0.089, 0.089, 0.056, 0.037, 0.021, 0.011, 0.006,
             0.003, 0.012, 0.034, 0.103, 0.513, 26.728, 34.585, 0.267, 0.043, 0.015, 0.006,
             0.003, 0.002, 0.001, 0.001, 0.0, 0.0, 0.0, 0.0, 0.0, 0.001, 0.001, 0.013, 8.995,
             0.023, 0.001, 0.0, 0.0, 0.0, 0.0, 0.0)

    def __init__(self):
        # PFAudioFFT::spectrum(): which bins each of the 64 log buckets averages.
        lg0, lg1 = math.log10(MIN_HZ), math.log10(MAX_HZ)
        self.buckets = []
        for i in range(SPEC_BUCKETS):
            k0 = bin_of(10 ** (lg0 + (lg1 - lg0) * i / SPEC_BUCKETS))
            k1 = bin_of(10 ** (lg0 + (lg1 - lg0) * (i + 1) / SPEC_BUCKETS))
            self.buckets.append((k0, min(MAX_BIN, max(k1, k0 + 1))))
        hz = [k * BIN_HZ for k in range(MAX_BIN)]
        floor = [0.0] + [self.floor_at(f) for f in hz[1:]]
        voices = [[0.0] + [amp * math.exp(-((math.log10(f / fc) / width) ** 2)) for f in hz[1:]]
                  for fc, width, amp in self.VOICES]
        tones = [0.0] * MAX_BIN
        for (k0, k1), v in zip(self.buckets, self.TONES):
            tones[k0:k1] = [v] * (k1 - k0)
        # Running sums, so a band of any width is two lookups.
        self.sums = [self.running(bins) for bins in [floor] + voices + [tones]]

    def floor_at(self, f):
        pts = self.FLOOR
        for (f0, v0), (f1, v1) in zip(pts, pts[1:]):
            if f <= f1:
                u = math.log(max(f, f0) / f0) / math.log(f1 / f0)
                return v0 * (v1 / v0) ** u
        return pts[-1][1]

    @staticmethod
    def running(bins):
        out, s = [0.0], 0.0
        for v in bins:
            s += v
            out.append(s)
        return out

    def mean(self, part, lo, hi):
        """The average of one shape over bins lo..hi-1, as fold() takes it. A
        band with no bins in it is 0/0 there, and that is what comes back."""
        s = self.sums[part]
        return (s[hi] - s[lo]) / (hi - lo) if hi > lo else math.nan

    @staticmethod
    def music(t):
        """How loud each voice is at time t, on a 24 second loop at 120 bpm:
        a verse with next to no treble (the top band's gate stays shut, as it
        does on a panel at listening volume), a chorus with hats, then two
        seconds of near silence - so every gate can be watched opening and
        closing."""
        bar = t % 24.0
        kick = math.exp(-5.0 * ((t * 2.0) % 1.0))
        hat = math.exp(-2.2 * ((t * 2.0 + 0.5) % 1.0))
        swell = 0.5 + 0.5 * math.sin(t * 2 * math.pi / 5.3)
        lead = 0.5 + 0.5 * math.sin(t * 2 * math.pi / 3.1 + 1.0)
        k = 0.05 if bar >= 22.0 else 1.0
        return [k * (0.20 + 0.80 * kick), k * (0.40 + 0.60 * swell), k * (0.35 + 0.65 * lead),
                k * (1.0 if bar >= 10.0 else 0.06) * (0.25 + 0.75 * hat)]


ROOM = Room()
NOISE = 0                # Room.sums: the floor, then the four voices, then the test tones


class Audio:
    """The two audio features of a panel, as far as /audio-in can tell."""

    def __init__(self):
        self.lock = threading.Lock()
        self.rng = random.Random(7)
        self.runtime = True       # AUD, /api/audio's switch (feature_audio.h: on by default)
        self.clients = 0          # senders on the :81 socket
        self.noread = False       # /mock?audio=noread
        self.luts = [[0] * LUT_POINTS for _ in range(4)]
        self.factory()
        self.scene("music")

    # ── settings (core_audio_in_map.h) ───────────────────────────────────
    def reset_band(self, i):
        """resetBand(): the measured defaults, and the band back on its gain
        exponent. The table's bytes stay; only lutSet says it is not used."""
        d = BAND_DEFAULTS[i]
        self.bands[i] = {"hzMin": d[0], "hzMax": d[1], "inMin": f32(d[2]), "inMax": f32(d[3]),
                         "gain": f32(d[4]), "outMin": f32(d[5]), "outMax": f32(d[6]),
                         "knob": i, "muted": False}
        self.lut_set[i] = False
        self.metas[i] = ""

    def reset_bands(self):
        for i in range(4):
            self.reset_band(i)
        self.smoothing, self.attack = f32(0.35), f32(0.65)

    def factory(self):
        """A panel nobody has configured: load() with nothing in NVS."""
        self.bands, self.lut_set, self.metas = [None] * 4, [False] * 4, [""] * 4
        self.reset_bands()
        self.mic_on, self.mic_gain, self.auto = False, 8.0, True

    @staticmethod
    def clamp_range(x):
        x["hzMin"] = constrain(x["hzMin"], MIN_HZ, MAX_HZ)
        x["hzMax"] = constrain(x["hzMax"], MIN_HZ, MAX_HZ)
        if x["hzMin"] > x["hzMax"]:
            x["hzMin"], x["hzMax"] = x["hzMax"], x["hzMin"]
        if f32(x["hzMax"] - x["hzMin"]) < BIN_HZ:
            x["hzMax"] = min(MAX_HZ, f32(x["hzMin"] + BIN_HZ))

    # ── /mock?audio= ─────────────────────────────────────────────────────
    def scene(self, name):
        mic, room, phone, clients = AUDIO_STATES[name]
        self.noread = False
        if name == "fresh":
            self.factory()
        # The analysis as it is at boot: nothing heard, no floor learned.
        self.fft = [0.0] * 4              # PFAudioFFT::bands
        self.noise_ref = [-1.0] * 4       # < 0 = unlearned
        self.env_hi = [0.0] * 4
        self.gate = [False] * 4
        self.votes = [0] * 4
        self.warmup = 120
        self.smooth = [0.0] * 4           # smoothLevel
        self.raw_peak = self.raw_dc = 0.0
        self.windows = self.passes = 0
        self.live = self.stalled = False
        self.park = self.since = 0        # passes left asleep; windows since I2S came up
        self.t = 0.0
        self.last = None                  # the window spectrum() would read
        self.ext_levels, self.ext_env, self.ext_spec = [0.0] * 4, [0.0] * 8, [0.0] * 64
        self.ext_at = self.poll_at = None
        self.phone, self.phone_at = phone, 0.0
        self.phone_lo, self.phone_hi = [1.0] * 4, [0.0] * 4
        self.clients = clients
        self.state = name
        # ...and then as if it had been in this state for a while. The states
        # with the switch off (fresh aside) heard music first, so what they
        # hold is what a panel holds: the last window, not zeros. So did the
        # microphone that then stopped answering.
        if name != "fresh":
            self.mic_on = self.live = True
            if room in ("music", "tones"):
                self.hear("silence", 180)     # the warm-up finds the floor
                self.hear("music", 720)
            if room != "music":
                self.hear(room, 1800 if room == "silence" else 300)   # envelopes settle slowly
        self.room, self.mic_on = room, mic
        if not mic:
            self.live = self.stalled = False
        self.clock = time.monotonic()
        if phone:
            for back in range(120, 0, -1):
                self.phone_frame(self.clock - back * 0.25, True)

    def hear(self, room, windows):
        self.room, self.stalled = room, room == "tones"
        for _ in range(windows):
            self.window()

    # ── the analysis task (feature_audio_in.h), 60 passes a second ───────
    def advance(self, now):
        """Catch the analysis up to now. No thread: nothing changes that a
        request cannot see, so it runs when one arrives - two seconds' worth at
        most, which is all a tab that was away needs."""
        n = int((now - self.clock) * 60.0)
        if n > 0:
            self.clock = now if n > 120 else self.clock + n / 60.0
            for _ in range(min(n, 120)):
                self.tick()
        if self.phone:
            self.phone_frame(now)

    def tick(self):
        if self.park:
            self.park -= 1
            return
        if not self.mic_on:
            # Parked: I2S released, and a look at the switch every 250 ms.
            # That wait is why `source` says "synth" for a moment after mic=1.
            self.live = self.stalled = False
            self.park = 14
            return
        if not self.live:                                          # PFAudioPdm::begin()
            self.live, self.stalled, self.since = True, self.room == "tones", 0
        self.window()

    def window(self):
        """analyze(), then the gate and the damping, as the task runs them."""
        self.t += 1.0 / 60.0
        self.passes += 1
        jit = [1.0 + 0.16 * (self.rng.random() - 0.5) for _ in range(4)]
        if self.room == "tones":
            # The microphone is not delivering, so the window is the test
            # signal: no input gain, and a little drift as the window slides.
            wob = 1.0 + 0.015 * math.sin(self.passes * 0.61)
            scale, amps, noisy = 1.0, [0.0] * 4 + [wob], False
            self.raw_peak, self.raw_dc = 0.99439, -0.0158 + 0.006 * math.sin(self.passes * 0.61)
        elif self.room == "rail":
            # Nothing on the data pin: it floats to a rail, every sample is
            # the same, and a constant has no energy outside bin 0. Measured.
            scale, amps, noisy = 0.0, [0.0] * 5, False
            self.raw_peak, self.raw_dc = 0.94406, -0.94406
            self.windows += 1
        else:
            voices = ROOM.music(self.t) if self.room == "music" else [0.0] * 4
            scale, amps, noisy = self.mic_gain / 8.0, voices + [0.0], True
            # A microphone starts with a pop: its first few windows are far
            # above the room. That is an assumption about the part, and it
            # decides what the gate learns - see "The start", above
            # AUDIO_STATES.
            pop = 10.0 * 0.45 ** self.since if self.since < 10 else 0.0
            jit = [j + pop for j in jit]
            self.raw_peak = 0.0036 + 0.014 * voices[0] + 0.0004 * jit[0]
            self.raw_dc = -0.0041 + 0.0003 * (jit[1] - 1.0 - pop)
            self.windows += 1
        self.since += 1
        self.last = (scale, amps, noisy, self.passes)
        for b in range(4):
            v = scale * self.heard(self.bins(b), amps, jit[b] if noisy else 0.0)
            self.fft[b] = f32(self.fft[b] * 0.7 + v * 0.3)           # fold()'s own smoothing
        self.track()
        a30, k30 = constrain(self.smoothing, 0.05, 0.9), constrain(self.attack, 0.05, 0.9)
        rel60, atk60 = 1.0 - math.sqrt(1.0 - a30), 1.0 - math.sqrt(1.0 - k30)
        for i in range(4):                                           # smoothLevels()
            a = atk60 if self.fft[i] > self.smooth[i] else rel60
            self.smooth[i] = f32(self.smooth[i] + (self.fft[i] - self.smooth[i]) * a)

    def bins(self, b):
        """fold(): the FFT bins band b is averaged over, lo..hi-1."""
        lo = bin_of(self.bands[b]["hzMin"])
        return lo, min(MAX_BIN, max(bin_of(self.bands[b]["hzMax"]), lo + 1))

    @staticmethod
    def heard(bins, amps, floor):
        """The average magnitude over those bins: the voices (and the test
        tones) at these loudnesses, over this much of the noise floor."""
        return floor * ROOM.mean(NOISE, *bins) + sum(
            a * ROOM.mean(i + 1, *bins) for i, a in enumerate(amps))

    def track(self):
        """trackEnvelopes(): the noise reference, the peak envelope, the gate."""
        warming = self.warmup > 0
        if warming:
            self.warmup -= 1
        for i in range(4):
            v, ref = clamp01(self.fft[i]), self.noise_ref[i]
            if ref < 0.0:
                ref = v
            elif warming:
                ref = min(ref, v)
            elif not self.gate[i] and v < ref * 1.5 + 0.005:
                ref += (v - ref) * 0.005
            self.noise_ref[i] = ref
            self.env_hi[i] += (v - self.env_hi[i]) * (0.3 if v > self.env_hi[i] else 0.002)
            lo = ref * 1.5
            if self.env_hi[i] < lo + 0.02:
                self.env_hi[i] = lo + 0.02
            open_abs = (0.012, 0.050, 0.015, 0.012)[i]
            if not self.gate[i]:
                self.votes[i] = self.votes[i] + 1 if v > ref * 1.8 + open_abs else 0
                if self.votes[i] >= 8:
                    self.gate[i], self.votes[i] = True, 0
            else:
                self.votes[i] = self.votes[i] + 1 if v < ref * 1.4 + open_abs \
                    else max(0, self.votes[i] - 3)
                if self.votes[i] >= 25:
                    self.gate[i], self.votes[i] = False, 0

    # ── a level to a knob (core_audio_in_map.h) ──────────────────────────
    def normalized(self, b, level):
        if not self.gate[b]:
            return 0.0
        lo = self.noise_ref[b] * 1.5
        return clamp01((level - lo) / max(self.env_hi[b] - lo, 0.02))

    def mapped_window(self, b, level, in_min, in_max):
        x = self.bands[b]
        in_min = clamp01(in_min)
        in_max = max(in_min + f32(0.01), clamp01(in_max))
        u = clamp01((level - in_min) / (in_max - in_min))
        if self.lut_set[b] and u == u:
            pos = clamp01(u) * (LUT_POINTS - 1)
            i = int(pos)
            j = min(i + 1, LUT_POINTS - 1)
            u = (self.luts[b][i] * (1.0 - (pos - i)) + self.luts[b][j] * (pos - i)) / 255.0
        else:
            u = u ** (1.0 / constrain(x["gain"], f32(0.2), 4.0))
        return f32(x["outMin"] + u * (x["outMax"] - x["outMin"]))

    def mapped(self, b, level):
        if self.auto:
            return self.mapped_window(b, self.normalized(b, level), f32(0.10), f32(0.95))
        return self.mapped_window(b, level, self.bands[b]["inMin"], self.bands[b]["inMax"])

    def source(self):
        """sourceLabel(): five strings, matched exactly by the page."""
        if not self.mic_on:
            return "off"
        if not self.live:
            return "synth"
        if self.stalled:
            return "synth (mic stalled)"
        dead = abs(self.raw_dc) >= 0.5 and not any(v > 1e-4 for v in self.fft)
        return "pdm (no mic - data pin idle)" if dead else "pdm"

    def spectrum(self):
        """PFAudioFFT::spectrum(): 64 log buckets of the LAST window - so with
        the analysis parked it is what that window left, again and again."""
        if not self.last:
            return [0.0] * SPEC_BUCKETS
        scale, amps, noisy, seed = self.last
        rng = random.Random(seed)
        return [scale * self.heard(bucket, amps, 1.0 + 0.5 * (rng.random() - 0.5) if noisy else 0.0)
                for bucket in ROOM.buckets]

    # ── the phone app's monitor frames ───────────────────────────────────
    def ext_fresh(self, now):
        return self.ext_at is not None and now - self.ext_at < 3.0 and not self.mic_on

    def watching(self, now):
        return self.poll_at is not None and now - self.poll_at < 2.5

    def parse_frame(self, s, now):
        """parseFrame(): 4 levels; 4 x lo,hi; 64 buckets. 76 numbers or nothing."""
        vals = [to_float(tok) for tok in re.split("[,;]", s) if tok][:76]
        if len(vals) != 76:
            return
        self.ext_levels, self.ext_env, self.ext_spec = vals[:4], vals[4:12], vals[12:]
        self.ext_at = now

    def phone_frame(self, now, due=False):
        """/mock?audio=phone: what the capture app posts, in its own text and
        through the same parser - four frames a second while a page is
        polling, one every two seconds when none is (it reads `watch`). The
        phone analyses on the phone, in its own unit: 0..1 across its dB axis."""
        if not due and now - self.phone_at < (0.25 if self.watching(now) else 2.0):
            return
        self.phone_at = now

        def unit(v):
            return clamp01((20.0 * math.log10(max(v, 1e-4)) + 45.0) / 47.0)

        amps = ROOM.music(now % 240.0)
        levels = []
        for b in range(4):
            v = unit(self.heard(self.bins(b), amps, 1.0))
            levels.append(v)
            self.phone_hi[b] = v if v > self.phone_hi[b] else \
                self.phone_hi[b] + (v - self.phone_hi[b]) * 0.03
            self.phone_lo[b] = v if v < self.phone_lo[b] else \
                self.phone_lo[b] + (v - self.phone_lo[b]) * 0.03
            self.phone_hi[b] = max(self.phone_hi[b], self.phone_lo[b] + 0.06)
        spec = [unit(self.heard(bucket, amps, 1.0)) for bucket in ROOM.buckets]
        self.parse_frame("%s;%s;%s" % (
            ",".join("%.3f" % v for v in levels),
            ",".join("%.3f,%.3f" % (self.phone_lo[b], self.phone_hi[b]) for b in range(4)),
            ",".join("%.2f" % v for v in spec)), now)

    # ── the replies (core_audio_in_http.h): field order and decimals are the
    #    handler's, because the page compares what it re-reads ──────────────
    def poll_json(self, now):
        ext = self.ext_fresh(now)
        j = '{"source":"%s","ext":%s' % ("phone" if ext else self.source(), "true" if ext else "false")
        j += ',"rawPeak":%s,"rawDc":%s,"dropped":0' % (fstr(self.raw_peak, 5), fstr(self.raw_dc, 5))
        j += ',"levels":[' + ",".join(fstr(v, 4) for v in (self.ext_levels if ext else self.smooth))
        # Always the microphone's, also while the phone's frames are served.
        j += '],"levelsN":[' + ",".join(fstr(self.normalized(i, self.smooth[i]), 4) for i in range(4))
        j += '],"outputs":[' + ",".join(fstr(self.mapped(i, self.smooth[i]), 4) for i in range(4))
        if ext:
            j += '],"env":[' + ",".join('{"lo":%s,"hi":%s}' % (fstr(self.ext_env[i * 2], 4),
                                                              fstr(self.ext_env[i * 2 + 1], 4))
                                        for i in range(4))
        elif self.auto:
            j += '],"env":[' + ",".join('{"lo":%s,"hi":%s}' % (fstr(self.noise_ref[i] * 1.5, 4),
                                                              fstr(self.env_hi[i], 4))
                                        for i in range(4))
        j += '],"spectrum":[' + ",".join(fstr(v, 3) for v in (self.ext_spec if ext else self.spectrum()))
        return j + "]}"

    def config_json(self):
        j = '{"source":"%s","micOn":%s,"micGain":%s,"autoRange":%s,"smoothing":%s,"attack":%s' % (
            self.source(), "true" if self.mic_on else "false", fstr(self.mic_gain, 1),
            "true" if self.auto else "false", fstr(self.smoothing, 3), fstr(self.attack, 3))
        j += ',"rawPeak":%s,"rawDc":%s,"windows":%d' % (fstr(self.raw_peak, 5), fstr(self.raw_dc, 5),
                                                      self.windows)
        j += ',"level":[' + ",".join(fstr(v, 4) for v in self.fft)
        j += '],"out":[' + ",".join(fstr(self.mapped(i, self.fft[i]), 4) for i in range(4))
        bands = []
        for i, b in enumerate(self.bands):
            bands.append(
                '{"hzMin":%s,"hzMax":%s,"inMin":%s,"inMax":%s,"gain":%s,"outMin":%s,"outMax":%s,'
                '"knob":%d,"muted":%s,"meta":"%s","lutSet":%s}' % (
                    fstr(b["hzMin"], 1), fstr(b["hzMax"], 1), fstr(b["inMin"], 4),
                    fstr(b["inMax"], 4), fstr(b["gain"], 3), fstr(b["outMin"], 3),
                    fstr(b["outMax"], 3), b["knob"], "true" if b["muted"] else "false",
                    self.metas[i].replace("\\", "\\\\").replace('"', '\\"'),
                    "true" if self.lut_set[i] else "false"))
        j += '],"bands":[' + ",".join(bands)
        j += '],"hzRange":[%s,%s' % (fstr(MIN_HZ, 2), fstr(MAX_HZ, 2))
        j += '],"spec":[' + ",".join(fstr(v, 3) for v in self.spectrum())
        return j + "]}"

    def apply_band(self, b, sfx, a):
        """applyBandArgs(): whatever arrived under these names; the two pairs
        (hzMin/hzMax, inMin/inMax) are settled after, whichever half came."""
        x = self.bands[b]
        x["hzMin"] = a.num("hzMin" + sfx, x["hzMin"])
        x["hzMax"] = a.num("hzMax" + sfx, x["hzMax"])
        self.clamp_range(x)
        x["inMin"] = constrain(a.num("inMin" + sfx, x["inMin"]), 0.0, 1.0)
        x["inMax"] = constrain(a.num("inMax" + sfx, x["inMax"]), 0.0, 1.0)
        x["gain"] = constrain(a.num("gain" + sfx, x["gain"]), f32(0.2), 4.0)
        x["outMin"] = constrain(a.num("outMin" + sfx, x["outMin"]), 0.0, 1.0)
        x["outMax"] = constrain(a.num("outMax" + sfx, x["outMax"]), 0.0, 1.0)
        if a.has("knob" + sfx):
            x["knob"] = constrain(to_int(a.get("knob" + sfx)), 0, 3)
        if a.has("muted" + sfx):
            x["muted"] = truthy(a.get("muted" + sfx))
        floor = f32(x["inMin"] + f32(0.01))
        if x["inMax"] < floor:
            x["inMax"] = min(1.0, floor)
        if a.has("lut" + sfx):
            csv = a.get("lut" + sfx)
            table = parse_lut(csv) if csv else None
            if not csv:
                self.lut_set[b] = False       # empty clears; the band runs `gain`
            elif table:
                self.luts[b], self.lut_set[b] = table, True
            # ...and anything else is ignored: the reply is still {"ok":true}
        if a.has("meta" + sfx):
            self.metas[b] = a.get("meta" + sfx).split("\0")[0][:31]

    def handle_set(self, a, now):
        if a.has("frame"):
            # A monitor frame is state, not settings: nothing else is read.
            self.parse_frame(a.get("frame"), now)
            return 200, '{"ok":true,"watch":%s}' % ("true" if self.watching(now) else "false")
        single = -1
        if a.has("band"):
            single = to_int(a.get("band"))
            if single < 0 or single > 3:    # refused before anything is applied
                return 400, '{"ok":false,"error":"band must be 0-3"}'
        if a.has("mic"):
            self.mic_on = truthy(a.get("mic"))
            if self.mic_on and not self.live:
                # The parked task looks at the switch every 250 ms, so on a
                # panel the driver is up some time inside that. Here it is
                # always the whole quarter second: the "synth" a page must
                # not take for a verdict is then there every time.
                self.park = 15
        if a.has("auto"):
            self.auto = truthy(a.get("auto"))
        if a.has("micGain"):
            self.mic_gain = constrain(to_float(a.get("micGain")), 1.0, 16.0)
        if a.has("smoothing"):
            self.smoothing = constrain(to_float(a.get("smoothing")), f32(0.05), f32(0.9))
        if a.has("attack"):
            self.attack = constrain(to_float(a.get("attack")), f32(0.05), f32(0.9))
        if single >= 0:
            self.apply_band(single, "", a)
        for b in range(4):
            # A band is applied when the request names ANY of its fields.
            if any(a.has(f + str(b)) for f in BAND_FIELDS):
                self.apply_band(b, str(b), a)
        return 200, '{"ok":true}'

    def handle_reset(self, a):
        if a.has("band"):
            v = a.get("band")
            if len(v) != 1 or not "0" <= v <= "3":      # one digit, or nothing happens
                return 400, '{"ok":false,"error":"band must be 0-3"}'
            self.reset_band(int(v))
            return 200, '{"ok":true,"band":%s}' % v
        self.reset_bands()       # every band and curve, damping, attack...
        self.mic_gain = 8.0      # ...and the input gain. Not the switch, not auto.
        return 200, '{"ok":true}'

    def request(self, method, path, a, caps):
        """(status, body) as the firmware answers it, or None where this build
        has no such route and the web server's own 404 goes out."""
        now = time.monotonic()
        self.advance(now)
        if path == "/api/audio" and "audio" in caps:
            if method == "GET":
                return 200, '{"audioRuntime":%s,"audioClients":%d}' % (
                    "true" if self.runtime else "false", self.clients)
            if method == "POST":
                if a.has("on"):
                    self.runtime = truthy(a.get("on"))
                return 200, '{"ok":true,"audioRuntime":%s}' % ("true" if self.runtime else "false")
        if path == "/api/audio-in" and "audio-in" in caps:
            if method == "GET" and a.has("levels"):
                if not a.has("idle"):
                    self.poll_at = now      # a page is watching: the phone reads this
                return 200, self.poll_json(now)
            if method == "GET":
                return 200, self.config_json()
            if method == "POST":
                return self.handle_set(a, now)
        if path == "/api/audio-in/reset" and "audio-in" in caps and method == "POST":
            return self.handle_reset(a)
        return None

    def status(self, caps):
        """What the two features append to /api/status."""
        with self.lock:
            self.advance(time.monotonic())
            out = {}
            if "audio" in caps:
                out.update(audioRuntime=self.runtime, audioClients=self.clients)
            if "audio-in" in caps:
                # The timings are of the right order (the transform measured
                # 329 us on a panel), not a capture; the rest is the model's.
                runs = max(0, self.passes - 60)
                out["audioIn"] = {
                    "core": 0, "lastUs": 1764 if runs else 0, "avgUs": 1742 if runs else 0,
                    "fillUs": 1307 if runs else 0, "fftUs": 329 if runs else 0,
                    "foldUs": 96 if runs else 0, "maxUs": 2410 if runs else 0, "runs": runs,
                    "heap": 0, "staticBytes": 9472, "source": self.source(),
                    "micWindows": self.windows, "micDropped": 0,
                    "rawPeak": round(self.raw_peak, 5), "rawDc": round(self.raw_dc, 5),
                    "bands": [round(v, 4) for v in self.fft],
                }
            return out


AUDIO = Audio()
DEV = Device()
FEATURE_NAV = feature_nav()


class Handler(BaseHTTPRequestHandler):
    server_version = "PatternflowConsoleMock"
    # The panel answers HTTP/1.1 and closes after every reply; so does this
    # (reply() sends the Connection: close that keeps it one request each).
    protocol_version = "HTTP/1.1"

    # ── plumbing ─────────────────────────────────────────────────────────
    def send_response(self, code, message=None):
        # No Server or Date header: the panel's WebServer writes neither, and
        # a 304 here should carry exactly the headers the panel's does.
        self.log_request(code)
        self.send_response_only(code, message)

    def log_message(self, fmt, *a):
        sys.stderr.write("  %s %s\n" % (self.command, self.path))

    def log_request(self, code="-", size="-"):
        # `note`: what an audio request carried, or how it ended (see audio()).
        note, self.note = getattr(self, "note", ""), ""
        if Link.rtt or Link.serial or (note and code != 200):
            sys.stderr.write("  %s %s%s -> %s\n" % (self.command, self.path, note, code))
        else:
            sys.stderr.write("  %s %s%s\n" % (self.command, self.path, note))

    # Each request is a connection of its own (Connection: close, here as on
    # the panel): the handshake and the request cost a round trip
    # before the server sees anything, and with --serial nothing else is
    # served meanwhile - the panel's server has one slot.
    def handle_one_request(self):
        if Link.rtt:
            time.sleep(Link.rtt)
        try:
            if Link.serial:
                with Link.lock:
                    return BaseHTTPRequestHandler.handle_one_request(self)
            return BaseHTTPRequestHandler.handle_one_request(self)
        except ConnectionError:
            # The browser left mid-reply: a link clicked, a tab closed. A page
            # that polls ten times a second does that on most navigations,
            # and a traceback for each one buries the log.
            self.close_connection = True

    def write_body(self, body):
        if not (Link.rtt or Link.bps):
            self.wfile.write(body)
            return
        # The wait comes before each window's bytes, so the browser feels
        # every window's transfer time - the last one's included.
        for i in range(0, len(body), TCP_WINDOW):
            chunk = body[i:i + TCP_WINDOW]
            wait = len(chunk) / Link.bps if Link.bps else 0
            if i:
                wait = max(wait, Link.rtt)  # this window waited on the last one's ACK
            time.sleep(wait)
            self.wfile.write(chunk)
            self.wfile.flush()

    def reply(self, code, headers, body=b""):
        """Status, headers in the order given, Connection: close, body. The
        panel's WebServer puts Content-Type first and Content-Length and
        Connection last, around whatever the handler added; callers keep that
        order so a response here reads like one from the panel."""
        self.send_response(code)
        for k, v in headers:
            self.send_header(k, v)
        self.send_header("Connection", "close")
        self.end_headers()
        if body:
            self.write_body(body)

    def send(self, body, ctype="text/html; charset=utf-8", code=200, cache="no-store"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.reply(code, [("Content-Type", ctype), ("Cache-Control", cache),
                          ("Content-Length", str(len(body)))], body)

    def not_found(self):
        # core_http.h's onNotFound, word for word.
        self.send("Not found", "text/plain", 404, NO_STORE)

    def send_console(self, text, ctype, cache, etag=True):
        """A page or the chrome, the way PFSend::gz sends it: the ETag from the
        uncompressed bytes (CRLF folded, as the device's literal is), and a
        304 carrying the ETag, the same Cache-Control and the Content-Length
        a 200 would have - no body, no Content-Encoding. etag=False is the
        panel's no-store reply: no tag, so never a 304."""
        payload = text.replace("\r\n", "\n").encode("utf-8")
        tag = payload_etag(payload) if etag else None
        body = gzip.compress(payload, 9, mtime=0) if Link.device else payload
        if tag and etag_matches(self.headers.get("If-None-Match"), tag):
            return self.reply(304, [("Content-Type", ctype), ("ETag", tag),
                                    ("Cache-Control", cache),
                                    ("Content-Length", str(len(body)))])
        headers = [("Content-Type", ctype), ("Cache-Control", cache)]
        if tag:
            headers.append(("ETag", tag))
        if Link.device:
            headers.append(("Content-Encoding", "gzip"))
        headers.append(("Content-Length", str(len(body))))
        self.reply(200, headers, body)

    def send_page(self, path, name):
        """PFSend::PAGE: a page stamped exactly as console_pages.py build
        stamps it into the header. One page is not a file to read: /audio-in
        is assembled from its sources by the code `build` assembles it with,
        here on every request, so its sources are save-and-refresh too."""
        f = os.path.join(HTML_DIR, name + ".html")
        assembled = name == build_audio_in_page.PAGE
        if not assembled and not os.path.exists(f):
            return self.send("no console/%s.html — run console_pages.py extract" % name,
                             "text/plain", 404)
        try:
            text = console_pages.stamp(
                build_audio_in_page.assemble(SKETCH) if assembled else read(f),
                console_pages.crc_of(raw_literal(*CHROME_SRC)), console_pages.load_shim(), name)
        except (ValueError, RuntimeError, OSError) as e:
            # build would refuse this page; show why instead of a page the
            # device could never have served
            return self.send("console_pages.py build would fail: %s" % e, "text/plain", 500)
        if not host_cacheable(self.headers.get("Host")):
            return self.send_console(text, "text/html", NO_STORE, etag=False)
        v, build = self.arg("v"), console_build()
        if v and v != build:
            # PFSend::redirectToBuild: a page from another build goes to this
            # one's URL, every other argument kept in order, every v rewritten,
            # all but unreserved characters %XX-escaped - and nothing cached.
            args = [(k, build if k == "v" else val) for k, val in self.qlist]
            loc = path + "?" + "&".join(
                "%s=%s" % (urllib.parse.quote(k, safe=""), urllib.parse.quote(val, safe=""))
                for k, val in args)
            return self.reply(302, [("Content-Type", "text/plain"), ("Location", loc),
                                    ("Cache-Control", NO_STORE), ("Content-Length", "0")])
        self.send_console(text, "text/html", IMMUTABLE if v else REVALIDATE)

    def send_chrome(self):
        """PFSend::STAMPED: immutable under its own ?h=, never stored under
        another one, revalidated when bare."""
        if Link.chrome404:
            return self.not_found()
        try:
            text = raw_literal(*CHROME_SRC)
        except RuntimeError as e:
            return self.send("/* %s */" % e, "application/javascript", 500)
        ctype = "application/javascript"
        if not host_cacheable(self.headers.get("Host")):
            return self.send_console(text, ctype, NO_STORE, etag=False)
        h = self.arg("h")
        if not h:
            return self.send_console(text, ctype, REVALIDATE)
        if h == console_pages.crc_of(text):
            return self.send_console(text, ctype, IMMUTABLE)
        self.send_console(text, ctype, NO_STORE, etag=False)

    def send_json(self, obj, code=200):
        self.send(json.dumps(obj), "application/json", code)

    def parts(self):
        u = urllib.parse.urlsplit(self.path)
        path = posixpath.normpath(urllib.parse.unquote(u.path)) or "/"
        self.qlist = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
        return path, dict(urllib.parse.parse_qsl(u.query))

    def arg(self, name):
        """server.arg(name): the first value given, "" when absent."""
        return next((v for k, v in getattr(self, "qlist", []) if k == name), "")

    def body_params(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n).decode("utf-8", "replace") if n else ""
        if raw.lstrip().startswith("{"):
            try:
                return json.loads(raw)
            except ValueError:
                return {}
        return dict(urllib.parse.parse_qsl(raw))

    # ── GET ──────────────────────────────────────────────────────────────
    def do_GET(self):
        path, q = self.parts()

        if path in ROUTES:
            return self.send_page(path, ROUTES[path])

        if path == "/favicon.ico":
            # The chrome draws its own icon; this only stops the browser asking.
            return self.reply(204, [("Content-Type", "text/html"), ("Cache-Control", IMMUTABLE),
                                    ("Content-Length", "0")])

        # The clock's glyph blob, the same bytes the firmware compiles in
        # (build_clock_glyphs.py writes both).
        if path == "/clock/glyphs.bin":
            f = os.path.join(SKETCH, "features", "clock", "clock_glyphs.bin")
            if not os.path.exists(f):
                return self.send("no clock_glyphs.bin - run build_clock_glyphs.py", code=404)
            with open(f, "rb") as fh:
                body = fh.read()
            return self.send(body, "application/octet-stream",
                             cache="public, max-age=31536000, immutable")

        if path == "/pf-console.js":
            return self.send_chrome()

        if path in RAW_ASSETS:
            rel, tag, ctype = RAW_ASSETS[path]
            try:
                text = raw_literal(rel, tag)
            except Exception as e:
                return self.send("/* %s */" % e, ctype, 500)
            # gz() with a literal Cache-Control, as core_patterns_http.h sends
            # it: that string, no ETag, never a 304.
            return self.send_console(text, ctype, "public, max-age=86400" if Link.device
                                     else DESK_CACHE, etag=False)

        if path == "/mock":
            dest = "/"
            if any(k == "audio" for k, _ in self.qlist):
                want = self.arg("audio")
                if want != "noread" and want not in AUDIO_STATES:
                    return self.send("audio= is one of: %s, noread\n" % ", ".join(AUDIO_STATES),
                                     "text/plain", 400)
                with AUDIO.lock:
                    if want == "noread":
                        AUDIO.noread = True
                    else:
                        AUDIO.scene(want)
                dest = "/audio-in"
            if "variant" in q:
                DEV.variant = q["variant"] or "core"
            want = q.get("caps", "full") if "caps" in q else None
            if want is not None:
                DEV.caps = (CAPS_BARE if want == "bare" else CAPS_FULL if want == "full"
                            else [c.strip() for c in want.split(",") if c.strip()])
            if "hotspot" in q:
                DEV.via_hotspot = q["hotspot"] in ("1", "true", "on")
            if any(k == "busy" for k, _ in self.qlist):
                DEV.busy = self.arg("busy") if self.arg("busy") in ("update", "storage") else ""
            return self.reply(302, [("Content-Type", "text/plain"), ("Location", dest),
                                    ("Cache-Control", NO_STORE), ("Content-Length", "0")])

        if path in AUDIO_ROUTES:
            return self.audio(path)

        if path.startswith("/api/") or path == "/update/status":
            return self.api(path, q, {})

        self.not_found()

    def do_POST(self):
        path, q = self.parts()
        if path in AUDIO_ROUTES:
            return self.audio(path)
        p = dict(q)
        p.update(self.body_params())
        self.api(path, q, p)

    def do_DELETE(self):
        path, q = self.parts()
        if path in AUDIO_ROUTES:
            return self.audio(path)
        self.api(path, q, dict(q), delete=True)

    def audio(self, path):
        """The audio features' routes, answered by the port above. The body is
        read here, raw: body_params() drops empty values, and to these
        handlers `lut2=` and `meta1=` mean something."""
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n).decode("latin-1") if n else ""
        ctype = self.headers.get("Content-Type") or ""
        args = Args(urllib.parse.urlsplit(self.path).query, body, ctype)
        # The log line says what was sent - a save is judged by what it
        # carried - with a curve table or a phone frame cut short. And it says
        # when a body was sent that the panel would not have read.
        self.note = "".join("  " + (v if len(v) <= 60 else "%s...(%d bytes)" % (v[:44], len(v)))
                            for v in body.split("&") if v)
        if body and ctype.startswith("multipart/"):
            self.note = "  (a multipart body: the panel reads those, this mock does not)"
        elif body and not ctype.startswith("application/x-www-form-urlencoded"):
            self.note += "  (BODY NOT READ: Content-Type %r is not the form one)" % ctype
        with AUDIO.lock:
            if (AUDIO.noread and self.command == "GET" and path == "/api/audio-in"
                    and not args.has("levels") and "audio-in" in DEV.caps):
                # /mock?audio=noread: no reply at all, which is what a failed
                # read of a panel is - it has no error to send for this route.
                self.note = "  (/mock?audio=noread)"
                self.close_connection = True
                return self.log_request("no reply")
            answer = AUDIO.request(self.command, path, args, DEV.caps)
        if answer is None:
            return self.not_found()
        self.send(answer[1].encode("latin-1"), "application/json", answer[0])

    # ── the fake device ──────────────────────────────────────────────────
    def api(self, path, q, p, delete=False):
        d = DEV

        if path == "/api/status":
            return self.send_json(d.status())

        if path == "/update/status":
            return self.send_json({"armed": True, "busy": False, "version": "3.10.4",
                                   "lastError": "", "lastRejected": False,
                                   "lastOk": False, "received": 0, "expected": 0,
                                   "attempts": 0})

        if path == "/api/sleep":
            d.sleep = not d.sleep if "on" not in p else p.get("on") in ("1", "true")
            return self.send_json({"ok": True, "sleep": d.sleep})

        # ── patterns ──
        if path == "/api/patterns":
            if delete:
                slug = q.get("slug", "")
                d.patterns = [x for x in d.patterns if x["module"] != slug]
                for i, x in enumerate(d.patterns):
                    x["index"] = i
                d.active = min(d.active, max(0, len(d.patterns) - 1))
                return self.send_json({"ok": True})
            if self.command == "POST":  # upload
                return self.send_json({"ok": True, "name": p.get("name", "uploaded")})
            return self.send_json({
                "active": d.active, "presets": d.presets, "mounted": True,
                "free": 10215424, "patterns": d.patterns,
                "pendingRev": 0, "pending": [],
            })
        if path == "/api/patterns/select":
            try:
                i = int(p.get("index", q.get("index", 0)))
            except ValueError:
                i = 0
            if 0 <= i < len(d.patterns):
                d.active = i
            return self.send_json({"ok": True, "active": d.active})
        if path == "/api/patterns/delete":
            slug = p.get("slug", "")
            d.patterns = [x for x in d.patterns if x["module"] != slug]
            for i, x in enumerate(d.patterns):
                x["index"] = i
            return self.send_json({"ok": True})
        if path == "/api/patterns/format":
            d.patterns = d.patterns[: d.presets]
            d.active = 0
            return self.send_json({"ok": True})
        if path == "/api/patterns/pending":
            return self.send_json({"rev": 0, "slugs": []})
        if path == "/api/patterns/file":
            return self.send("// mock: source of " + q.get("slug", "?") + "\n",
                             "text/plain")

        # ── wi-fi ──
        if path == "/api/wifi":
            if delete:
                ssid = q.get("ssid", "")
                d.wifi = [n for n in d.wifi if n["ssid"] != ssid]
                d.boot_idx = min(d.boot_idx, max(0, len(d.wifi) - 1))
                return self.send_json({"ok": True})
            if self.command == "POST":
                ssid = p.get("ssid", "").strip()
                if not ssid:
                    return self.send_json({"ok": False, "error": "no ssid"})
                if not any(n["ssid"] == ssid for n in d.wifi):
                    d.wifi.insert(0, {"ssid": ssid})
                    d.boot_idx += 1
                switching = p.get("connect") == "1"
                if switching:
                    # Resolved three seconds later by the GET below: a password of
                    # "wrong" fails as one, a name the hotspot did not see is not
                    # found, anything else joins - every state the page can show.
                    d.join = {"ssid": ssid, "wrong": p.get("pass") == "wrong", "at": time.time()}
                return self.send_json({"ok": True, "ssid": ssid, "switching": switching})
            join = {"state": "none", "ssid": "", "ip": "", "why": "", "reason": 0, "ago": 0}
            j = getattr(d, "join", None)
            if j:
                ago = time.time() - j["at"]
                join.update(ssid=j["ssid"], ago=int(max(0, ago - 3)))
                if ago < 3:
                    join.update(state="trying", ago=int(ago))
                elif j["wrong"]:
                    join.update(state="failed", why="wrong password", reason=15)
                elif j["ssid"] not in SEEN_NETWORKS:
                    join.update(state="failed", why="network not found", reason=201)
                else:
                    join.update(state="joined", ip="192.168.0.196")
            return self.send_json({
                "max": 5, "connected": True,
                "current": d.wifi[d.boot_idx]["ssid"] if d.wifi else "",
                "ip": "192.168.0.196", "status": "CONNECTED",
                "bootIdx": d.boot_idx, "join": join, "networks": d.wifi,
            })
        if path == "/api/wifi/boot":
            try:
                d.boot_idx = int(p.get("bootIdx", 0))
            except ValueError:
                pass
            return self.send_json({"ok": True, "bootIdx": d.boot_idx})
        if path == "/api/wifi/reboot":
            return self.send_json({"ok": True})

        # ── shows ──
        if path in ("/api/shows/status",):
            return self.send_json(d.show_state())
        if path == "/api/shows":
            if delete:
                d.shows = [s for s in d.shows if s["slug"] != q.get("slug", "")]
                return self.send_json({"ok": True})
            if self.command == "POST":
                return self.send_json({"ok": True})
            out = d.show_state()
            out["shows"] = d.shows
            out["storedCount"] = len(d.shows)
            out["storedSlugs"] = [s["slug"] for s in d.shows]
            return self.send_json(out)
        if path == "/api/shows/control":
            op = p.get("op", "")
            if op == "play":
                d.show_playing, d.show_paused = True, False
                d.show_slug = p.get("slug", d.show_slug or (d.shows[0]["slug"] if d.shows else ""))
            elif op == "pause":
                d.show_paused = True
            elif op == "resume":
                d.show_paused = False
            elif op == "stop":
                d.show_playing = d.show_paused = False
                d.show_slug = ""
            return self.send_json(d.show_state())
        if path == "/api/shows/schedule":
            return self.send_json(d.show_state())

        # ── weather / mqtt: configured enough to see a populated layout ──
        if path.startswith("/api/weather"):
            return self.send_json({
                "ok": True, "query": "Seoul", "condition": "Clouds",
                "description": "broken clouds", "error": "", "enabled": True,
                "metric": True, "configured": True, "hasKey": True,
                "hasData": True, "weatherId": 803, "tempC": 24.10,
                "feelsC": 24.60, "humidity": 62.0, "pressure": 1009.0,
                "windMs": 2.10, "windKmh": 7.56, "windMph": 4.70,
                "windDeg": 250, "windDir": "WSW", "clouds": 75, "uv": 3,
                "ageMs": 41000, "lat": 37.57, "lon": 126.98,
                "tzOffsetMin": 540, "clockOverlay": False,
                "layoutExtended": False, "timeSynced": True,
                "localTime": "23:13:54", "knobs": [0.0, 0.0, 0.0, 0.0],
            })
        if path.startswith("/api/clock"):
            now = time.localtime()
            return self.send_json({
                "ok": True, "on": True, "tz": "KST-9", "h12": False, "rot": 1,
                "face": 0, "faces": ["Bebas Neue", "Anton", "Oswald", "Saira XCond",
                                     "Barlow Cond", "Six Caps", "Squada One"],
                "gap": 10, "sep": 0, "sepw": 2, "in": 0, "out": 0, "dim": 0,
                "ink": "F5F5F5", "bg": "000000", "fade": True,
                "w": 128, "h": 64, "glyphsRev": 0, "synced": True,
                "time": time.strftime("%H:%M:%S", now),
                "today": time.strftime("%a %b %d %Y", now), "zone": "KST",
            })
        if path.startswith("/api/midi"):
            return self.send_json({
                "ok": True, "channel": 1, "outDiv": [1, 1, 4, 1], "outMul": [1, 2, 1, 1], "outMode": "abs",
                "host": "192.168.0.176", "you": "192.168.0.176",
                "runtime": True, "rtpPeers": 1, "rtpPeer": "DESKTOP-STUDIO",
                "ip": "192.168.0.180", "port": 5004,
                "outPos": [64, 90, 12, 127], "rx": 812, "tx": 40,
            })
        if path.startswith("/api/mqtt"):
            return self.send_json({
                "ok": True, "role": "off", "channel": "off", "state": "off",
                "host": "broker.example.org", "user": "patternflow",
                "prefix": "patternflow", "pattern": d.patterns[d.active]["name"],
                "error": "", "mode": "normal", "directorHost": "",
                "flowLocalHost": "192.168.66.1",
                "normalHost": "broker.example.org", "normalUser": "patternflow",
                "normalPrefix": "patternflow", "normalPort": 1883,
                "normalHasPassword": True, "port": 1883, "connected": False,
                "configured": True, "hasPassword": True, "forcesSub": False,
                "knobs": [0, 0, 0, 0], "params": [500, 500, 500, 500],
                "paramActive": [False, False, False, False],
            })

        # -- hotspot: the panel's own network --
        if path == "/api/hotspot":
            hs = getattr(d, "hotspot", {"mode": "auto", "pass": "patternflow", "up": False})
            if self.command == "POST":
                if p.get("mode") in ("off", "auto", "always"):
                    hs["mode"] = p["mode"]
                if "pass" in p:
                    if not 8 <= len(p["pass"]) <= 63:
                        return self.send_json({"ok": False, "error": "password is 8 to 63 characters"}, 400)
                    hs["pass"] = p["pass"]
                hs["up"] = hs["mode"] == "always"
            d.hotspot = hs
            return self.send_json({"ok": True, "pass": hs["pass"], "hotspot": {
                "mode": hs["mode"], "up": hs["up"], "ssid": "patternflow-a1b2",
                "ip": "192.168.4.1" if hs["up"] else "", "channel": 6 if hs["up"] else 0,
                "clients": 0, "dns": 0, "probes": 0},
                "seen": [{"ssid": s, "rssi": -38 - 7 * i} for i, s in enumerate(SEEN_NETWORKS)]})

        # -- knobs: encoder direction and edges per click, with a readout that moves --
        if path == "/api/knobs":
            inv = getattr(d, "knob_inv", [False, False, False, False])
            sub = getattr(d, "knob_sub", [4, 4, 4, 4])
            if self.command == "POST":
                for k in range(4):
                    if ("inv%d" % k) in p:
                        inv[k] = p["inv%d" % k] in ("1", "true", "on")
                    elif "inv" in p:
                        inv[k] = p["inv"] in ("1", "true", "on")
                    if ("sub%d" % k) in p:
                        sub[k] = int(p["sub%d" % k])
                    elif "sub" in p:
                        sub[k] = int(p["sub"])
                d.knob_inv, d.knob_sub = inv, sub
            d.knob_tick = getattr(d, "knob_tick", 0) + 1
            raw = [(d.knob_tick * (k + 1)) % 400 for k in range(4)]
            clicks = [(-r if inv[k] else r) // sub[k] for k, r in enumerate(raw)]
            return self.send_json({"ok": True, "inv": inv, "sub": sub, "clicks": clicks, "raw": raw})

        if path == "/api/params" or path == "/api/display":
            return self.send_json({"ok": True})

        self.send_json({"ok": False, "error": "no mock for " + path}, 404)


if __name__ == "__main__":
    # A Korean Windows console is cp949 and cannot print an em-dash,
    # which is an absurd way for a dev server to die.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description="The device console against a mock device.")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--host", default=os.environ.get("PF_CONSOLE_HOST", "127.0.0.1"))
    ap.add_argument("--device", action="store_true", help="gzip on the wire, as the panel sends it")
    ap.add_argument("--rtt", type=float, default=0.0, help="round trip, seconds")
    ap.add_argument("--bps", type=int, default=0, help="reply bandwidth, bytes/s")
    ap.add_argument("--serial", action="store_true", help="one request at a time")
    ap.add_argument("--slow", action="store_true", help="--device --rtt 0.4 --bps 5000 --serial")
    ap.add_argument("--chrome404", action="store_true",
                    help="/pf-console.js answers 404, so pages run on their fallback PF")
    ap.add_argument("--sketch", help="another copy of firmware/patternflow to serve")
    args = ap.parse_args()
    if args.sketch:
        SKETCH = os.path.abspath(args.sketch)
        HTML_DIR = os.path.join(SKETCH, "console")
        console_pages.set_sketch(SKETCH)
        FEATURE_NAV = feature_nav()
    if not os.path.isdir(HTML_DIR):
        sys.exit("no " + HTML_DIR + "\nrun: python firmware/toolchain/console_pages.py extract")
    if args.slow:
        args.device, args.serial = True, True
        args.rtt = args.rtt or 0.4
        args.bps = args.bps or 5000
    Link.device, Link.rtt, Link.bps, Link.serial = args.device, args.rtt, args.bps, args.serial
    Link.chrome404 = args.chrome404
    print("Patternflow console (mock device)  http://localhost:%d" % args.port)
    print("  pages    " + "  ".join(sorted(ROUTES)))
    print("  caps     /mock?caps=bare   /mock?caps=full")
    print("  variant  /mock?variant=simone-pd   /mock?variant=core")
    print("  status   /mock?hotspot=1   /mock?busy=update   (hotspot=0, busy= to clear)")
    print("  audio    /mock?audio=" + "|".join(AUDIO_STATES) + "|noread")
    print("  editing  firmware/patternflow/console/*.html — just save and refresh")
    print("  shipping python firmware/toolchain/console_pages.py build")
    if Link.device or Link.rtt or Link.bps or Link.serial:
        print("  link     %s rtt %.2fs  %s  %s" % (
            "gzip," if Link.device else "uncompressed,", Link.rtt,
            ("%d B/s" % Link.bps) if Link.bps else "unlimited",
            "one request at a time" if Link.serial else "parallel"))
    if Link.chrome404:
        print("  chrome   /pf-console.js answers 404 - every page is on its fallback PF")
    print()
    try:
        ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
