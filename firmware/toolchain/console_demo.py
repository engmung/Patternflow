"""The device console as static files, for the guide's live demo.

    python firmware/toolchain/console_demo.py           # write web/public/guide/console-demo/
    python firmware/toolchain/console_demo.py --check   # is what is there current?

The guide at /guide shows the console a core board serves - the real pages,
not screenshots - in a window over the page, wired to the 3D board beside it.
This writes what that window loads:

    index.html patterns.html status.html wifi.html knobs.html update.html
                    the core's pages, stamped exactly as console_pages.py
                    stamps them into their headers (console_serve.py serves
                    them the same way), plus two edits to their <head>: the
                    chrome's src made relative, and pf-demo.js loaded first
    pf-console.js   the shared chrome, the PF_CONSOLE_JS literal as the panel
                    sends it
    fflate.js       the zip library /patterns loads, the FFLATE literal
    pf-demo.js      the device: every endpoint those pages and the chrome
                    call, answered from state kept in sessionStorage, and the
                    bridge to the guide (its header comment documents both)

Nothing in a page or in the chrome is rewritten beyond those two tags: the
pages still ask for /api/status, /patterns and the rest, and pf-demo.js
answers them, so the demo is the console as it is, not a copy of it.

Which pages: the ones console_pages.py builds into src/ headers - a core build
serves those and no feature's. What the board says about itself comes from
where the truth already lives, so a release moves the demo with it:

    version, hostname, hotspot     net_config.h
    build id                       the core image in web/public/flash/bin (the
                                   ELF SHA-256 at 0xb0, as src/core_build.h reads it)
    newest release                 web/public/flash/manifest.json
    brightness                     config.h DEFAULT_BRIGHTNESS
    Wi-Fi slots                    src/core_wifi.h MAX_NETWORKS
    modules, names, sizes, order   web/public/packs/basics.zip (read here; not copied:
                                   the folder has a budget, and the pack's bytes
                                   would be a third of it for "Download ZIP" alone)
    the board's address            web/src/lib/guide/deviceSim.ts SIM_IP

Rerun it after any change to a console page, the chrome, the fallback shim,
those sources, or MOCK_JS below; `--check` exits 1 when the folder is stale
(page/chrome/pack edits land there, and the next release bumps the version).
The folder is this script's alone: it is emptied and rewritten each run.
"""

import argparse
import hashlib
import json
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import console_pages  # noqa: E402  the stamp is its code, not a copy of it
import console_serve  # noqa: E402  the chrome's source and the device's routes

REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
SKETCH = console_serve.SKETCH
WEB = os.path.join(REPO, "web")
OUT = os.path.join(WEB, "public", "guide", "console-demo")
BUDGET = 350 * 1024  # the whole folder, bytes on disk

# The neighbours a channel scan would hear, once the hotspot has come up
# (/api/hotspot "seen"). The panel's own network first; the rest are the
# default names routers ship with here.
NEIGHBOURS = [("iptime", -71), ("U+Net4E21", -77), ("SK_WiFiGIGA7A1C", -83)]
ALIAS = "patternflow-5c2e"   # PF_OTA_HOSTNAME + the last two MAC bytes
FS_TOTAL = 10240000          # FFat.totalBytes() of the 0x9E0000 ffat partition, off a real panel
FLASH_ID = "c84018"


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def define(rel, name):
    m = re.search(r'#define\s+%s\s+("?)([^"\s]+)\1' % name, read(os.path.join(SKETCH, rel)))
    if not m:
        raise SystemExit("%s: no #define %s" % (rel, name))
    return m.group(2)


def core_pages():
    """(device path, page name, file) for every page the core serves: the
    console_pages.py targets whose header lives in src/, in nav order."""
    path_of = {name: path for path, name in console_serve.ROUTES.items()}
    out = []
    for name, rel in console_pages.PAGES:
        if not rel.startswith("src/"):
            continue
        if name not in path_of:
            raise SystemExit("console_serve.ROUTES has no path for the core page %s" % name)
        path = path_of[name]
        out.append((path, name, "index.html" if path == "/" else name + ".html"))
    return out


def core_image():
    """The app image the flasher installs for this release, from its manifest."""
    manifest = json.loads(read(os.path.join(WEB, "public", "flash", "manifest.json")))
    for build in manifest.get("builds", []):
        for part in build.get("parts", []):
            if part.get("offset") == 0x10000:
                return manifest, os.path.join(WEB, "public", "flash", part["path"].replace("/", os.sep))
    raise SystemExit("flash/manifest.json names no app image at 0x10000")


def build_id(image):
    """PFBuild::id(): the first four bytes of the ELF SHA-256 esptool stamps
    into esp_app_desc_t, 0xb0 into the image."""
    with open(image, "rb") as f:
        head = f.read(180)
    if len(head) < 180 or head[0] != 0xE9:
        raise SystemExit("%s: not an ESP32 app image" % image)
    return head[176:180].hex()


def basics():
    """(modules [{slug, name, pfm, json}], catalog [slugs]) off the pack."""
    path = os.path.join(WEB, "public", "packs", "basics.zip")
    z = zipfile.ZipFile(path)
    sizes = {i.filename: i.file_size for i in z.infolist()}
    mods = []
    for name in sorted(sizes):
        if not name.endswith(".pfm"):
            continue
        slug = name[:-4]
        side = slug + ".json"
        display = slug
        if side in sizes:
            display = json.loads(z.read(side).decode("utf-8")).get("name") or slug
        mods.append({"slug": slug, "name": display[:39], "pfm": sizes[name],
                     "json": sizes.get(side, 0)})
    catalog = []
    if "catalog.txt" in sizes:
        for line in z.read("catalog.txt").decode("utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                catalog.append(line)
    return mods, catalog


def sim_ip():
    text = read(os.path.join(WEB, "src", "lib", "guide", "deviceSim.ts"))
    m = re.search(r'export const SIM_IP = "([0-9.]+)"', text)
    if not m:
        raise SystemExit("deviceSim.ts: no SIM_IP")
    return m.group(1)


def guide_ssid():
    """The network the guide's flashing step joins (Extras.tsx, WifiForm)."""
    try:
        m = re.search(r'const ssid = "([^"]+)"',
                      read(os.path.join(WEB, "src", "components", "guide", "Extras.tsx")))
        if m:
            return m.group(1)
    except OSError:
        pass
    print("  note: Extras.tsx names no ssid; using Studio_2.4G", file=sys.stderr)
    return "Studio_2.4G"


def seed():
    manifest, image = core_image()
    mods, catalog = basics()
    pages = core_pages()
    ssid = guide_ssid()
    s = {
        "version": define("net_config.h", "PF_IMPROV_FW_VERSION"),
        "build": build_id(image),
        "manifestVersion": str(manifest.get("version", "")).lstrip("v"),
        "host": define("net_config.h", "PF_OTA_HOSTNAME"),
        "alias": ALIAS,
        "ip": sim_ip(),
        "ssid": ssid,
        "neighbours": [[ssid, -48]] + [[n, r] for n, r in NEIGHBOURS],
        "hotspotPass": define("net_config.h", "PF_HOTSPOT_PASS"),
        "maxNetworks": int(re.search(r"MAX_NETWORKS\s*=\s*(\d+)",
                                     read(os.path.join(SKETCH, "src", "core_wifi.h"))).group(1)),
        "brightness": int(define("config.h", "DEFAULT_BRIGHTNESS")),
        "fsTotal": FS_TOTAL,
        "flashId": FLASH_ID,
        "modules": mods,
        "catalog": catalog,
        "pages": {path: f for path, _, f in pages},
        "assets": {"/pf-console.js": "pf-console.js", "/patterns/fflate.js": "fflate.js"},
    }
    s["id"] = hashlib.sha1(json.dumps(s, sort_keys=True).encode()).hexdigest()[:10]
    return s, pages


def demo_page(html, name, chrome_crc, shim, mock_tag):
    """A page as its header carries it, with the chrome's src made relative
    and the device loaded before it."""
    text = console_pages.stamp(html, chrome_crc, shim, name)
    src = '<script src="/pf-console.js?h='
    if text.count(src) != 1:
        raise SystemExit("%s: expected one stamped chrome tag" % name)
    text = text.replace(src, '<script src="pf-console.js?h=')
    first = text.find("<script")
    head_end = text.lower().find("</head>")
    if first < 0 or head_end < 0 or first > head_end:
        raise SystemExit("%s: its first <script> is not in <head>" % name)
    return text[:first] + mock_tag + text[first:]


def payload(text):
    return text.replace("\r\n", "\n").encode("utf-8")


def render():
    """{file name: bytes} - everything the folder should hold."""
    s, pages = seed()
    chrome = console_serve.raw_literal(*console_serve.CHROME_SRC)
    fflate = console_serve.raw_literal(*console_serve.RAW_ASSETS["/patterns/fflate.js"][:2])
    mock = payload(MOCK_JS.replace("/*SEED*/null", json.dumps(s, separators=(",", ":"))))
    mock_tag = '<script src="pf-demo.js?h=%08x"></script>' % (
        __import__("zlib").crc32(mock) & 0xFFFFFFFF)
    crc = console_pages.crc_of(chrome)
    shim = console_pages.load_shim()
    files = {
        "pf-console.js": payload(chrome),
        "fflate.js": payload(fflate),
        "pf-demo.js": mock,
    }
    for _, name, fname in pages:
        html = read(os.path.join(console_serve.HTML_DIR, name + ".html"))
        files[fname] = payload(demo_page(html, name, crc, shim, mock_tag))
    total = sum(len(b) for b in files.values())
    if total > BUDGET:
        raise SystemExit("console demo is %d bytes, over the %d budget" % (total, BUDGET))
    return files, total


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description="Write the guide's console demo.")
    ap.add_argument("--check", action="store_true", help="exit 1 if the folder is stale")
    args = ap.parse_args()
    files, total = render()
    if args.check:
        have = set(os.listdir(OUT)) if os.path.isdir(OUT) else set()
        stale = sorted(n for n, b in files.items()
                       if n not in have or open(os.path.join(OUT, n), "rb").read() != b)
        stale += sorted(have - set(files))
        if stale:
            print("console demo is stale: %s\nrun: python firmware/toolchain/console_demo.py"
                  % ", ".join(stale))
            sys.exit(1)
        print("console demo current (%d files, %d bytes)" % (len(files), total))
        return
    os.makedirs(OUT, exist_ok=True)
    for n in os.listdir(OUT):
        p = os.path.join(OUT, n)
        if os.path.isfile(p):
            os.remove(p)
    for n, b in sorted(files.items()):
        with open(os.path.join(OUT, n), "wb") as f:
            f.write(b)
    print("wrote %d files, %d bytes -> %s" % (len(files), total, os.path.relpath(OUT, REPO)))
    for n, b in sorted(files.items()):
        print("  %-14s %7d" % (n, len(b)))


