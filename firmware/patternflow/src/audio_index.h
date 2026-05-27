// ═══════════════════════════════════════════════════════════
// PatternFlow - Audio-react browser UI (PROGMEM HTML bundle)
//
// Served at http://patternflow.local/ by core_audio_ws.h. This phase 1
// UI is a 4-slider test page that confirms the WebSocket pipeline
// works end-to-end. Phase 2 replaces it with the real audio-react UI
// (file upload / tab capture / mic input + FFT band selection + base
// and ±range mapping per knob).
//
// Message format (text frames):
//   k=N,v=F   set knob N (0..3) to normalized value F (0..1)
//   off=N     release knob N back to encoder control
//   off       release all knobs
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include <pgmspace.h>

const char AUDIO_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow Audio</title>
<style>
  :root{--bg:#0a0a0a;--fg:#e8e8e8;--mut:#666;--ln:#1f1f1f;--ok:#5fdb89;--bad:#ff5d5d}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:24px;max-width:640px;margin:0 auto}
  h1{font-size:11px;letter-spacing:.4em;opacity:.5;font-weight:normal;margin:0 0 4px}
  .sub{font-size:11px;color:var(--mut);margin-bottom:24px}
  .knob{margin:14px 0;padding:14px;border:1px solid var(--ln);background:#0d0d0d}
  .knob-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
  .knob-head label{font-size:11px;color:var(--mut);letter-spacing:.15em;text-transform:uppercase}
  .val{font-size:11px;color:var(--fg);font-variant-numeric:tabular-nums}
  .knob input[type=range]{width:100%;accent-color:#888}
  #status{position:fixed;top:14px;right:14px;font-size:10px;padding:8px 12px;border:1px solid var(--ln);background:#0d0d0d;letter-spacing:.15em}
  .ok{color:var(--ok)} .bad{color:var(--bad)}
  button{padding:10px 16px;background:#1a1a1a;color:var(--fg);border:1px solid #333;font-family:inherit;font-size:11px;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;margin-top:16px;width:100%}
  button:hover{background:#222}
  .note{margin-top:24px;padding:12px;border:1px solid var(--ln);font-size:11px;color:var(--mut);line-height:1.6}
</style></head>
<body>
<h1>PATTERNFLOW · AUDIO</h1>
<div class="sub">Phase 1 — manual knob test. Phase 2 will wire this to file / tab / mic audio FFT.</div>
<div id="status" class="bad">DISCONNECTED</div>

<div class="knob"><div class="knob-head"><label>Knob 1</label><span class="val" id="v0">0.000</span></div>
  <input type="range" id="k0" min="0" max="1" step="0.001" value="0">
</div>
<div class="knob"><div class="knob-head"><label>Knob 2</label><span class="val" id="v1">0.000</span></div>
  <input type="range" id="k1" min="0" max="1" step="0.001" value="0">
</div>
<div class="knob"><div class="knob-head"><label>Knob 3</label><span class="val" id="v2">0.000</span></div>
  <input type="range" id="k2" min="0" max="1" step="0.001" value="0">
</div>
<div class="knob"><div class="knob-head"><label>Knob 4</label><span class="val" id="v3">0.000</span></div>
  <input type="range" id="k3" min="0" max="1" step="0.001" value="0">
</div>

<button id="releaseAll">Release all knobs (return to encoder control)</button>

<div class="note">
While a slider is being moved, that knob is locked to the browser value. If no message arrives for 500&thinsp;ms, the device automatically releases the knob back to the physical encoder.
</div>

<script>
const wsUrl = `ws://${location.hostname}:81`;
const status = document.getElementById('status');
let ws = null;
let reconnectTimer = null;

function connect() {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => { status.className = 'ok'; status.textContent = 'CONNECTED'; };
  ws.onclose = () => {
    status.className = 'bad';
    status.textContent = 'DISCONNECTED';
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1200);
  };
  ws.onerror = () => { status.className = 'bad'; status.textContent = 'ERROR'; };
}
connect();

function send(k, v) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(`k=${k},v=${v.toFixed(3)}`);
  }
}
function release(k) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(`off=${k}`);
  }
}

for (let i = 0; i < 4; i++) {
  const slider = document.getElementById('k' + i);
  const valEl = document.getElementById('v' + i);
  let interval = null;
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    valEl.textContent = v.toFixed(3);
    send(i, v);
    // Refresh while held so timeout doesn't release the knob mid-drag.
    if (interval) clearInterval(interval);
    interval = setInterval(() => send(i, parseFloat(slider.value)), 200);
  });
  slider.addEventListener('change', () => {
    if (interval) { clearInterval(interval); interval = null; }
  });
}

document.getElementById('releaseAll').addEventListener('click', () => {
  for (let i = 0; i < 4; i++) {
    document.getElementById('k' + i).value = 0;
    document.getElementById('v' + i).textContent = '0.000';
    release(i);
  }
});
</script>
</body></html>
)HTML";
