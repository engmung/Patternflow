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

What this is NOT: the firmware. It answers the same URLs with the same
JSON shapes, and that is all it promises. Behaviour that lives in C++ —
what the panel does, whether an upload actually parses — is not modelled
here, and a page that works against the mock still has to be tried on a
device before you believe it.
"""

import json
import os
import posixpath
import re
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SKETCH = os.path.normpath(os.path.join(HERE, "..", "patternflow"))
HTML_DIR = os.path.join(SKETCH, "console")

PORT = int(os.environ.get("PF_CONSOLE_PORT", "8322"))

# URL -> console/<name>.html. Mirrors the routes the firmware registers.
ROUTES = {
    "/": "home",
    "/patterns": "patterns",
    "/status": "status",
    "/wifi": "wifi",
    "/update": "update",
    "/show": "show",
    "/weather": "weather",
    "/mqtt": "mqtt",
    "/audio": "audio",
    "/midi": "midi",
}

# Assets the device serves out of its own headers, extracted live so a change
# to the shared chrome shows up on refresh like everything else.
RAW_ASSETS = {
    "/pf-console.js": ("src/theme_index.h", "JS", "application/javascript"),
    "/patterns/fflate.js": ("src/fflate_js.h", "FFLATE", "application/javascript"),
}

CAPS_FULL = ["patterns", "params", "osc", "sleep", "shows", "weather", "mqtt", "audio"]
CAPS_BARE = ["patterns", "params", "osc", "sleep"]


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

    def status(self):
        p = self.patterns[self.active] if self.patterns else None
        return {
            "version": "3.6.3",
            "variant": self.variant,
            "caps": self.caps,
            "uptime": self.uptime,
            "panel": "128x64",
            "wifi": True,
            "ssid": self.wifi[self.boot_idx]["ssid"] if self.wifi else "",
            "ip": "192.168.0.196",
            "rssi": -47,
            "host": "patternflow",
            "heapInternal": 82300,
            "heapLargest": 73716,
            "heapPsram": 8336335,
            "fsMounted": True,
            "fsTotal": 10240000,
            "fsUsed": 24576,
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
            "refreshHz": 260,
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


class Handler(BaseHTTPRequestHandler):
    server_version = "PatternflowConsoleMock"

    # ── plumbing ─────────────────────────────────────────────────────────
    def log_message(self, fmt, *a):
        sys.stderr.write("  %s %s\n" % (self.command, self.path))

    def send(self, body, ctype="text/html; charset=utf-8", code=200):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, obj, code=200):
        self.send(json.dumps(obj), "application/json", code)

    def parts(self):
        u = urllib.parse.urlsplit(self.path)
        path = posixpath.normpath(urllib.parse.unquote(u.path)) or "/"
        return path, dict(urllib.parse.parse_qsl(u.query))

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
            f = os.path.join(HTML_DIR, ROUTES[path] + ".html")
            if not os.path.exists(f):
                return self.send("no console/%s.html — run console_pages.py extract"
                                 % ROUTES[path], code=404)
            return self.send(read(f))

        if path in RAW_ASSETS:
            rel, tag, ctype = RAW_ASSETS[path]
            try:
                return self.send(raw_literal(rel, tag), ctype)
            except Exception as e:
                return self.send("/* %s */" % e, ctype, 500)

        if path == "/mock":
            if "variant" in q:
                DEV.variant = q["variant"] or "core"
            want = q.get("caps", "full") if "caps" in q else None
            if want is not None:
                DEV.caps = (CAPS_BARE if want == "bare" else CAPS_FULL if want == "full"
                            else [c.strip() for c in want.split(",") if c.strip()])
            self.send_response(302)
            self.send_header("Location", "/")
            self.end_headers()
            return

        if path.startswith("/api/") or path == "/update/status":
            return self.api(path, q, {})

        self.send("not found: " + path, code=404)

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
            return self.send_json({"armed": True, "busy": False, "version": "3.6.3",
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
            return self.send_json({"pendingRev": 0, "pending": []})
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
                return self.send_json({"ok": True, "ssid": ssid,
                                       "switching": p.get("connect") == "1"})
            return self.send_json({
                "max": 5, "connected": True,
                "current": d.wifi[d.boot_idx]["ssid"] if d.wifi else "",
                "ip": "192.168.0.196", "status": "CONNECTED",
                "bootIdx": d.boot_idx, "networks": d.wifi,
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
        if path.startswith("/api/midi"):
            return self.send_json({
                "ok": True, "channel": 1, "outDiv": 2, "outMode": "abs",
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
    if not os.path.isdir(HTML_DIR):
        sys.exit("no " + HTML_DIR + "\nrun: python firmware/toolchain/console_pages.py extract")
    print("Patternflow console (mock device)  http://localhost:%d" % PORT)
    print("  pages    " + "  ".join(sorted(ROUTES)))
    print("  caps     /mock?caps=bare   /mock?caps=full")
    print("  variant  /mock?variant=simone-pd   /mock?variant=core")
    print("  editing  firmware/patternflow/console/*.html — just save and refresh")
    print("  shipping python firmware/toolchain/console_pages.py build\n")
    try:
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
