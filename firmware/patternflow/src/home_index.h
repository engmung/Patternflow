// ═══════════════════════════════════════════════════════════
// PatternFlow - Device web console home (PROGMEM HTML bundle)
//
// Served at http://patternflow.local/ by core_audio_ws.h. A landing page
// with one big card per device feature:
//   01  AUDIO SYNC       → /audio   (audio_index.h)
//   02  FIRMWARE UPDATE  → /update  (web_update_index.h)
//   03  REMOTE COMPUTE   — placeholder, external computing link planned
//
// Shares the design language of the other device pages: dark, monospace,
// letter-spaced, thin borders. The version tag is fetched from
// /update/status so the page doubles as a "what am I running" check.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include <pgmspace.h>

const char HOME_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow</title>
<style>
  :root{--bg:#0a0a0a;--card:#0e0e0e;--fg:#e8e8e8;--mut:#666;--ln:#212121;--accent:#5fdb89;--blue:#6ab7ff}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:var(--bg);color:var(--fg);
       font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       padding:36px 20px;
       background-image:radial-gradient(ellipse 90% 55% at 50% -12%,#151515 0%,transparent 65%)}
  .wordmark{font-size:16px;letter-spacing:.55em;text-indent:.55em;font-weight:normal;margin:0 0 8px;color:var(--fg)}
  .tag{font-size:10px;color:var(--mut);letter-spacing:.25em;text-indent:.25em;margin-bottom:44px;text-align:center}
  .cards{width:100%;max-width:400px;display:flex;flex-direction:column;gap:14px}
  .card{display:block;position:relative;padding:22px 24px 20px;border:1px solid var(--ln);
        background:var(--card);text-decoration:none;color:var(--fg);
        transition:border-color .16s,transform .16s,background .16s}
  a.card:hover{transform:translateY(-2px);background:#101010}
  a.card.audio:hover{border-color:var(--accent)}
  a.card.fw:hover{border-color:var(--blue)}
  .num{position:absolute;top:22px;right:24px;font-size:10px;color:#3a3a3a;letter-spacing:.2em}
  .card h2{margin:0 0 7px;font-size:12px;letter-spacing:.28em;font-weight:normal}
  a.card.audio h2{color:var(--accent)}
  a.card.fw h2{color:var(--blue)}
  .card p{margin:0;font-size:11px;color:var(--mut);line-height:1.7}
  .soon{opacity:.55}
  .soon h2{color:var(--fg)}
  .badge{display:inline-block;font-size:9px;letter-spacing:.2em;color:var(--bg);background:#4a4a4a;padding:2px 8px;margin-left:10px;vertical-align:2px}
  footer{margin-top:46px;font-size:10px;letter-spacing:.2em}
  footer a{color:#3a3a3a;text-decoration:none}
  footer a:hover{color:var(--mut)}
</style></head><body>

<h1 class="wordmark">PATTERNFLOW</h1>
<div class="tag" id="tag">DEVICE CONSOLE</div>

<nav class="cards">
  <a class="card audio" href="/audio">
    <span class="num">01</span>
    <h2>AUDIO SYNC</h2>
    <p>Stream music from this browser. Four FFT bands drive the four knobs in real time.</p>
  </a>
  <a class="card fw" href="/update">
    <span class="num">02</span>
    <h2>FIRMWARE UPDATE</h2>
    <p>Drop a firmware .bin &mdash; the device flashes itself over the LAN and reboots.</p>
  </a>
  <div class="card soon">
    <span class="num">03</span>
    <h2>REMOTE COMPUTE<span class="badge">SOON</span></h2>
    <p>Link an external computer to drive patterns with more horsepower.</p>
  </div>
</nav>

<footer><a href="https://patternflow.work" target="_blank" rel="noopener">patternflow.work</a></footer>

<script>
fetch('/update/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){
  if(s.version)document.getElementById('tag').textContent='DEVICE CONSOLE · v'+s.version;
}).catch(function(){});
</script>
</body></html>
)HTML";
