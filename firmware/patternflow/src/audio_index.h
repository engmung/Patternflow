// ═══════════════════════════════════════════════════════════
// PatternFlow - Audio-react browser UI (PROGMEM HTML bundle)
//
// Served at http://<device>/ by core_audio_ws.h. The WebSocket endpoint
// is /ws on the same port. Audio path:
//   source → AnalyserNode (FFT 2048) → per-band bin average (dB) →
//   normalized 0..1 → EMA smoothing → out = base + audio×range →
//   WebSocket frame "k=N,v=F" at ~30 Hz.
//
// Visual style is aligned with the patternflow web design system
// (cream surface, ink text, mono labels, rule borders) so the device-
// hosted page reads as part of the same product family rather than
// a generic admin panel.
//
// Browser secure-context limitation: getDisplayMedia (tab capture) and
// getUserMedia (microphone) only work over https or http://localhost.
// http://patternflow.local does NOT qualify, so when those buttons are
// clicked on an insecure origin we surface a clear "run locally" hint
// rather than failing silently. File source works on any origin.
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
  :root{
    --cream:#F4EFE6;
    --cream-2:#EDE7DB;
    --ink:#141414;
    --ink-muted:#6B655A;
    --ink-faint:#A69F90;
    --ink-ghost:#C9C2B0;
    --rule:#D9D1C0;
    --rule-soft:#E5DDC9;
    --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    --track:.16em;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--cream);color:var(--ink);font:13px/1.55 var(--mono)}
  body{padding:24px 20px 60px;max-width:760px;margin:0 auto}
  ::selection{background:var(--ink);color:var(--cream)}

  .hdr{margin-bottom:24px;padding-bottom:14px;border-bottom:1px solid var(--rule)}
  .hdr h1{margin:0;font-size:11px;letter-spacing:.45em;color:var(--ink);text-transform:uppercase;font-weight:500}
  .hdr p{margin:6px 0 0;font-size:11px;color:var(--ink-muted);letter-spacing:.05em}

  #status{position:fixed;top:18px;right:18px;font-size:10px;padding:7px 11px;border:1px solid var(--rule);background:var(--cream);letter-spacing:var(--track);text-transform:uppercase;z-index:10}
  #status.ok{border-color:var(--ink);color:var(--ink)}
  #status.bad{color:var(--ink-faint)}

  .section{margin:18px 0;border:1px solid var(--rule);background:var(--cream)}
  .section-hd{padding:10px 14px;border-bottom:1px solid var(--rule);background:var(--cream-2)}
  .section-hd span{font-size:10px;letter-spacing:var(--track);color:var(--ink-muted);text-transform:uppercase}
  .section-bd{padding:14px}

  .sources{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .source-btn{padding:11px 8px;background:var(--cream);color:var(--ink);border:1px solid var(--rule);font:inherit;font-size:11px;letter-spacing:var(--track);text-transform:uppercase;cursor:pointer;transition:.08s}
  .source-btn:hover{background:var(--cream-2);border-color:var(--ink-faint)}
  .source-btn.active{background:var(--ink);color:var(--cream);border-color:var(--ink)}
  .source-info{margin-top:12px;padding:10px 12px;font-size:11px;color:var(--ink-muted);background:var(--cream-2);border:1px dashed var(--rule);min-height:14px;letter-spacing:.02em}
  .source-info.warn{border-style:solid;border-color:var(--ink);background:var(--cream);color:var(--ink)}
  .file-controls{margin-top:12px}
  .file-controls input[type=file]{font:inherit;font-size:11px;color:var(--ink);width:100%}
  .file-controls audio{width:100%;margin-top:10px}

  .band-list{display:flex;flex-direction:column;gap:0}
  .band{padding:14px;border-top:1px solid var(--rule)}
  .band:first-child{border-top:0}
  .band-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;flex-wrap:wrap}
  .band-title{font-size:11px;letter-spacing:var(--track);text-transform:uppercase;color:var(--ink)}
  .band-target{font-size:10px;color:var(--ink-muted);letter-spacing:.1em;text-transform:uppercase}
  .band-target select{background:var(--cream);color:var(--ink);border:1px solid var(--rule);padding:4px 8px;font:inherit;font-size:11px;margin-left:6px}

  .row{display:grid;grid-template-columns:80px 1fr 64px;align-items:center;gap:10px;margin:6px 0;font-size:11px}
  .row .lbl{color:var(--ink-muted);letter-spacing:.12em;text-transform:uppercase;font-size:10px}
  .row .v{text-align:right;color:var(--ink);font-variant-numeric:tabular-nums}
  .row input[type=range]{
    width:100%;height:2px;background:var(--rule);
    -webkit-appearance:none;appearance:none;outline:none;cursor:pointer
  }
  .row input[type=range]::-webkit-slider-thumb{
    -webkit-appearance:none;appearance:none;width:14px;height:14px;
    background:var(--ink);border-radius:0;cursor:pointer
  }
  .row input[type=range]::-moz-range-thumb{
    width:14px;height:14px;background:var(--ink);border:0;border-radius:0;cursor:pointer
  }

  .hz-presets{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 0;grid-column:2 / 3}
  .hz-presets button{
    padding:3px 7px;background:transparent;color:var(--ink-muted);
    border:1px solid var(--rule);font:inherit;font-size:10px;
    letter-spacing:.05em;cursor:pointer;text-transform:none
  }
  .hz-presets button:hover{background:var(--cream-2);color:var(--ink);border-color:var(--ink-faint)}

  .meters{margin-top:10px}
  .meter-lbl{font-size:9px;letter-spacing:.15em;color:var(--ink-faint);text-transform:uppercase;margin-bottom:4px;display:flex;justify-content:space-between}
  .meter{height:4px;background:var(--rule-soft);position:relative;margin-bottom:6px}
  .meter-fill{height:100%;background:var(--ink-muted);width:0%;transition:width .05s linear}
  .meter-out .meter-fill{background:var(--ink)}

  .release{
    width:100%;padding:13px;background:var(--cream);color:var(--ink);
    border:1px solid var(--rule);font:inherit;font-size:11px;
    letter-spacing:var(--track);text-transform:uppercase;cursor:pointer;
    margin-top:18px;transition:.08s
  }
  .release:hover{background:var(--ink);color:var(--cream);border-color:var(--ink)}

  .note{margin-top:24px;padding:14px;font-size:11px;color:var(--ink-muted);line-height:1.7;border:1px solid var(--rule);background:var(--cream-2)}
  .note strong{color:var(--ink);font-weight:500}
  .note code{background:var(--cream);padding:1px 5px;border:1px solid var(--rule-soft);color:var(--ink)}

  @media (max-width:520px){
    .sources{grid-template-columns:1fr}
    .row{grid-template-columns:64px 1fr 56px}
  }