# ── the device ─────────────────────────────────────────────────────────────
# pf-demo.js, with /*SEED*/null replaced by seed() above.

MOCK_JS = r'''/* Patternflow console demo: a core board, simulated in the page.
 * GENERATED by firmware/toolchain/console_demo.py -- edit MOCK_JS there, rerun.
 *
 * Loaded first on every page of the demo, before the console's own chrome
 * (pf-console.js), which therefore wraps this fetch instead of the browser's.
 * The pages and the chrome are the device's, unmodified: they ask for
 * /api/status, /api/patterns, /update/status ... and this answers them the way
 * the firmware does (the handlers below cite the C++ they follow), from one
 * board's state in sessionStorage - so every demo page and every demo frame
 * in the tab sees the same board, and it survives navigation and reloads.
 *
 *   fetch / XMLHttpRequest   device URLs are answered here; the demo's own
 *                            files go to the network; anything else fails
 *                            like an offline LAN (and is logged). Nothing
 *                            leaves /guide/console-demo/.
 *   links, <script src>,     device paths (/patterns, /pf-console.js, http://
 *   history, navigation      <board address>/) become the demo's files, so a
 *                            click never lands on the site outside the demo.
 *   the footer's host name   what the frame was told to be (below), not the
 *                            site's.
 *
 * The frame's name tells it where it is: name="pf-demo host=192.168.0.42"
 * (default patternflow.local).
 *
 * BRIDGE - window.postMessage between this frame and its parent, both ways
 * only when event.origin === location.origin (and from window.parent).
 *
 *   demo -> parent   {type:'pf-console', action:'ready', page, modules:[slug], inv:[4], sub:[4]}
 *                    {type:'pf-console', action:'select', index, name, slug}
 *                        slug 'origin' for the built-in; index is the device's
 *                    {type:'pf-console', action:'knob', knob:0..3, value:0..1000}
 *                        POST /api/params pN: the absolute bus, 0..1000
 *                    {type:'pf-console', action:'brightness', percent, level}
 *                        level: the panel's brightness byte, 5..255
 *                    {type:'pf-console', action:'sleep', on}
 *                    {type:'pf-console', action:'modules', modules:[slug]}
 *                        the installed modules in device order, after any change
 *                    {type:'pf-console', action:'knobSettings', inv:[4], sub:[4]}
 *                    {type:'pf-console', action:'escape'}   Esc pressed in the page
 *   parent -> demo   {type:'pf-sim', sid, patternIndex, patternName, patternSlug,
 *                     knobs:[4], brightness, level, sleeping, off}
 *                        knobs: detents each encoder has turned (clockwise +)
 *                        since the parent's page loaded, sid naming that load;
 *                        brightness in percent, level the byte; off: no power.
 *                        The board follows: what plays, how bright, asleep,
 *                        where the encoders are. A value the console itself
 *                        just set wins for 1.5 s over a message already in flight.
 *
 * window.PFDemo (for tests): state(), reset(), log - every request seen,
 * {kind, method, url} with kind device|demo|site|refused.
 */
(function () {
  'use strict';
  var SEED = /*SEED*/null;
  var W = window, D = document, L = location;
  if (W.PFDemo) return;
  var BASE = L.pathname.replace(/[^\/]*$/, '');
  var FILE = L.pathname.slice(BASE.length) || 'index.html';
  var HOST = (/(?:^|\s)host=(\S+)/.exec(W.name || '') || [0, SEED.host + '.local'])[1];
  var DEVICE_HOSTS = [SEED.ip, SEED.host, SEED.host + '.local', SEED.alias, SEED.alias + '.local', HOST];
  var EMBEDDED = W.parent !== W;
  var MANIFEST = /^https:\/\/patternflow\.work\/flash\/manifest\.json(?:[?#]|$)/;
  var KEY = 'pf-demo:board';
  var realFetch = W.fetch;
  var RealXHR = W.XMLHttpRequest;
  var log = [];
  function now() { return Date.now(); }
  function note(kind, method, url) { log.push({ kind: kind, method: method, url: String(url) }); if (log.length > 400) log.shift(); }

  // ── where a URL goes ────────────────────────────────────────────────────
  function norm(p) { return p.length > 1 ? p.replace(/\/+$/, '') : p; }
  // The device path a URL means, or null when it is not the device's.
  function devicePath(u) {
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.origin === L.origin) return u.pathname.indexOf(BASE) === 0 ? null : norm(u.pathname);
    return DEVICE_HOSTS.indexOf(u.hostname) >= 0 ? norm(u.pathname) : null;
  }
  // The demo file for a device page or asset URL, or null.
  function toDemo(v) {
    var u;
    try { u = new URL(v, L.href); } catch (e) { return null; }
    var p = devicePath(u);
    if (p === null) return null;
    var f = SEED.pages[p] || SEED.assets[p];
    return f ? BASE + f + u.search + u.hash : null;
  }
  function external(v) {
    try {
      var u = new URL(v, L.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') && devicePath(u) === null && u.origin !== L.origin;
    } catch (e) { return false; }
  }

  // ── the board ───────────────────────────────────────────────────────────
  function fresh() {
    var t = now();
    return {
      id: SEED.id, build: SEED.build, bootAt: t - 1380e3, resetReason: 'poweron',
      off: false, reboot: null, sleep: false, brightness: SEED.brightness,
      params: [500, 500, 500, 500], held: [false, false, false, false], heldAt: [0, 0, 0, 0],
      active: 'origin', load: { total: 0, read: 0, relocate: 0, setup: 0, internal: 0, psram: 0 }, loads: 0,
      mounted: true, modules: SEED.modules.map(function (m) { return { slug: m.slug, name: m.name, pfm: m.pfm, json: m.json }; }),
      catalog: SEED.catalog.slice(), storageUntil: 0,
      wifi: { networks: [{ ssid: SEED.ssid, pass: 'studio-guest' }], bootIdx: 0, current: SEED.ssid, join: null },
      hotspot: { mode: 'auto', pass: SEED.hotspotPass, up: false, scanned: false },
      knob: { inv: [false, false, false, false], sub: [4, 4, 4, 4], raw: [0, 0, 0, 0], baseRaw: [0, 0, 0, 0], baseClicks: [0, 0, 0, 0], sid: null, turns: [0, 0, 0, 0] },
      update: { uploading: false, attempts: 0, lastOk: false, lastError: '', lastRejected: false, received: 0, expected: 0 },
      localAt: { pattern: 0, brightness: 0, sleep: 0 }
    };
  }
  var memory = null;
  function load() {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { s = memory; }
    if (!s && memory) s = memory;
    if (!s || s.id !== SEED.id) s = fresh();
    settle(s);
    return s;
  }
  function save(s) {
    memory = s;
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  // Read, change, write in one go: every frame of the demo shares the board,
  // and frames of one origin share one thread, so this cannot interleave.
  function tx(fn) { var s = load(); var r = fn(s); save(s); return r; }

  // Timed things resolve when the board is next looked at.
  function settle(s) {
    var t = now();
    if (s.reboot && t >= s.reboot.until) {
      var build = s.reboot.build || s.build;
      s.build = build; s.bootAt = s.reboot.until; s.resetReason = s.reboot.reason || 'sw'; s.reboot = null;
      s.sleep = false; s.held = [false, false, false, false];
      s.knob.raw = [0, 0, 0, 0]; s.knob.baseRaw = [0, 0, 0, 0]; s.knob.baseClicks = [0, 0, 0, 0];
      s.load = { total: 0, read: 0, relocate: 0, setup: 0, internal: 0, psram: 0 };
      s.update = { uploading: false, attempts: 0, lastOk: false, lastError: '', lastRejected: false, received: 0, expected: 0 };
      var w = s.wifi, n = w.networks.length;
      for (var i = 0; i < n; i++) {
        var net = w.networks[(w.bootIdx + i) % n];
        if (inRange(net.ssid) && passOk(net)) { w.current = net.ssid; break; }
      }
      w.join = null;
    }
    var j = s.wifi.join;
    if (j && !j.done && t - j.at >= 3000) {
      j.done = true;
      if (j.ok) s.wifi.current = j.ssid;
    }
  }
  function down(s) { return s.off || !!(s.reboot && now() >= s.reboot.at); }

  function inRange(ssid) { return SEED.neighbours.some(function (n) { return n[0] === ssid; }); }
  function passOk(net) { return net.ssid !== SEED.ssid || net.pass.length >= 8; }

  // ── patterns (pattern_registry.h) ────────────────────────────────────────
  // FAT order is sorted by path, then catalog.txt moves the listed ones to the
  // front in file order (applyCatalogOrder); names come from the sidecar.
  function modules(s) {
    if (!s.mounted) return [];
    var m = s.modules.filter(function (x) { return x.pfm > 0; }).sort(function (a, b) {
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
    var placed = 0;
    s.catalog.forEach(function (line) {
      if (placed >= m.length) return;
      for (var i = placed; i < m.length; i++) {
        if (m[i].slug !== line) continue;
        var x = m.splice(i, 1)[0];
        m.splice(placed++, 0, x);
        break;
      }
    });
    return m;
  }
  function list(s) {
    var out = [{ index: 0, name: 'Origin', module: null }];
    modules(s).forEach(function (m, i) { out.push({ index: i + 1, name: m.name || fromSlug(m.slug), module: m.slug }); });
    return out;
  }
  function fromSlug(slug) { // displayNameFromSlug
    var out = '', up = true;
    for (var i = 0; i < slug.length && out.length < 39; i++) {
      var c = slug.charAt(i);
      if (c === '_' || c === '-') { out += ' '; up = true; }
      else { out += up && c >= 'a' && c <= 'z' ? c.toUpperCase() : c; up = false; }
    }
    return out;
  }
  function activeIndex(s, l) {
    if (s.active === 'origin') return 0;
    for (var i = 1; i < l.length; i++) if (l[i].module === s.active) return i;
    return 0;
  }
  function hash(t) { var h = 2166136261; for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function setActive(s, slug, local) {
    if (slug !== 'origin' && !modules(s).some(function (m) { return m.slug === slug; })) slug = 'origin';
    if (slug !== s.active && slug !== 'origin') {
      var m = s.modules.filter(function (x) { return x.slug === slug; })[0], h = hash(slug);
      var total = 21000 + h % 24000, read = Math.round(total * (0.34 + (h >>> 8) % 12 / 100));
      var relocate = Math.round(total * 0.18), setup = total - read - relocate;
      s.load = { total: total, read: read, relocate: relocate, setup: setup,
        internal: 1200 + (h >>> 4) % 2600, psram: Math.round((m ? m.pfm : 6000) * 1.3) };
      s.loads++;
    }
    s.active = slug;
    if (local) s.localAt.pattern = now();
  }
  function moduleSlugs(s) { return modules(s).map(function (m) { return m.slug; }); }
  function slugOf(name) { // slugFromFilename
    var base = String(name).split(/[\\\/]/).pop(), dot = base.lastIndexOf('.');
    if (dot > 0) base = base.slice(0, dot);
    return base.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 39);
  }
  function fsUsed(s) {
    if (!s.mounted) return 0;
    var c = function (n) { return n ? Math.ceil(n / 4096) * 4096 : 0; }, u = 16384;
    s.modules.forEach(function (m) { u += c(m.pfm) + c(m.json); });
    if (s.catalog.length) u += 4096;
    return u;
  }

  // ── knobs (core_encoders.h): clicks = edges / edges-per-click, re-based on
  // every settings change so a saved change does not move the knob.
  function clicks(s) {
    var k = s.knob;
    return k.raw.map(function (r, i) { return k.baseClicks[i] + Math.trunc((k.inv[i] ? -1 : 1) * (r - k.baseRaw[i]) / k.sub[i]); });
  }

  // ── /api/status (core_status_http.h handleStatus, field for field) ──────
  function status(s) {
    var t = now(), up = Math.max(0, Math.floor((t - s.bootAt) / 1000)), l = list(s), a = activeIndex(s, l);
    var mod = a > 0, h = hash(s.active), frameUs = s.active === 'origin' ? 12048 : 11800 + h % 4800;
    var jit = function (n, k) { return n + ((hash(String(Math.floor(t / 3000)) + k) % 400) - 200); };
    var hs = s.hotspot, w = s.wifi, busy = s.update.uploading || s.reboot ? 'update' : t < s.storageUntil ? 'storage' : '';
    var c = clicks(s);
    return {
      version: SEED.version, build: s.build, variant: 'core', variantVersion: '',
      caps: ['patterns', 'params', 'sleep'], featureNav: [],
      uptime: up, resetReason: s.resetReason, panel: '128x64',
      wifi: true, ssid: w.current, ip: SEED.ip, rssi: w.current === SEED.ssid ? -52 + (hash(String(Math.floor(t / 6000))) % 5) - 2 : -69,
      host: SEED.host, hostAlias: SEED.alias,
      hotspot: hotspotJson(s), viaHotspot: false,
      network: { disconnects: 0, retries: 0, reconnectMs: 0, namesReady: true, announcements: 1 },
      txDbm: 19.5,
      heapInternal: jit(mod ? 71836 - s.load.internal : 74212, 'hi'), heapLargest: mod ? 61440 : 65536,
      heapPsram: 8336335 - (mod ? s.load.psram + 16384 : 0),
      fsMounted: s.mounted, fsTotal: s.mounted ? SEED.fsTotal : 0, fsUsed: fsUsed(s), fsError: '', flashId: SEED.flashId,
      patterns: l.length, presets: 1, modules: l.length - 1,
      active: l[a].name, activeIsModule: mod, loading: false,
      sleep: s.sleep, brightness: s.brightness,
      knobs: c, params: s.params.slice(),
      laneActive: [false, false, false, false], lanes: [0, 0, 0, 0], paramActive: s.held.slice(),
      consolePaused: false, busy: busy,
      frameUs: jit(frameUs, 'fu'), presentUs: 9947, loopCore: 1, httpCore: 0,
      netMaintenance: { calls: up * 50, maxGapMs: 38 }, netStackMin: 4376,
      runtime: { loops: Math.floor(up * 1e6 / frameUs), lastUs: frameUs, maxUs: 41872, over50ms: 0, housekeepingMaxUs: 2911, syncMaxUs: 386 },
      loopSyncServed: up * 3, loopSyncMaxUs: 412,
      colorBits: 8, refreshHz: 300, loadError: '',
      load: s.load,
      moduleMemory: { reserve: 24576, runtimeBytes: mod ? 3072 : 0, runtimePeakBytes: s.loads ? 5120 : 0, runtimeLimit: 4194304,
        loaderStackBytes: 8192, loaderStackMin: s.loads ? 5264 : 8192, loaderRetries: 0,
        serviceFree: jit(mod ? 43008 : 47104, 'sf'), budget: 22528, codeBytes: mod ? s.load.internal : 0,
        execLargest: mod ? 30720 : 32768, refusals: 0 },
      nvs: { usable: true, failures: 0 },
      thumbs: { captures: s.loads, reads: 0, writes: s.loads, captureMaxUs: s.loads ? 1840 : 0, ioMaxUs: s.loads ? 21960 : 0 }
    };
  }
  function hotspotJson(s) {
    var h = s.hotspot;
    return { mode: h.mode, up: h.up, ssid: SEED.alias, ip: h.up ? '192.168.4.1' : '', channel: h.up ? 11 : 0, clients: 0, dns: 0 };
  }

  // ── the handlers ────────────────────────────────────────────────────────
  function J(obj, status) { return { status: status || 200, type: 'application/json', body: JSON.stringify(obj) }; }
  var NOT_FOUND = { status: 404, type: 'text/plain', body: 'Not found' }; // core_http.h onNotFound
  function toInt(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function truthy(v) { return v === '1' || v === 'true' || v === 'on'; }

  // WebServer's arg(): the query, then a form body; `plain` is a body that is
  // not a form.
  function args(u, b) {
    var q = new URLSearchParams(u.search), f = null;
    if (b.form) f = b.form;
    else if (b.text !== null && /^application\/x-www-form-urlencoded/i.test(b.ctype)) f = new URLSearchParams(b.text);
    return {
      has: function (k) { return q.has(k) || !!(f && f.has(k)); },
      get: function (k) { return q.has(k) ? q.get(k) : f && f.has(k) ? String(f.get(k)) : ''; },
      plain: b.text !== null && !f ? b.text : ''
    };
  }

  // A route first (/update is a page for GET and the upload for POST), then
  // a page - which only the chrome's prefetch asks for, and which it only
  // keeps for the cache.
  function device(method, u, path, b, H) {
    var R = ROUTES[method + ' ' + path];
    if (R) return R(args(u, b), b, H, u);
    if (SEED.pages[path] && method === 'GET') return { status: 200, type: 'text/html', body: '' };
    if (path === '/favicon.ico') return { status: 204, type: 'text/html', body: '' };
    return NOT_FOUND;
  }

  var ROUTES = {
    'GET /api/status': function () { return J(status(load())); },

    // core_status_http.h handleSleep: queued, performed on the next loop pass
    'POST /api/sleep': function (A) {
      var on = (A.has('on') ? A.get('on') : '1').toLowerCase().trim();
      return tx(function (s) {
        var was = s.sleep, want;
        if (on === 'toggle') want = !was;
        else if (on === '1' || on === 'true' || on === 'sleep') want = true;
        else if (on === '0' || on === 'false' || on === 'wake') want = false;
        else return J({ ok: false, error: 'on must be 1, 0, or toggle' }, 400);
        s.sleep = want; s.localAt.sleep = now();
        tell({ action: 'sleep', on: want });
        return J({ ok: true, requested: want, sleep: was });
      });
    },

    // handleParams: pN 0..1000 holds the lane; dN clicks; rN releases
    'POST /api/params': function (A) {
      return tx(function (s) {
        var written = 0, error = '', i, sent = [];
        for (i = 0; i < 4 && !error; i++) {
          var k = 'p' + (i + 1);
          if (A.has(k)) {
            var raw = A.get(k).trim(), v = toInt(raw);
            if (!raw.length || v < 0 || v > 1000) { error = k + ' must be 0..1000'; break; }
            s.params[i] = v; s.held[i] = true; s.heldAt[i] = now(); written++; sent.push([i, v]);
          }
          var d = 'd' + (i + 1);
          if (A.has(d)) {
            var dv = toInt(A.get(d));
            if (dv < -100 || dv > 100) { error = d + ' must be -100..100'; break; }
            written++;
          }
          var r = 'r' + (i + 1);
          if (A.has(r) && A.get(r) !== '0') { s.held[i] = false; written++; }
        }
        if (error) return J({ ok: false, error: error }, 400);
        if (!written) return J({ ok: false, error: 'send at least one of p1..p4' }, 400);
        sent.forEach(function (p) { tell({ action: 'knob', knob: p[0], value: p[1] }); });
        return J({ ok: true, params: s.params.slice(), active: s.held.slice() });
      });
    },

    // core_display_http.h: brightness 5..255, and the display state back
    'GET /api/display': function (A) {
      return tx(function (s) {
        if (A.has('brightness')) {
          var v = toInt(A.get('brightness'));
          if (v >= 5 && v <= 255) {
            s.brightness = v; s.localAt.brightness = now();
            tell({ action: 'brightness', level: v, percent: Math.trunc((v * 100 + 127) / 255) });
          }
        }
        return J({ wb_r: 1, wb_g: 1, wb_b: 1, gamma_r: 2.2, gamma_g: 2.2, gamma_b: 2.2, sat: 1.62,
          brightness: s.brightness, calib: 0, screen: 0, level: 255, sleep: s.sleep ? 1 : 0,
          power_limit: 1, power_budget: 3000, power_ma: 0, power_demand: 0, power_limiting: 0, power_applied: s.brightness });
      });
    },

    // core_patterns_http.h
    'GET /api/patterns': function () {
      var s = load(), l = list(s);
      return J({ active: activeIndex(s, l), presets: 1, mounted: s.mounted,
        free: s.mounted ? SEED.fsTotal - fsUsed(s) : 0, patterns: l, pendingRev: 0, pending: [] });
    },
    'GET /api/patterns/select': function (A) {
      return tx(function (s) {
        var l = list(s), n = l.length, cur = activeIndex(s, l), idx = -1, i;
        if (A.has('step')) idx = ((cur + (toInt(A.get('step')) >= 0 ? 1 : -1)) % n + n) % n;
        else if (A.has('index')) idx = toInt(A.get('index'));
        else if (A.has('name')) for (i = 0; i < n; i++) if (l[i].name === A.get('name')) { idx = i; break; }
        if (idx < 0 || idx >= n) return J({ ok: false, error: 'no such pattern' }, 404);
        setActive(s, l[idx].module || 'origin', true);
        tell({ action: 'select', index: idx, name: l[idx].name, slug: l[idx].module || 'origin' });
        return J({ ok: true, index: idx, name: l[idx].name });
      });
    },
    'GET /api/patterns/pending': function () { return J({ rev: 0, slugs: [] }); },
    'GET /api/patterns/file': function (A) {
      var s = load();
      if (!s.mounted) return J({ ok: false, error: 'storage not mounted' }, 409);
      if (!A.has('slug')) return J({ ok: false, error: 'missing slug' }, 400);
      var slug = slugOf(A.get('slug') + '.pfm'), ext = (A.has('ext') ? A.get('ext') : 'pfm').toLowerCase();
      if (!slug) return J({ ok: false, error: 'invalid slug' }, 400);
      if (ext !== 'pfm' && ext !== 'json' && ext !== 'thumb') return J({ ok: false, error: 'ext must be pfm, json or thumb' }, 400);
      var m = s.modules.filter(function (x) { return x.slug === slug; })[0];
      if (ext === 'thumb' || !m || !m[ext]) return J({ ok: false, error: 'not found' }, 404);
      // A file this session uploaded comes back as it went in. The pack's own
      // bytes are not in the demo (see console_demo.py), so its modules
      // cannot be read out: the answer FFat.open failing gets.
      return fileBytes(m, ext).then(function (bytes) {
        if (!bytes) return J({ ok: false, error: 'cannot open' }, 500);
        return { status: 200, type: ext === 'json' ? 'application/json' : 'application/octet-stream', body: bytes,
          headers: { 'Content-Disposition': 'attachment; filename="' + slug + '.' + ext + '"' } };
      });
    },
    'PUT /api/patterns': function (A, b, H) { return upload(b, H['x-pf-name'] || '', H['x-pf-last']); },
    'POST /api/patterns': function (A, b) { return upload(b, b.name || '', A.has('last') ? A.get('last') : undefined); },
    'DELETE /api/patterns': function (A) {
      if (!A.has('slug')) return J({ ok: false, error: 'missing slug' }, 400);
      var slug = slugOf(A.get('slug') + '.pfm');
      if (!slug) return J({ ok: false, error: 'invalid slug' }, 400);
      return tx(function (s) {
        if (!s.mounted || !remove(s, slug)) return J({ ok: false, error: 'no such module' }, 404);
        rescanned(s);
        return J({ ok: true });
      });
    },
    'POST /api/patterns/delete': function (A) {
      return tx(function (s) {
        if (!s.mounted) return J({ ok: false, error: 'storage not mounted' }, 409);
        var body = A.plain.trim(), removed = 0, missing = 0;
        if (!body) return J({ ok: false, error: 'no slugs given' }, 400);
        if (body === '*') {
          // Every .pfm on the volume, each with its sidecar; a sidecar with no
          // module beside it is not what this pass looks for.
          s.modules.filter(function (m) { return m.pfm > 0; }).forEach(function (m) {
            if (remove(s, m.slug)) removed++;
          });
        } else {
          body.split('\n').forEach(function (line) {
            line = line.trim();
            if (!line) return;
            var slug = slugOf(line + '.pfm');
            if (slug && remove(s, slug)) removed++; else missing++;
          });
        }
        s.storageUntil = now() + 400 + removed * 40;
        rescanned(s);
        return J({ ok: true, removed: removed, missing: missing });
      });
    },
    'POST /api/patterns/format': function () {
      return tx(function (s) {
        s.modules = []; s.catalog = []; s.mounted = true; s.storageUntil = now() + 2600;
        dropFiles();
        rescanned(s);
        return J({ ok: true });
      });
    },

    // core_wifi_http.h
    'GET /api/wifi': function () {
      var s = load(), w = s.wifi, j = w.join, t = now(),
        join = { state: 'none', ssid: '', ip: '', why: '', reason: 0, ago: 0 };
      if (j) {
        var since = Math.floor((t - j.at) / 1000);
        join.ssid = j.ssid;
        if (!j.done) { join.state = 'trying'; join.ago = since; }
        else if (j.ok) { join.state = 'joined'; join.ip = SEED.ip; join.ago = Math.max(0, since - 3); }
        else { join.state = 'failed'; join.why = j.why; join.reason = j.reason; join.ago = Math.max(0, since - 3); }
      }
      return J({ max: SEED.maxNetworks, connected: true, current: w.current, ip: SEED.ip, status: 'CONNECTED',
        bootIdx: bootIdx(w), join: join, networks: w.networks.map(function (n) { return { ssid: n.ssid }; }) });
    },
    'POST /api/wifi': function (A) {
      if (!A.has('ssid')) return J({ ok: false, error: 'missing ssid' }, 400);
      var ssid = A.get('ssid'), pass = A.has('pass') ? A.get('pass') : '';
      if (!ssid.length || ssid.length > 32) return J({ ok: false, error: 'ssid must be 1-32 characters' }, 400);
      if (pass.length > 63) return J({ ok: false, error: 'password too long' }, 400);
      var connect = A.has('connect') && A.get('connect') === '1';
      return tx(function (s) {
        var w = s.wifi;
        addNetwork(w, ssid, pass);
        if (connect) {
          var found = inRange(ssid), ok = found && passOk({ ssid: ssid, pass: pass });
          w.join = { ssid: ssid, at: now(), done: false, ok: ok,
            why: !found ? 'network not found' : ok ? '' : 'wrong password', reason: !found ? 201 : ok ? 0 : 15 };
        }
        return J({ ok: true, ssid: ssid, saved: w.networks.length, switching: connect });
      });
    },
    'DELETE /api/wifi': function (A) {
      if (!A.has('ssid')) return J({ ok: false, error: 'missing ssid' }, 400);
      var ssid = A.get('ssid');
      return tx(function (s) {
        return removeNetwork(s.wifi, ssid) ? J({ ok: true }) : J({ ok: false, error: 'not saved' }, 404);
      });
    },
    'POST /api/wifi/boot': function (A) {
      if (!A.has('bootIdx')) return J({ ok: false, error: 'missing bootIdx' }, 400);
      var i = toInt(A.get('bootIdx'));
      return tx(function (s) {
        var w = s.wifi;
        if (!w.networks.length || i < 0 || i >= w.networks.length) return J({ ok: false, error: 'invalid boot index' }, 400);
        w.bootIdx = i;
        return J({ ok: true, bootIdx: i, reboot: true });
      });
    },
    'POST /api/wifi/reboot': function () {
      return tx(function (s) { var t = now(); s.reboot = { at: t + 400, until: t + 6400 }; return J({ ok: true, rebooting: true }); });
    },
    'POST /api/wifi/reconnect': function () { return J({ ok: true, reconnecting: true }); },

    // core_hotspot.h
    'GET /api/hotspot': function () { return J(hotspotReply(load())); },
    'POST /api/hotspot': function (A) {
      return tx(function (s) {
        var h = s.hotspot;
        if (A.has('mode')) {
          var m = A.get('mode');
          if (m !== 'off' && m !== 'auto' && m !== 'always') return J({ ok: false, error: 'mode is off, auto or always' }, 400);
          h.mode = m;
        }
        if (A.has('pass')) {
          var p = A.get('pass');
          if (p.length < 8 || p.length > 63) return J({ ok: false, error: 'password is 8 to 63 characters' }, 400);
          h.pass = p;
        }
        // The panel is on Wi-Fi: auto keeps the hotspot down, always raises it
        // after a channel scan, which is what fills "seen".
        h.up = h.mode === 'always';
        if (h.up) h.scanned = true;
        return J(hotspotReply(s));
      });
    },

    // core_knobs_http.h
    'GET /api/knobs': function () { return J(knobsJson(load())); },
    'POST /api/knobs': function (A) {
      return tx(function (s) {
        var k = s.knob, inv = k.inv.slice(), sub = k.sub.slice(), changed = [false, false, false, false], any = false, i, key;
        for (i = 0; i < 4; i++) {
          key = 'inv' + i;
          if (A.has(key)) { inv[i] = truthy(A.get(key)); changed[i] = true; }
          else if (A.has('inv')) { inv[i] = truthy(A.get('inv')); changed[i] = true; }
          key = 'sub' + i;
          if (A.has(key)) { sub[i] = toInt(A.get(key)); changed[i] = true; }
          else if (A.has('sub')) { sub[i] = toInt(A.get('sub')); changed[i] = true; }
          if (changed[i] && sub[i] !== 4 && sub[i] !== 2 && sub[i] !== 1) return J({ ok: false, error: 'sub must be 4, 2 or 1' }, 400);
          any = any || changed[i];
        }
        if (!any) return J({ ok: false, error: 'nothing to set: invN, subN, inv or sub' }, 400);
        var c = clicks(s);
        for (i = 0; i < 4; i++) if (changed[i]) {
          k.baseClicks[i] = c[i]; k.baseRaw[i] = k.raw[i]; k.inv[i] = inv[i]; k.sub[i] = sub[i];
        }
        tell({ action: 'knobSettings', inv: k.inv.slice(), sub: k.sub.slice() });
        return J(knobsJson(s));
      });
    },

    // core_web_update.h (always armed: PF_WEBUPDATE_ALWAYS_ARMED)
    'GET /update/status': function () {
      var u = load().update;
      return J({ armed: true, busy: u.uploading || !!load().reboot, version: SEED.version, lastError: u.lastError,
        lastRejected: u.lastRejected, lastOk: u.lastOk, received: u.received, expected: u.expected, attempts: u.attempts });
    },
    'POST /update': function (A, b) { return flash(b); },
    'PUT /update': function (A, b) { return flash(b); }
  };

  function hotspotReply(s) {
    var seen = s.hotspot.scanned ? SEED.neighbours.map(function (n) { return { ssid: n[0], rssi: n[1] }; }) : [];
    return { ok: true, hotspot: hotspotJson(s), seen: seen, pass: s.hotspot.pass };
  }
  function knobsJson(s) {
    return { ok: true, inv: s.knob.inv.slice(), sub: s.knob.sub.slice(), clicks: clicks(s), raw: s.knob.raw.slice() };
  }

  // core_wifi.h addNetwork / removeNetwork / clampBootIdx, line for line
  function clampBoot(w) { var n = w.networks.length; if (n <= 0) w.bootIdx = 0; else if (w.bootIdx < 0 || w.bootIdx >= n) w.bootIdx = 0; }
  function bootIdx(w) { clampBoot(w); return w.bootIdx; }
  // The new one goes to the front; a name already saved moves there (with its
  // new password); a full list gives up its last slot.
  function addNetwork(w, ssid, pass) {
    var MAX = SEED.maxNetworks, n = w.networks.length, existing = -1, i;
    for (i = 0; i < n; i++) if (w.networks[i].ssid === ssid) { existing = i; break; }
    if (existing < 0 && n >= MAX) existing = MAX - 1;
    if (existing < 0 && n > 0) w.bootIdx = Math.min(w.bootIdx + 1, MAX - 1);
    var from = existing >= 0 ? existing : n;
    if (existing >= 0) w.networks.splice(existing, 1);
    w.networks.unshift({ ssid: ssid, pass: pass });
    if (existing >= 0 && from > 0) {  // adjustBootIdxOnInsertAtFront
      if (w.bootIdx === from) w.bootIdx = 0; else if (w.bootIdx < from) w.bootIdx++;
    }
    clampBoot(w);
  }
  function removeNetwork(w, ssid) {
    for (var i = 0; i < w.networks.length; i++) {
      if (w.networks[i].ssid !== ssid) continue;
      w.networks.splice(i, 1);
      if (i < w.bootIdx) w.bootIdx--;
      else if (i === w.bootIdx) w.bootIdx = Math.min(w.bootIdx, Math.max(w.networks.length - 1, 0));
      clampBoot(w);
      return true;
    }
    return false;
  }

  // ── storage writes ──────────────────────────────────────────────────────
  function remove(s, slug) {
    var m = s.modules.filter(function (x) { return x.slug === slug; })[0];
    if (!m || !m.pfm) return false;
    s.modules = s.modules.filter(function (x) { return x !== m; });
    dropFiles(slug);
    return true;
  }
  // After the rescan (requestReload): a running module that is gone leaves
  // Origin playing; the board beside the page follows.
  function rescanned(s) {
    var l = list(s);
    if (s.active !== 'origin' && !l.some(function (p) { return p.module === s.active; })) {
      setActive(s, 'origin', true);
      tell({ action: 'select', index: 0, name: 'Origin', slug: 'origin' });
    }
    tell({ action: 'modules', modules: moduleSlugs(s) });
  }
  function upload(b, name, last) {
    var lowered = String(name).toLowerCase(), isJson = /\.json$/.test(lowered), isCatalog = lowered === 'catalog.txt';
    if (!isJson && !isCatalog && !/\.pfm$/.test(lowered)) return J({ ok: false, error: 'only .pfm, .json or catalog.txt accepted' }, 400);
    var slug = isCatalog ? 'catalog' : slugOf(name);
    if (!slug) return J({ ok: false, error: 'invalid X-PF-Name' }, 400);
    var bytes = b.bytes || new Uint8Array(0);
    return tx(function (s) {
      if (!s.mounted) return J({ ok: false, error: 'filesystem not mounted' }, 400);
      if (!bytes.length) return J({ ok: false, error: 'empty upload' }, 400);
      var count = list(s).length;
      if (isCatalog) {
        s.catalog = new TextDecoder().decode(bytes).split('\n').map(function (x) { return x.trim(); })
          .filter(function (x) { return x && x.charAt(0) !== '#'; });
      } else {
        if (!isJson) {
          // PFModuleLoader::looksLikeModule
          if (bytes.length < 52) return J({ ok: false, error: 'too small to be a module (' + bytes.length + ' bytes)' }, 400);
          if (bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) return J({ ok: false, error: 'not an ELF file (corrupt upload?)' }, 400);
          if (bytes[4] !== 1 || (bytes[18] | bytes[19] << 8) !== 94) return J({ ok: false, error: 'unsupported or truncated ELF - rebuild with build_module.py' }, 400);
        }
        var m = s.modules.filter(function (x) { return x.slug === slug; })[0];
        if (!m) { m = { slug: slug, name: '', pfm: 0, json: 0 }; s.modules.push(m); }
        m[isJson ? 'json' : 'pfm'] = bytes.length;
        if (isJson) {
          var nm = '';
          try { nm = String(JSON.parse(new TextDecoder().decode(bytes)).name || ''); } catch (e) {}
          m.name = nm.slice(0, 39);
        } else if (!m.json) m.name = '';
        keepFile(slug, isJson ? 'json' : 'pfm', bytes);
      }
      s.storageUntil = now() + 300;
      if (last !== '0') rescanned(s);
      return J({ ok: true, slug: slug, bytes: bytes.length, patterns: count });
    });
  }
  // Uploaded files, kept for "Download ZIP" while they fit the session.
  function keepFile(slug, ext, bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    try { sessionStorage.setItem('pf-demo:file:' + slug + '.' + ext, btoa(s)); } catch (e) {}
  }
  function dropFiles(slug) {
    try {
      for (var i = sessionStorage.length; i--;) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf('pf-demo:file:') === 0 && (!slug || k.indexOf('pf-demo:file:' + slug + '.') === 0)) sessionStorage.removeItem(k);
      }
    } catch (e) {}
  }
  function fileBytes(m, ext) {
    var kept = null;
    try { kept = sessionStorage.getItem('pf-demo:file:' + m.slug + '.' + ext); } catch (e) {}
    if (!kept) return Promise.resolve(null);
    var bin = atob(kept), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return Promise.resolve(out);
  }

  // core_web_update.h: a multipart .bin; the first chunk must be an app image
  // (Update's magic byte), and 1.2 s after the answer the panel restarts on it.
  function flash(b) {
    var bytes = b.bytes || new Uint8Array(0);
    return tx(function (s) {
      var u = s.update;
      u.uploading = false; u.received = bytes.length; u.expected = bytes.length;
      if (!bytes.length || bytes[0] !== 0xE9) {
        u.lastOk = false; u.lastError = 'write: Wrong Magic Byte';
        return J({ error: u.lastError }, 500);
      }
      var id = '';
      for (var i = 176; i < 180 && i < bytes.length; i++) id += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
      u.lastOk = true; u.lastError = '';
      var t = now();
      s.reboot = { at: t + 1200, until: t + 7800, build: /^[0-9a-f]{8}$/.test(id) && /[^0]/.test(id) ? id : s.build };
      return J({ ok: true });
    });
  }

  // ── the wire ────────────────────────────────────────────────────────────
  function abortError() { try { return new DOMException('The user aborted a request.', 'AbortError'); } catch (e) { var x = Error('aborted'); x.name = 'AbortError'; return x; } }
  function later(signal, ms, fn) {
    return new Promise(function (y, n) {
      if (signal && signal.aborted) { n(abortError()); return; }
      var t = setTimeout(function () {
        if (signal) signal.removeEventListener('abort', ab);
        try { y(fn()); } catch (x) { n(x); }
      }, ms);
      function ab() { clearTimeout(t); n(abortError()); }
      if (signal) signal.addEventListener('abort', ab);
    });
  }
  function lat() { return 18 + Math.random() * 30; }
  function headersOf(h) {
    var out = {};
    if (!h) return out;
    if (typeof Headers !== 'undefined' && h instanceof Headers) h.forEach(function (v, k) { out[k.toLowerCase()] = v; });
    else if (Array.isArray(h)) h.forEach(function (p) { out[String(p[0]).toLowerCase()] = String(p[1]); });
    else for (var k in h) out[k.toLowerCase()] = String(h[k]);
    return out;
  }
  // A body as the server gets it: text, a form, or a file's bytes.
  function readBody(body, H) {
    var b = { text: null, form: null, bytes: null, name: null, ctype: H['content-type'] || '' };
    if (body == null) return Promise.resolve(b);
    if (typeof body === 'string') { b.text = body; if (!b.ctype) b.ctype = 'text/plain;charset=UTF-8'; return Promise.resolve(b); }
    if (body instanceof URLSearchParams) { b.text = body.toString(); b.ctype = 'application/x-www-form-urlencoded;charset=UTF-8'; return Promise.resolve(b); }
    if (body instanceof FormData) {
      b.form = new URLSearchParams(); b.ctype = 'multipart/form-data';
      var file = null;
      body.forEach(function (v, k) { if (typeof v === 'string') b.form.append(k, v); else if (!file) file = v; });
      if (!file) return Promise.resolve(b);
      b.name = file.name;
      return file.arrayBuffer().then(function (buf) { b.bytes = new Uint8Array(buf); return b; });
    }
    if (body instanceof Blob) return body.arrayBuffer().then(function (buf) { b.bytes = new Uint8Array(buf); b.text = new TextDecoder().decode(b.bytes); return b; });
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) { b.bytes = new Uint8Array(body.buffer || body); return Promise.resolve(b); }
    b.text = String(body);
    return Promise.resolve(b);
  }
  function respond(r) {
    var h = new Headers(r.headers || {});
    h.set('Content-Type', r.type || 'text/plain');
    h.set('Cache-Control', 'no-store');
    return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: h });
  }

  W.fetch = function (input, init) {
    init = init || {};
    var isReq = typeof Request !== 'undefined' && input instanceof Request;
    var url = isReq ? input.url : String(input);
    var method = String(init.method || (isReq ? input.method : 'GET')).toUpperCase();
    var signal = init.signal || (isReq ? input.signal : null);
    var u;
    try { u = new URL(url, L.href); } catch (e) { return Promise.reject(new TypeError('Failed to fetch')); }
    var path = devicePath(u);
    if (path === null) {
      if (u.origin === L.origin) { note('demo', method, u); return realFetch.apply(W, arguments); }
      if (MANIFEST.test(u.href)) {
        // The console's update check (home.html checkUpdate) reads the site's
        // release manifest: answered with the release the flasher names.
        note('site', method, u);
        return later(signal, 90, function () { return respond(J({ name: 'Patternflow', version: 'v' + SEED.manifestVersion })); });
      }
      note('refused', method, u);
      return later(signal, 40, function () { throw new TypeError('Failed to fetch'); });
    }
    note('device', method, u);
    if (SEED.assets[path]) return realFetch.call(W, BASE + SEED.assets[path] + u.search, { signal: signal || undefined });
    var H = headersOf(init.headers || (isReq ? input.headers : null));
    return readBody(isReq ? null : init.body, H).then(function (b) {
      if (down(load())) return later(signal, 1500, function () { throw new TypeError('Failed to fetch'); });
      return later(signal, lat(), function () { return device(method, u, path, b, H); }).then(function (r) {
        return Promise.resolve(r).then(function (x) {
          if (signal && signal.aborted) throw abortError();
          return respond(x);
        });
      });
    });
  };

  // XMLHttpRequest, for the uploads (patterns: raw PUT; update: multipart
  // POST), with upload progress at a LAN's pace.
  function Target() { this._l = {}; }
  Target.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
  Target.prototype.removeEventListener = function (t, f) { var a = this._l[t]; if (a && a.indexOf(f) >= 0) a.splice(a.indexOf(f), 1); };
  Target.prototype.dispatchEvent = function () { return true; };
  Target.prototype._fire = function (type, extra) {
    var e = { type: type, target: this, currentTarget: this, lengthComputable: false, loaded: 0, total: 0 }, self = this;
    for (var k in extra) e[k] = extra[k];
    var list = [], h = this['on' + type];
    if (typeof h === 'function') list.push(h);
    list = list.concat(this._l[type] || []);
    list.forEach(function (f) { try { f.call(self, e); } catch (x) { setTimeout(function () { throw x; }); } });
  };
  function XHR() {
    Target.call(this);
    this.upload = new Target();
    this.readyState = 0; this.status = 0; this.statusText = ''; this.responseText = ''; this.response = '';
    this.responseType = ''; this.responseURL = ''; this.timeout = 0; this.withCredentials = false;
    this._h = {}; this._rh = {}; this._timers = [];
  }
  XHR.prototype = Object.create(Target.prototype);
  XHR.prototype.constructor = XHR;
  XHR.UNSENT = 0; XHR.OPENED = 1; XHR.HEADERS_RECEIVED = 2; XHR.LOADING = 3; XHR.DONE = 4;
  XHR.prototype.open = function (m, url) { this._m = String(m).toUpperCase(); this._url = String(url); this.readyState = 1; this._fire('readystatechange'); };
  XHR.prototype.setRequestHeader = function (k, v) { this._h[String(k).toLowerCase()] = String(v); };
  XHR.prototype.getResponseHeader = function (k) { var v = this._rh[String(k).toLowerCase()]; return v === undefined ? null : v; };
  XHR.prototype.getAllResponseHeaders = function () { var o = '', k; for (k in this._rh) o += k + ': ' + this._rh[k] + '\r\n'; return o; };
  XHR.prototype.overrideMimeType = function () {};
  XHR.prototype._later = function (f, ms) { var t = setTimeout(f, ms); this._timers.push(t); return t; };
  XHR.prototype._stop = function () { this._timers.forEach(clearTimeout); this._timers = []; };
  XHR.prototype.abort = function () {
    if (this.readyState === 4 || this._over) return;
    this._stop(); this._over = true; this.readyState = 4; this.status = 0;
    if (this._update) tx(function (s) { s.update.uploading = false; });
    this._fire('readystatechange'); this.upload._fire('abort'); this._fire('abort'); this._fire('loadend');
  };
  XHR.prototype._fail = function (type) {
    if (this._over) return;
    if (this._update) tx(function (s) { s.update.uploading = false; });
    this._stop(); this._over = true; this.readyState = 4; this.status = 0;
    this._fire('readystatechange'); this.upload._fire(type); this._fire(type); this._fire('loadend');
  };
  XHR.prototype.send = function (body) {
    var self = this, u, path;
    try { u = new URL(this._url, L.href); } catch (e) { u = null; }
    path = u ? devicePath(u) : null;
    if (path === null) { note('refused', this._m, this._url); this._later(function () { self._fail('error'); }, 30); return; }
    note('device', this._m, u);
    this._update = path === '/update';
    if (this._update) tx(function (s) { s.update.uploading = true; s.update.attempts++; s.update.lastError = ''; s.update.lastOk = false; });
    var t0 = now();
    if (this.timeout) this._later(function () { self._fail('timeout'); }, this.timeout);
    readBody(body, this._h).then(function (b) {
      if (self._over) return;
      var total = b.bytes ? b.bytes.length : b.text ? b.text.length : 0;
      var rate = 150 * 1024;  // bytes per second up to the panel
      var ms = total ? Math.max(120, total / rate * 1000) : 30;
      if (down(load())) { self._later(function () { self._fail('error'); }, 1500); return; }
      self.upload._fire('loadstart', { lengthComputable: true, loaded: 0, total: total });
      (function step() {
        var f = Math.min(1, (now() - t0) / ms);
        self.upload._fire('progress', { lengthComputable: true, loaded: Math.round(total * f), total: total });
        if (f < 1) { self._later(step, 90); return; }
        self.upload._fire('load', { lengthComputable: true, loaded: total, total: total });
        self.upload._fire('loadend', { lengthComputable: true, loaded: total, total: total });
        // The device answers once it has checked what it wrote.
        self._later(function () {
          Promise.resolve(device(self._m, u, path, b, self._h)).then(function (r) {
            if (self._over) return;
            if (self._update) tx(function (s) { s.update.uploading = false; });
            self._stop(); self._over = true;
            self.status = r.status; self.statusText = r.status === 200 ? 'OK' : '';
            self._rh = { 'content-type': r.type || 'text/plain', 'cache-control': 'no-store' };
            self.responseText = typeof r.body === 'string' ? r.body : '';
            self.response = self.responseText; self.responseURL = u.href;
            self.readyState = 2; self._fire('readystatechange');
            self.readyState = 4; self._fire('readystatechange');
            self._fire('load'); self._fire('loadend');
          });
        }, path === '/update' ? 700 : 60 + Math.random() * 60);
      })();
    });
  };
  W.XMLHttpRequest = XHR;

  // ── links, scripts, history ─────────────────────────────────────────────
  var aHref = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'href');
  Object.defineProperty(HTMLAnchorElement.prototype, 'href', {
    configurable: true, enumerable: true, get: aHref.get,
    set: function (v) { aHref.set.call(this, toDemo(v) || String(v)); outward(this); }
  });
  var sSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
  Object.defineProperty(HTMLScriptElement.prototype, 'src', {
    configurable: true, enumerable: true, get: sSrc.get,
    set: function (v) { sSrc.set.call(this, toDemo(v) || String(v)); }
  });
  var setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    var n = String(name).toLowerCase();
    if ((n === 'href' && this instanceof HTMLAnchorElement) || (n === 'src' && this instanceof HTMLScriptElement)) {
      var m = toDemo(value);
      if (m) value = m;
    }
    return setAttr.call(this, name, value);
  };
  // A link off the board and off the demo opens beside it, never in the frame.
  function outward(a) {
    var h = a.getAttribute('href');
    if (h && external(h) && a.getAttribute('target') !== '_blank') { setAttr.call(a, 'target', '_blank'); setAttr.call(a, 'rel', 'noopener'); }
  }
  function link(a) {
    var m = toDemo(a.getAttribute('href'));
    if (m) setAttr.call(a, 'href', m);
    outward(a);
  }
  function fix(el) {
    if (el.tagName === 'A' && el.hasAttribute('href')) link(el);
    var list = el.querySelectorAll ? el.querySelectorAll('a[href]') : [];
    for (var i = 0; i < list.length; i++) link(list[i]);
  }
  // The observer runs before the next paint, so a link is never shown, and
  // the footer never reads the site's host, even for a frame.
  function watch(root) {
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        for (var i = 0; i < r.addedNodes.length; i++) if (r.addedNodes[i].nodeType === 1) fix(r.addedNodes[i]);
        // home.html: $('host').textContent=location.hostname
        if (r.target.id === 'host' && r.target.textContent === L.hostname) r.target.textContent = HOST;
      });
    }).observe(root, { childList: true, subtree: true });
  }
  watch(D);
  // The chrome marks the tab whose device path is this page's location; here
  // the location is the demo file's, so the tab is marked the way drawNav()
  // would have, before the first paint of every redraw. The nav wraps (no
  // sideways scroll) and its setup group sits in a nested <span class="g">,
  // so the links are found at any depth, not as the nav's children.
  function markNav(root) {
    var nav = root.querySelector('nav'), on = null, i, a, l;
    if (!nav) return;
    for (l = nav.querySelectorAll('a'), i = 0; i < l.length; i++) {
      a = l[i];
      if (a.pathname !== L.pathname) continue;
      on = a;
      if (a.className !== 'on') {
        a.className = 'on';
        a.setAttribute('aria-current', 'page');
      }
    }
    return on;
  }
  var attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (o) {
    var r = attach.call(this, o);
    watch(r);
    new MutationObserver(function () { markNav(r); }).observe(r, { childList: true, subtree: true });
    return r;
  };
  ['pushState', 'replaceState'].forEach(function (k) {
    var f = History.prototype[k];
    History.prototype[k] = function (state, title, url) {
      return f.call(this, state, title, url == null ? url : toDemo(url) || url);
    };
  });
  // A script that navigates by location (update.html's "Open console":
  // location.replace('/?v=...')) is caught by the Navigation API where there
  // is one, and by its click everywhere.
  if (W.navigation && W.navigation.addEventListener) {
    W.navigation.addEventListener('navigate', function (e) {
      var to = toDemo(e.destination.url);
      if (!to || !e.cancelable || e.hashChange) return;
      e.preventDefault();
      setTimeout(function () { L.replace(to); });
    });
  }
  W.addEventListener('click', function (e) {
    var t = e.target;
    if (FILE === 'update.html' && t && t.id === 'open') {
      e.preventDefault(); e.stopImmediatePropagation();
      L.replace(BASE + 'index.html?v=' + load().build);
    }
  }, true);
  // The chrome hands the site this panel's address on every link there
  // (?device=), and the site keeps it as the reader's own panel. This panel
  // is simulated: its address must never be saved as theirs. Bubbling, so it
  // runs after the chrome's capture-phase listener has added it.
  D.addEventListener('click', function (e) {
    var p = e.composedPath ? e.composedPath() : [], a = null, i, u;
    for (i = 0; i < p.length; i++) if (p[i].tagName === 'A' && p[i].href) { a = p[i]; break; }
    if (!a) return;
    try { u = new URL(a.href); } catch (x) { return; }
    if (!/(^|\.)patternflow\.work$/.test(u.hostname) || !u.searchParams.has('device')) return;
    u.searchParams.delete('device');
    a.href = u.href;
  });
  D.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !e.defaultPrevented) tell({ action: 'escape' });
  });
  // Inside the guide, a page scrolled to its end does not scroll the guide.
  if (EMBEDDED) D.documentElement.style.overscrollBehavior = 'contain';

  // ── the bridge ──────────────────────────────────────────────────────────
  function tell(m) {
    if (!EMBEDDED) return;
    m.type = 'pf-console';
    try { W.parent.postMessage(m, L.origin); } catch (e) {}
  }
  W.addEventListener('message', function (e) {
    if (e.origin !== L.origin || e.source !== W.parent) return;
    var m = e.data;
    if (!m || m.type !== 'pf-sim') return;
    tx(function (s) {
      var t = now(), i;
      if (m.off) { s.off = true; return; }
      if (s.off) { s.off = false; s.reboot = { at: t, until: t + 2500, reason: 'poweron' }; }
      if (typeof m.patternSlug === 'string' && t - s.localAt.pattern > 1500) {
        var slug = m.patternSlug;
        if (slug === 'origin' || modules(s).some(function (x) { return x.slug === slug; })) setActive(s, slug, false);
      }
      if (typeof m.level === 'number' && t - s.localAt.brightness > 1500) s.brightness = Math.max(5, Math.min(255, Math.round(m.level)));
      if (typeof m.sleeping === 'boolean' && t - s.localAt.sleep > 1500) s.sleep = m.sleeping;
      if (Array.isArray(m.knobs) && m.knobs.length === 4) {
        var k = s.knob;
        if (m.sid !== k.sid) { k.sid = m.sid; k.turns = m.knobs.slice(); }
        for (i = 0; i < 4; i++) {
          var d = Math.round(m.knobs[i] - k.turns[i]);
          if (!d) continue;
          k.raw[i] += d * 4;  // four edges a detent
          // A hand on the encoder takes the lane back (PatternflowBus::releaseAbsolute).
          if (s.held[i] && t - s.heldAt[i] >= 250) s.held[i] = false;
        }
        k.turns = m.knobs.slice();
      }
    });
  });

  W.PFDemo = { state: load, reset: function () { try { sessionStorage.removeItem(KEY); } catch (e) {} memory = null; dropFiles(); }, log: log };
  var s0 = load();
  save(s0);
  tell({ action: 'ready', page: FILE, modules: moduleSlugs(s0), inv: s0.knob.inv.slice(), sub: s0.knob.sub.slice() });
})();
'''


if __name__ == "__main__":
    main()
