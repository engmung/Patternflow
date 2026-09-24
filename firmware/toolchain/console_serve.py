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

Pages and the chrome, though, go out exactly as the panel sends them
(src/core_send.h): each page stamped by console_pages.py's own code (the
chrome's ?h= and the fallback PF), with the same ETag, the same 304, and the
same cache policy — `?v=<build>` immutable, a stale `v` 302'd to the
current one, bare URLs revalidated, the chrome immutable only under its own
`h`, and nothing cacheable under a Host that is not an address, a bare name
or .local. The build here changes whenever a page, the chrome or the
fallback is saved, so a saved edit still shows on refresh: the old `v` is
redirected.

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
"""

import argparse
import gzip
import json
import threading
import time
import os
import posixpath
import re
import sys
import urllib.parse
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SKETCH = os.path.normpath(os.path.join(HERE, "..", "patternflow"))
HTML_DIR = os.path.join(SKETCH, "console")

sys.path.insert(0, HERE)
import console_pages  # noqa: E402  the stamp is its code, not a copy of it

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
             "audio-in", "midi"]
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
    an edit."""
    h = 0
    for name in sorted(os.listdir(HTML_DIR)):
        if name.endswith((".html", ".js")):
            h = zlib.crc32(("%s:%d" % (name, os.stat(os.path.join(HTML_DIR, name)).st_mtime_ns)).encode(), h)
    for f in (os.path.join(SKETCH, "src", "theme_index.h"), os.path.join(HERE, "console_pages.py")):
        h = zlib.crc32(str(os.stat(f).st_mtime_ns).encode(), h)
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
        return {
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
        }

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
        if Link.rtt or Link.serial:
            sys.stderr.write("  %s %s -> %s\n" % (self.command, self.path, code))
        else:
            sys.stderr.write("  %s %s\n" % (self.command, self.path))

    # Each request is a connection of its own (Connection: close, here as on
    # the panel): the handshake and the request cost a round trip
    # before the server sees anything, and with --serial nothing else is
    # served meanwhile - the panel's server has one slot.
    def handle_one_request(self):
        if Link.rtt:
            time.sleep(Link.rtt)
        if Link.serial:
            with Link.lock:
                return BaseHTTPRequestHandler.handle_one_request(self)
        return BaseHTTPRequestHandler.handle_one_request(self)

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
        stamps it into the header."""
        f = os.path.join(HTML_DIR, name + ".html")
        if not os.path.exists(f):
            return self.send("no console/%s.html — run console_pages.py extract" % name,
                             "text/plain", 404)
        try:
            text = console_pages.stamp(read(f), console_pages.crc_of(raw_literal(*CHROME_SRC)),
                                       console_pages.load_shim(), name)
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
            return self.reply(302, [("Content-Type", "text/plain"), ("Location", "/"),
                                    ("Cache-Control", NO_STORE), ("Content-Length", "0")])

        if path.startswith("/api/") or path == "/update/status":
            return self.api(path, q, {})

        self.not_found()

    def do_POST(self):
        path, q = self.parts()
        p = dict(q)
        p.update(self.body_params())
        self.api(path, q, p)

    def do_DELETE(self):
        path, q = self.parts()
        self.api(path, q, dict(q), delete=True)

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