</style></head>
<body>
<div class="hdr">
  <h1>PATTERNFLOW · AUDIO</h1>
  <p>Stream music into the device. Map four FFT bands onto the four knobs.</p>
</div>

<div id="status" class="bad">DISCONNECTED</div>

<div class="section">
  <div class="section-hd"><span>Audio source</span></div>
  <div class="section-bd">
    <div class="sources">
      <button class="source-btn active" id="src-file">File</button>
      <button class="source-btn" id="src-tab">Tab / System</button>
      <button class="source-btn" id="src-mic">Microphone</button>
    </div>
    <div id="file-controls" class="file-controls">
      <input type="file" id="file-input" accept="audio/*">
      <audio id="audio-elem" controls></audio>
    </div>
    <div id="source-info" class="source-info">Pick an audio file to start.</div>
  </div>
</div>

<div class="section">
  <div class="section-hd"><span>Bands</span></div>
  <div class="section-bd" style="padding:0">
    <div id="bands" class="band-list"></div>
  </div>
</div>

<button class="release" id="release-all">Release all knobs · return to encoder control</button>

<div class="note">
<strong>Tab capture & Microphone require a secure context.</strong> Browsers only allow these on <code>https</code> or <code>http://localhost</code>; the device URL <code>http://patternflow.local</code> doesn&apos;t qualify. To enable them, clone the repo and run <code>npm&nbsp;run&nbsp;dev</code> from the <code>web/</code> folder, then open <code>http://localhost:3000/audio</code>. The <strong>File</strong> source works on this device page directly.
</div>

<script>
"use strict";

const PRESETS = [
  { name: 'Sub',     min: 20,   max: 60    },
  { name: 'Bass',    min: 60,   max: 250   },
  { name: 'Low Mid', min: 250,  max: 500   },
  { name: 'Mid',     min: 500,  max: 2000  },
  { name: 'Hi Mid',  min: 2000, max: 4000  },
  { name: 'High',    min: 4000, max: 16000 },
];

const bands = [
  { hzMin: 60,   hzMax: 250,   knob: 0, base: 0.5, range:  0.5 },
  { hzMin: 500,  hzMax: 2000,  knob: 1, base: 0.3, range:  0.7 },
  { hzMin: 2000, hzMax: 4000,  knob: 2, base: 0.5, range:  0.5 },
  { hzMin: 4000, hzMax: 16000, knob: 3, base: 0.5, range:  0.5 },
];

const smoothing = [0, 0, 0, 0];
const SMOOTH_ALPHA = 0.35;
const SEND_INTERVAL_MS = 33;
let lastSendMs = 0;

const CAN_CAPTURE = window.isSecureContext === true;

let audioCtx = null, analyser = null, sourceNode = null, freqBuf = null;
let mediaElem = null, mediaStream = null;

