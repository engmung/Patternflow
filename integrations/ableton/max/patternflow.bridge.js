// ═══════════════════════════════════════════════════════════
// Patternflow Bridge — Max for Live logic
//
// All device logic lives here; the .maxpat around it is just wiring.
// Receives Patternflow OSC (via [udpreceive 9000]) and drives up to four
// Live parameters through [live.remote~], one per hardware knob.
//
// Knobs arrive as RELATIVE deltas (the hardware has endless encoders), so
// each slot keeps its own 0..1 accumulator. "Sweep" is how many encoder
// clicks cover the full parameter range (24 clicks = 1 physical turn).
//
// Runs in the classic [js] object: ES5 only (no let/const/arrow).
// License: MIT
// ═══════════════════════════════════════════════════════════

autowatch = 1;
inlets = 1;
outlets = 11;
// 0..3  → [live.remote~] slot 1..4 ("id <n>" to bind, floats in the
//          parameter's native min..max range to drive it)
// 4     → status message box ("set <text>")
// 5     → [udpsend] ("host <h>", "port <p>", outgoing OSC)
// 6..9  → sweep number boxes ("set <n>", display only — no feedback loop)
// 10    → host textedit ("set <hostname>")

var NUM_SLOTS = 4;
var DEVICE_RX_PORT = 9001;      // the device listens here (PF_OSC_LOCAL_PORT)
var DEFAULT_SWEEP = 48;         // clicks for a full 0..1 sweep (2 turns)
var HEARTBEAT_TIMEOUT_MS = 3500;

var host = "patternflow.local";
var paths = ["", "", "", ""];   // persisted Live parameter paths (dotted)
var ids = [0, 0, 0, 0];         // resolved LiveAPI ids (session-local)
var mins = [0, 0, 0, 0];
var maxs = [1, 1, 1, 1];
var acc = [0, 0, 0, 0];         // 0..1 accumulators
var sweeps = [DEFAULT_SWEEP, DEFAULT_SWEEP, DEFAULT_SWEEP, DEFAULT_SWEEP];

var initialized = false;        // true after live.thisdevice bang
var lastBeat = 0;               // ms timestamp of last message from device
var online = false;
var patIdx = -1;
var patName = "";

var watchTask = new Task(watchdog);
var watchTicks = 0;

// ── status line ──────────────────────────────────────────────

function setStatus(text) {
  outlet(4, "set", text);
}

function refreshStatus() {
  if (!online) {
    setStatus("offline — click Connect (device on same Wi-Fi?)");
    return;
  }
  var label = "connected";
  if (patIdx >= 0) label += " · P" + patIdx;
  if (patName !== "") label += " " + patName;
  setStatus(label);
}

// ── init / persistence ───────────────────────────────────────

// Bang from [live.thisdevice]: the Live API is only usable from here on.
function init() {
  initialized = true;
  for (var i = 0; i < NUM_SLOTS; i++) {
    bindSlot(i);
    outlet(6 + i, "set", sweeps[i]);
  }
  outlet(10, "set", host);
  watchTask.interval = 2000;
  watchTask.repeat();
  connect();
}

// pattr integration: [pattr mappings @bindto pf_bridge] persists this value
// with the Live set. Paths are dotted ("live_set.tracks.0...") so each one
// stays a single symbol; "-" marks an empty slot.
function getvalueof() {
  var v = [];
  for (var i = 0; i < NUM_SLOTS; i++) v.push(paths[i] === "" ? "-" : paths[i]);
  v.push(host);
  for (var j = 0; j < NUM_SLOTS; j++) v.push(sweeps[j]);
  return v;
}

function setvalueof() {
  var v = arrayfromargs(arguments);
  if (v.length < NUM_SLOTS + 1) return;
  for (var i = 0; i < NUM_SLOTS; i++) {
    paths[i] = (String(v[i]) === "-") ? "" : String(v[i]);
  }
  host = String(v[NUM_SLOTS]);
  for (var j = 0; j < NUM_SLOTS; j++) {
    var s = parseInt(v[NUM_SLOTS + 1 + j], 10);
    if (!isNaN(s) && s > 0) sweeps[j] = s;
  }
  // Restore can arrive before OR after the live.thisdevice bang; if init
  // already ran, rebind now with the restored paths.
  if (initialized) {
    for (var k = 0; k < NUM_SLOTS; k++) {
      bindSlot(k);
      outlet(6 + k, "set", sweeps[k]);
    }
    outlet(10, "set", host);
  }
}

// ── connection ───────────────────────────────────────────────

function sethost() {
  var words = arrayfromargs(arguments);
  if (words.length === 0) return;
  host = words.join("");
  notifyclients(); // keep pattr in sync
  connect();
}

