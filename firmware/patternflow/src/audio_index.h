// ═══════════════════════════════════════════════════════════
// PatternFlow - Audio-react browser UI (PROGMEM HTML bundle)
//
// Served at http://patternflow.local/ by core_audio_ws.h. The UI:
//   - audio source: file upload or mic
//   - four frequency bands, each routed to a target knob (1..4)
//   - per band: Hz min/max sliders, base value, ±range modulation
//   - live energy meters + WebSocket throttled to ~30 Hz
//
// Audio path: source → AnalyserNode (FFT 2048) → per-band bin average
// in dB → normalized 0..1 → EMA smoothing → output = base + audio×range
// (clamped 0..1) → WebSocket frame "k=N,v=F".
//
// Tab/system capture is better handled by the Patternflow Audio Chrome
// extension because the ESP32 serves this page over normal HTTP.
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
  :root{--bg:#0a0a0a;--card:#0d0d0d;--fg:#e8e8e8;--mut:#666;--ln:#1f1f1f;--accent:#5fdb89;--bad:#ff5d5d;--bar:#3a3a3a;--bar-on:#7adb9a}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:20px;max-width:720px;margin:0 auto}
  h1{font-size:11px;letter-spacing:.4em;opacity:.5;font-weight:normal;margin:0 0 4px}
  .sub{font-size:11px;color:var(--mut);margin-bottom:20px}
  #status{position:fixed;top:14px;right:14px;font-size:10px;padding:7px 11px;border:1px solid var(--ln);background:var(--card);letter-spacing:.15em;z-index:10}
  .ok{color:var(--accent)} .bad{color:var(--bad)}

  .section{margin:14px 0;padding:14px;border:1px solid var(--ln);background:var(--card)}
  .section h2{font-size:10px;letter-spacing:.25em;color:var(--mut);font-weight:normal;text-transform:uppercase;margin:0 0 12px}

  .sources{display:flex;gap:8px;flex-wrap:wrap}
  .sources button{flex:1;min-width:120px;padding:10px;background:#1a1a1a;color:var(--fg);border:1px solid #333;font-family:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
  .sources button:hover{background:#222}
  .sources button.active{background:var(--fg);color:var(--bg);border-color:var(--fg)}
  .source-info{margin-top:10px;font-size:11px;color:var(--mut);min-height:18px}

  audio{width:100%;margin-top:10px}

  .band{margin:12px 0;padding:12px;border:1px solid var(--ln);background:#0c0c0c}
  .band-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;gap:10px;flex-wrap:wrap}
  .band-title{font-size:11px;letter-spacing:.2em;color:var(--fg);text-transform:uppercase}
  .band-target{font-size:11px;color:var(--mut)}
  .band-target select{background:#1a1a1a;color:var(--fg);border:1px solid #333;padding:4px 8px;font-family:inherit;font-size:11px}

  .row{display:grid;grid-template-columns:60px 1fr 70px;align-items:center;gap:10px;margin:6px 0;font-size:11px}
  .row .lbl{color:var(--mut);letter-spacing:.1em;text-transform:uppercase}
  .row .v{text-align:right;color:var(--fg);font-variant-numeric:tabular-nums}
  .row input[type=range]{width:100%;accent-color:#888}
  .hz-presets{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;grid-column:1 / -1}
  .hz-presets button{padding:3px 8px;background:transparent;color:var(--mut);border:1px solid var(--ln);font-family:inherit;font-size:10px;letter-spacing:.05em;cursor:pointer}
  .hz-presets button:hover{background:#1a1a1a;color:var(--fg)}

  .meter{height:6px;background:var(--bar);overflow:hidden;margin-top:8px;position:relative}
  .meter-fill{height:100%;background:var(--bar-on);transition:width 0.05s linear;width:0%}
  .meter-out{height:3px;background:var(--bar);margin-top:2px;position:relative}
  .meter-out-fill{height:100%;background:var(--accent);width:0%;transition:width 0.05s linear}

  .release{width:100%;padding:11px;background:#1a1a1a;color:var(--fg);border:1px solid #333;font-family:inherit;font-size:11px;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;margin-top:16px}
  .release:hover{background:#222}

  .note{margin-top:18px;font-size:11px;color:var(--mut);line-height:1.6}
  .note code{background:#1a1a1a;padding:1px 5px;color:var(--fg)}
</style></head>
<body>
<h1>PATTERNFLOW · AUDIO</h1>
<div class="sub">Stream music into the device. Map four FFT bands onto the four knobs.</div>
<div id="status" class="bad">DISCONNECTED</div>

<div class="section">
  <h2>Audio source</h2>
  <div class="sources">
    <button id="src-file" class="active">File</button>
    <button id="src-tab">Tab / System</button>
    <button id="src-mic">Microphone</button>
  </div>
  <div id="file-controls" style="margin-top:10px">
    <input type="file" id="file-input" accept="audio/*" style="font-size:11px">
    <audio id="audio-elem" controls></audio>
  </div>
  <div id="source-info" class="source-info"></div>
</div>

<div id="bands"></div>

<button class="release" id="release-all">Release all knobs · return to encoder control</button>

<div class="note">
Use this built-in page for audio files, microphone input, and local experiments. For YouTube, Spotify Web, or other tab/system audio, use the <code>tools/patternflow-audio-extension</code> Chrome/Edge extension instead; browser capture APIs are usually blocked on this normal HTTP device page.<br><br>
Incoming audio is converted into virtual encoder motion in firmware, so all encoder-driven patterns can react without pattern-specific audio code.
</div>

<script>
// ═══ Bands config ═══
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
let lastSentValues = bands.map(b => b.base);
const SMOOTH_ALPHA = 0.35;       // 0..1, higher = snappier
const SEND_INTERVAL_MS = 33;     // ~30 Hz WS update
let lastSendMs = 0;

// ═══ Audio context ═══
let audioCtx = null, analyser = null, sourceNode = null, freqBuf = null;
let mediaElem = null, mediaStream = null;
let currentSource = 'file';

function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.3;  // some smoothing already in the analyser
  freqBuf = new Float32Array(analyser.frequencyBinCount);
}

function disconnectAll() {
  try { if (sourceNode) sourceNode.disconnect(); } catch (e) {}
  sourceNode = null;
  if (mediaElem) { mediaElem.pause(); mediaElem.removeAttribute('src'); mediaElem.load(); mediaElem = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
}

async function setSource(kind) {
  ensureAudio();
  await audioCtx.resume();
  disconnectAll();
  currentSource = kind;
  document.querySelectorAll('.sources button').forEach(b => b.classList.remove('active'));
  document.getElementById('src-' + kind).classList.add('active');
  document.getElementById('file-controls').style.display = kind === 'file' ? 'block' : 'none';
  document.getElementById('source-info').textContent = '';
}

async function loadFile(file) {
  ensureAudio();
  await audioCtx.resume();
  const audio = document.getElementById('audio-elem');
  audio.src = URL.createObjectURL(file);
  audio.load();
  mediaElem = audio;
  sourceNode = audioCtx.createMediaElementSource(audio);
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination); // file path: play to speakers too
  audio.play().catch(() => {});
  document.getElementById('source-info').textContent = `Loaded: ${file.name}`;
}

async function captureTab() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    document.getElementById('source-info').textContent = 'Tab/system capture is blocked on this HTTP device page. Use the Patternflow Audio Chrome/Edge extension instead.';
    return;
  }
  ensureAudio();
  await audioCtx.resume();
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      document.getElementById('source-info').textContent = 'No audio in selected tab. For tab/system audio, the Patternflow Audio extension is recommended.';
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    // We don't need the video; stop it.
    stream.getVideoTracks().forEach(t => t.stop());
    const audioStream = new MediaStream([audioTracks[0]]);
    mediaStream = stream;
    sourceNode = audioCtx.createMediaStreamSource(audioStream);
    sourceNode.connect(analyser);
    // Note: tab audio already plays through the tab itself — do NOT connect
    // analyser to destination or you'll get a double + echo loop.
    document.getElementById('source-info').textContent = 'Tab audio captured. If this is unreliable, use the Patternflow Audio extension.';
  } catch (err) {
    document.getElementById('source-info').textContent = 'Tab/system capture cancelled or unavailable. Use the Patternflow Audio extension for this source.';
  }
}

async function captureMic() {
  ensureAudio();
  await audioCtx.resume();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStream = stream;
    sourceNode = audioCtx.createMediaStreamSource(stream);
    sourceNode.connect(analyser);
    // Do NOT connect analyser to destination — would cause feedback.
    document.getElementById('source-info').textContent = 'Microphone live.';
  } catch (err) {
    document.getElementById('source-info').textContent = 'Microphone denied or unavailable.';
  }
}

// ═══ FFT → band energy ═══
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
  // Map -80..-10 dB → 0..1 (typical perceptual range)
  return Math.max(0, Math.min(1, (avgDb + 80) / 70));
}

// ═══ WebSocket ═══
const wsUrl = `ws://${location.hostname}:81`;
let ws = null, reconnectT = null;
function connect() {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => { document.getElementById('status').className = 'ok'; document.getElementById('status').textContent = 'CONNECTED'; };
  ws.onclose = () => { document.getElementById('status').className = 'bad'; document.getElementById('status').textContent = 'DISCONNECTED'; if (reconnectT) clearTimeout(reconnectT); reconnectT = setTimeout(connect, 1200); };
  ws.onerror = () => { document.getElementById('status').className = 'bad'; document.getElementById('status').textContent = 'ERROR'; };
}
connect();

function wsSend(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > 0) return false;
  ws.send(msg);
  return true;
}

function wsSendControl(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
}

function sendOutputValue(knob, value) {
  const idx = Math.max(0, Math.min(3, Number(knob) || 0));
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  const prev = Number.isFinite(lastSentValues[idx]) ? lastSentValues[idx] : 0.5;
  const delta = normalized - prev;
  if (Math.abs(delta) < 0.001) return;
  if (wsSend(`d=${idx},v=${delta.toFixed(3)}`)) lastSentValues[idx] = normalized;
}

// ═══ Band UI ═══
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
          <select data-i="${i}" class="target">
            <option value="0">1</option><option value="1">2</option>
            <option value="2">3</option><option value="3">4</option>
          </select>
        </span>
      </div>
      <div class="row">
        <span class="lbl">Hz min</span>
        <input type="range" min="20" max="20000" step="10" value="${band.hzMin}" data-i="${i}" class="hzMin">
        <span class="v hz-min-v">${band.hzMin}</span>
      </div>
      <div class="row">
        <span class="lbl">Hz max</span>
        <input type="range" min="20" max="20000" step="10" value="${band.hzMax}" data-i="${i}" class="hzMax">
        <span class="v hz-max-v">${band.hzMax}</span>
      </div>
      <div class="row">
        <div></div>
        <div class="hz-presets">
          ${PRESETS.map(p => `<button data-i="${i}" data-min="${p.min}" data-max="${p.max}">${p.name} ${p.min}–${p.max}</button>`).join('')}
        </div>
      </div>
      <div class="row">
        <span class="lbl">Base</span>
        <input type="range" min="0" max="1" step="0.01" value="${band.base}" data-i="${i}" class="base">
        <span class="v base-v">${band.base.toFixed(2)}</span>
      </div>
      <div class="row">
        <span class="lbl">± Range</span>
        <input type="range" min="-1" max="1" step="0.01" value="${band.range}" data-i="${i}" class="range">
        <span class="v range-v">${band.range >= 0 ? '+' : ''}${band.range.toFixed(2)}</span>
      </div>
      <div class="meter"><div class="meter-fill" id="meter-in-${i}"></div></div>
      <div class="meter-out"><div class="meter-out-fill" id="meter-out-${i}"></div></div>
    `;
    root.appendChild(div);

    div.querySelector('.target').value = band.knob;
    div.querySelector('.target').addEventListener('change', e => { band.knob = parseInt(e.target.value, 10); });
    div.querySelector('.hzMin').addEventListener('input', e => { band.hzMin = parseInt(e.target.value, 10); div.querySelector('.hz-min-v').textContent = band.hzMin; });
    div.querySelector('.hzMax').addEventListener('input', e => { band.hzMax = parseInt(e.target.value, 10); div.querySelector('.hz-max-v').textContent = band.hzMax; });
    div.querySelector('.base').addEventListener('input', e => { band.base = parseFloat(e.target.value); div.querySelector('.base-v').textContent = band.base.toFixed(2); });
    div.querySelector('.range').addEventListener('input', e => { band.range = parseFloat(e.target.value); div.querySelector('.range-v').textContent = (band.range >= 0 ? '+' : '') + band.range.toFixed(2); });
    div.querySelectorAll('.hz-presets button').forEach(btn => {
      btn.addEventListener('click', () => {
        const mn = parseInt(btn.dataset.min, 10), mx = parseInt(btn.dataset.max, 10);
        band.hzMin = mn; band.hzMax = mx;
        div.querySelector('.hzMin').value = mn; div.querySelector('.hz-min-v').textContent = mn;
        div.querySelector('.hzMax').value = mx; div.querySelector('.hz-max-v').textContent = mx;
      });
    });
  });
}
buildBandUI();

// ═══ Source buttons ═══
document.getElementById('src-file').addEventListener('click', () => setSource('file'));
document.getElementById('src-tab').addEventListener('click', () => { setSource('tab').then(captureTab); });
document.getElementById('src-mic').addEventListener('click', () => { setSource('mic').then(captureMic); });
document.getElementById('file-input').addEventListener('change', e => {
  if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
});

document.getElementById('release-all').addEventListener('click', () => {
  wsSendControl('off');
  smoothing.fill(0);
  lastSentValues = bands.map(b => b.base);
});

// ═══ Tick loop ═══
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

    if (shouldSend) sendOutputValue(band.knob, mapped);
  }
}
requestAnimationFrame(tick);
</script>
</body></html>
)HTML";