function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.3;
  freqBuf = new Float32Array(analyser.frequencyBinCount);
}

function disconnectAll() {
  try { if (sourceNode) sourceNode.disconnect(); } catch (e) {}
  sourceNode = null;
  try { if (analyser) analyser.disconnect(); } catch (e) {}
  if (mediaElem) {
    mediaElem.pause();
    mediaElem.removeAttribute('src');
    mediaElem.load();
    mediaElem = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
}

function setActiveBtn(id) {
  document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setInfo(text, warn) {
  const el = document.getElementById('source-info');
  el.textContent = text;
  el.classList.toggle('warn', !!warn);
}

async function loadFile(file) {
  ensureAudio();
  await audioCtx.resume();
  disconnectAll();
  const audio = document.getElementById('audio-elem');
  audio.src = URL.createObjectURL(file);
  audio.load();
  mediaElem = audio;
  sourceNode = audioCtx.createMediaElementSource(audio);
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);
  try { await audio.play(); } catch (e) {}
  setInfo('Loaded: ' + file.name);
}

async function captureTab() {
  if (!CAN_CAPTURE) {
    setInfo('Tab capture needs a secure context — see the note below. File source still works here.', true);
    return;
  }
  ensureAudio();
  await audioCtx.resume();
  disconnectAll();
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      setInfo('No audio in selected source. Make sure "Share tab audio" is checked.', true);
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    stream.getVideoTracks().forEach(t => t.stop());
    const audioStream = new MediaStream([audioTracks[0]]);
    mediaStream = stream;
    sourceNode = audioCtx.createMediaStreamSource(audioStream);
    sourceNode.connect(analyser);
    setInfo('Tab audio captured.');
  } catch (err) {
    setInfo('Tab capture cancelled.');
  }
}

async function captureMic() {
  if (!CAN_CAPTURE) {
    setInfo('Microphone needs a secure context — see the note below. File source still works here.', true);
    return;
  }
  ensureAudio();
  await audioCtx.resume();
  disconnectAll();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStream = stream;
    sourceNode = audioCtx.createMediaStreamSource(stream);
    sourceNode.connect(analyser);
    setInfo('Microphone live.');
  } catch (err) {
    setInfo('Microphone denied or unavailable.', true);
  }
}

function hzToBin(hz) {
  return Math.round(hz * analyser.fftSize / audioCtx.sampleRate);
}
function bandEnergy(band) {
  const minBin = Math.max(0, hzToBin(band.hzMin));
  const maxBin = Math.min(freqBuf.length - 1, hzToBin(band.hzMax));
  if (maxBin < minBin) return 0;
  let sum = 0;
  for (let i = minBin; i <= maxBin; i++) sum += freqBuf[i];
  const avgDb = sum / (maxBin - minBin + 1);
  return Math.max(0, Math.min(1, (avgDb + 80) / 70));
}

// WebSocket on the same origin / port at /ws
const wsUrl = `ws://${location.host}/ws`;
let ws = null, reconnectT = null;
function connect() {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    const s = document.getElementById('status');
    s.className = 'ok'; s.textContent = 'CONNECTED';
  };
  ws.onclose = () => {
    const s = document.getElementById('status');
    s.className = 'bad'; s.textContent = 'DISCONNECTED';
    if (reconnectT) clearTimeout(reconnectT);
    reconnectT = setTimeout(connect, 1200);
  };
  ws.onerror = () => {
    const s = document.getElementById('status');
    s.className = 'bad'; s.textContent = 'ERROR';
  };
}
connect();
function wsSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
}