function connect() {
  if (!initialized) return;
  outlet(5, "port", DEVICE_RX_PORT);
  outlet(5, "host", host);
  outlet(5, "/patternflow/ping", 1);
  setStatus("pinging " + host + " ...");
}

function watchdog() {
  watchTicks++;
  var now = Date.now();
  if (online && now - lastBeat > HEARTBEAT_TIMEOUT_MS) {
    online = false;
    refreshStatus();
  }
  // While offline, quietly re-ping every other tick (4 s) so the link
  // comes back by itself after a device reboot or Wi-Fi hiccup.
  if (!online && initialized && (watchTicks % 2 === 0)) {
    outlet(5, "/patternflow/ping", 1);
  }
}

function markAlive() {
  lastBeat = Date.now();
  if (!online) {
    online = true;
    refreshStatus();
  }
}

// ── mapping ──────────────────────────────────────────────────

// UX: click the target parameter in Live first (it becomes the "selected
// parameter"), then click Map N here.
function map(slot) {
  var i = slot - 1;
  if (i < 0 || i >= NUM_SLOTS) return;
  if (!initialized) return;
  var view = new LiveAPI("live_set view");
  var sel = view.get("selected_parameter");
  var selId = (sel && sel.length >= 2) ? sel[1] : 0;
  if (!selId) {
    setStatus("click a Live parameter first, then Map " + slot);
    return;
  }
  var param = new LiveAPI("id " + selId);
  paths[i] = String(param.unquotedpath).split(" ").join(".");
  notifyclients();
  bindSlot(i);
}

function clear(slot) {
  var i = slot - 1;
  if (i < 0 || i >= NUM_SLOTS) return;
  paths[i] = "";
  ids[i] = 0;
  notifyclients();
  outlet(i, "id", 0); // unbind live.remote~, parameter is released
  setStatus("slot " + slot + " cleared");
}

// Resolve a stored path to a live id, bind live.remote~, and pick up the
// parameter's current value so the first knob move doesn't jump.
function bindSlot(i) {
  if (paths[i] === "") {
    ids[i] = 0;
    outlet(i, "id", 0);
    return;
  }
  var livePath = paths[i].split(".").join(" ");
  var param = new LiveAPI(livePath);
  if (!param || param.id == 0) {
    setStatus("slot " + (i + 1) + ": saved target not found — re-map");
    ids[i] = 0;
    outlet(i, "id", 0);
    return;
  }
  ids[i] = parseInt(param.id, 10);
  mins[i] = parseFloat(param.get("min"));
  maxs[i] = parseFloat(param.get("max"));
  var value = parseFloat(param.get("value"));
  var range = maxs[i] - mins[i];
  acc[i] = range !== 0 ? (value - mins[i]) / range : 0;
  outlet(i, "id", ids[i]);
  setStatus("slot " + (i + 1) + " → " + param.get("name"));
}

function sweep(slot, value) {
  var i = slot - 1;
  if (i < 0 || i >= NUM_SLOTS) return;
  var s = parseInt(value, 10);
  if (isNaN(s) || s < 1) return;
  sweeps[i] = s;
  notifyclients();
}

function knobDelta(i, delta) {
  if (ids[i] === 0) return;
  acc[i] += delta / sweeps[i];
  if (acc[i] < 0) acc[i] = 0;
  if (acc[i] > 1) acc[i] = 1;
  outlet(i, mins[i] + acc[i] * (maxs[i] - mins[i]));
}

// ── incoming OSC (from [udpreceive]) ─────────────────────────

function anything() {
  var addr = String(messagename);
  if (addr.charAt(0) !== "/") return; // not OSC — ignore unknown UI messages
  var args = arrayfromargs(arguments);
  markAlive();

  // /patternflow/knob/N/delta <int>
  if (addr.indexOf("/patternflow/knob/") === 0) {
    var rest = addr.substring(18); // "N/delta" or "N/clicks"
    var n = parseInt(rest.charAt(0), 10);
    if (rest.substring(1) === "/delta" && n >= 1 && n <= NUM_SLOTS && args.length > 0) {
      knobDelta(n - 1, parseFloat(args[0]));
    }
    return;
  }
  if (addr === "/patternflow/pattern/name" && args.length > 0) {
    patName = String(args[0]);
    refreshStatus();
    return;
  }
  if (addr === "/patternflow/pattern/index" && args.length > 0) {
    patIdx = parseInt(args[0], 10);
    refreshStatus();
    return;
  }
  // /patternflow/heartbeat, /hello, /version, /ip, /button/... — nothing to
  // do beyond markAlive() above (buttons are a v2 feature).
}

// Plain bang (e.g. from a button while testing) re-pings.
function bang() {
  connect();
}