function buildBandUI() {
  const root = document.getElementById('bands');
  root.innerHTML = '';
  bands.forEach((band, i) => {
    const div = document.createElement('div');
    div.className = 'band';
    div.innerHTML = `
      <div class="band-head">
        <span class="band-title">Band ${i + 1}</span>
        <span class="band-target">→ Knob
          <select class="target">
            <option value="0">1</option><option value="1">2</option>
            <option value="2">3</option><option value="3">4</option>
          </select>
        </span>
      </div>
      <div class="row">
        <span class="lbl">Hz min</span>
        <input type="range" min="20" max="20000" step="10" value="${band.hzMin}" class="hzMin">
        <span class="v hz-min-v">${band.hzMin}</span>
      </div>
      <div class="row">
        <span class="lbl">Hz max</span>
        <input type="range" min="20" max="20000" step="10" value="${band.hzMax}" class="hzMax">
        <span class="v hz-max-v">${band.hzMax}</span>
      </div>
      <div class="row">
        <span></span>
        <div class="hz-presets">
          ${PRESETS.map(p => `<button data-min="${p.min}" data-max="${p.max}">${p.name} ${p.min}–${p.max}</button>`).join('')}
        </div>
        <span></span>
      </div>
      <div class="row">
        <span class="lbl">Base</span>
        <input type="range" min="0" max="1" step="0.01" value="${band.base}" class="base">
        <span class="v base-v">${band.base.toFixed(2)}</span>
      </div>
      <div class="row">
        <span class="lbl">± Range</span>
        <input type="range" min="-1" max="1" step="0.01" value="${band.range}" class="range">
        <span class="v range-v">${(band.range >= 0 ? '+' : '') + band.range.toFixed(2)}</span>
      </div>
      <div class="meters">
        <div class="meter-lbl"><span>Input</span><span class="in-v">0.00</span></div>
        <div class="meter"><div class="meter-fill" id="meter-in-${i}"></div></div>
        <div class="meter-lbl"><span>Output → Knob</span><span class="out-v">0.00</span></div>
        <div class="meter meter-out"><div class="meter-fill" id="meter-out-${i}"></div></div>
      </div>
    `;
    root.appendChild(div);

    const sel = div.querySelector('.target');
    sel.value = String(band.knob);
    sel.addEventListener('change', e => { band.knob = parseInt(e.target.value, 10); });
    div.querySelector('.hzMin').addEventListener('input', e => {
      band.hzMin = parseInt(e.target.value, 10);
      div.querySelector('.hz-min-v').textContent = band.hzMin;
    });
    div.querySelector('.hzMax').addEventListener('input', e => {
      band.hzMax = parseInt(e.target.value, 10);
      div.querySelector('.hz-max-v').textContent = band.hzMax;
    });
    div.querySelector('.base').addEventListener('input', e => {
      band.base = parseFloat(e.target.value);
      div.querySelector('.base-v').textContent = band.base.toFixed(2);
    });
    div.querySelector('.range').addEventListener('input', e => {
      band.range = parseFloat(e.target.value);
      div.querySelector('.range-v').textContent = (band.range >= 0 ? '+' : '') + band.range.toFixed(2);
    });
    div.querySelectorAll('.hz-presets button').forEach(btn => {
      btn.addEventListener('click', () => {
        const mn = parseInt(btn.dataset.min, 10), mx = parseInt(btn.dataset.max, 10);
        band.hzMin = mn; band.hzMax = mx;
        div.querySelector('.hzMin').value = mn;
        div.querySelector('.hz-min-v').textContent = mn;
        div.querySelector('.hzMax').value = mx;
        div.querySelector('.hz-max-v').textContent = mx;
      });
    });
  });
}
buildBandUI();

document.getElementById('src-file').addEventListener('click', () => {
  setActiveBtn('src-file');
  document.getElementById('file-controls').style.display = 'block';
  if (mediaElem || mediaStream) disconnectAll();
  setInfo('Pick an audio file to start.');
});
document.getElementById('src-tab').addEventListener('click', () => {
  setActiveBtn('src-tab');
  document.getElementById('file-controls').style.display = 'none';
  captureTab();
});
document.getElementById('src-mic').addEventListener('click', () => {
  setActiveBtn('src-mic');
  document.getElementById('file-controls').style.display = 'none';
  captureMic();
});
document.getElementById('file-input').addEventListener('change', e => {
  if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
});

document.getElementById('release-all').addEventListener('click', () => {
  wsSend('off');
  smoothing.fill(0);
});

function tick() {
  requestAnimationFrame(tick);
  if (!analyser || !freqBuf) return;
  analyser.getFloatFrequencyData(freqBuf);

  const now = performance.now();
  const shouldSend = (now - lastSendMs) >= SEND_INTERVAL_MS;
  if (shouldSend) lastSendMs = now;

  for (let i = 0; i < 4; i++) {
    const band = bands[i];
    const raw = bandEnergy(band);
    smoothing[i] = SMOOTH_ALPHA * raw + (1 - SMOOTH_ALPHA) * smoothing[i];
    const mapped = Math.max(0, Math.min(1, band.base + smoothing[i] * band.range));

    const m1 = document.getElementById('meter-in-' + i);
    const m2 = document.getElementById('meter-out-' + i);
    if (m1) m1.style.width = (smoothing[i] * 100).toFixed(1) + '%';
    if (m2) m2.style.width = (mapped * 100).toFixed(1) + '%';

    const bandEl = document.querySelectorAll('.band')[i];
    if (bandEl) {
      const inV = bandEl.querySelector('.in-v');
      const outV = bandEl.querySelector('.out-v');
      if (inV) inV.textContent = smoothing[i].toFixed(2);
      if (outV) outV.textContent = mapped.toFixed(2);
    }

    if (shouldSend) wsSend(`k=${band.knob},v=${mapped.toFixed(3)}`);
  }
}
requestAnimationFrame(tick);
</script>
</body></html>
)HTML";
