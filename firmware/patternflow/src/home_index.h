// ═══════════════════════════════════════════════════════════
// PatternFlow - Device web console home (PROGMEM HTML bundle)
//
// Served at http://patternflow.local/ by core_audio_ws.h. A live status line
// (pattern, fps, heap, signal — one small JSON poll) above the feature rows,
// grouped by what they are for:
//
//   PATTERNS      01  the library            → /patterns
//   SETUP         02  Wi-Fi, 03 MQTT         → /wifi, /mqtt
//   DEVICE        04  update, 05 status      → /update, /status
//   EXPERIMENTAL  06  audio sync             → /audio
//
// The look is the device's own, not the marketing site's: near-black,
// cream type, the LED orange doing the accent work — the console is opened
// next to a glowing panel in a dark room, and a live LED frame reads right
// on black in a way it never did on paper cream. patternflow.work stays
// paper; the instrument is dark.
//
// The update banner is the browser's doing: it fetches the public flasher
// manifest over HTTPS and compares against this device's version. The
// device never talks to the internet — same ferrying trick as the community
// installer — so the check costs the firmware nothing. Silently absent when
// the site is unreachable (offline LAN) or CORS says no.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
// The page body below is generated from console/home.html — edit that,
// then run: python firmware/toolchain/console_pages.py build
#pragma once
#include <pgmspace.h>

const char HOME_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<script src="/pf-console.js"></script>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%230C0B09'/%3E%3Crect x='5' y='5' width='6' height='6' fill='%23FF5C2E'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  @font-face{font-family:'Pretendard';font-weight:700;font-style:normal;font-display:swap;
    src:url('https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-Bold.woff2') format('woff2')}
  :root{--bg:#0C0B09;--panel:#131110;--ink:#EDE7DB;--muted:#8A8272;--faint:#5A5546;
        --ghost:#221F18;--rule:#242118;--led:#FF5C2E;--ok:#57B87F;--warn:#D9A03F;
        --sans:'Inter',ui-sans-serif,system-ui,sans-serif;
        --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
        --pretendard:'Pretendard',ui-sans-serif,system-ui,sans-serif}
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:var(--bg);color:var(--ink);
       font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased;
       padding:24px 24px 64px}
  .panel{width:100%;max-width:560px;margin:16px auto 0}
  header{display:flex;align-items:center;gap:8px;padding-bottom:12px;border-bottom:1px solid var(--rule);margin-bottom:28px}
  .dot{width:7px;height:7px;background:var(--led);border-radius:1px}
  h1{font-size:15px;font-weight:600;letter-spacing:.01em;margin:0;flex:1}
  .sub{font-family:var(--mono);font-size:11px;color:var(--faint)}

  /* ── Device card (one small status poll — the device never streams pixels) ── */
  .screen{background:var(--panel);border:1px solid var(--rule);padding:20px 20px 6px}
  .now-hdr{display:flex;justify-content:space-between;align-items:center}
  .now-k{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
  .now-nav{display:flex;gap:5px}
  .now-btn{
    background:transparent;border:1px solid var(--rule);color:var(--muted);
    font-family:var(--mono);font-size:12px;line-height:1;width:28px;height:24px;
    border-radius:2px;cursor:pointer;display:inline-flex;align-items:center;
    justify-content:center;transition:all .15s ease
  }
  .now-btn:hover{color:var(--ink);border-color:var(--led)}
  .now-btn:active{background:var(--ghost);transform:scale(0.92)}
  .now{font-size:25px;font-weight:600;letter-spacing:-.02em;line-height:1.15;margin:7px 0 3px;min-height:29px;overflow-wrap:anywhere}
  .now-sub{font-family:var(--mono);font-size:11px;color:var(--muted);min-height:15px}
  /* ── Panel switch ─────────────────────────────────────────────
     A segmented pair, not a sliding toggle: /mqtt already picks between
     states this way (.ch / .role with an .on class) and this is the same
     gesture, so the console keeps one vocabulary. It also shows which state
     you are in rather than asking you to read a label and infer it. */
  .pwr{display:flex;align-items:center;gap:12px;margin-top:16px;
       padding-top:13px;border-top:1px solid var(--rule)}
  .pwr-k{font-family:var(--mono);font-size:10px;letter-spacing:.1em;
       text-transform:uppercase;color:var(--faint);flex:1}
  .pwr-btns{display:flex;gap:6px}
  .pwr-b{font-family:var(--mono);font-size:11px;letter-spacing:.08em;
       text-transform:uppercase;padding:6px 14px;cursor:pointer;
       background:transparent;color:var(--muted);border:1px solid var(--rule);
       transition:color .15s ease,border-color .15s ease}
  .pwr-b:hover{color:var(--ink);border-color:var(--muted)}
  .pwr-b.on{color:var(--ink);border-color:var(--led);box-shadow:inset 0 0 0 1px var(--led)}
  .pwr-note{font-family:var(--mono);font-size:10.5px;color:var(--faint);
       min-height:14px;margin-top:7px}
  .pwr-note.err{color:var(--led)}

  /* ── Live parameter sliders (K1..K4) ────────────────────────── */
  .ctrls{margin-top:16px;padding-top:14px;border-top:1px solid var(--rule)}
  .ctrls-hdr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
  .ctrls-k{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
  .ctrls-hint{font-family:var(--mono);font-size:10px;color:var(--faint)}
  .slider-row{display:flex;align-items:center;gap:12px;margin-bottom:10px}
  .slider-row:last-child{margin-bottom:0}
  .s-label{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--muted);width:20px;flex:none}
  .slider-row input[type=range]{
    flex:1;height:6px;appearance:none;-webkit-appearance:none;background:var(--ghost);
    border-radius:3px;outline:none;cursor:pointer;accent-color:var(--led);touch-action:none
  }
  .slider-row input[type=range]::-webkit-slider-thumb{
    appearance:none;-webkit-appearance:none;width:18px;height:18px;border-radius:50%;
    background:var(--ink);border:2px solid var(--led);cursor:pointer;transition:transform .1s ease
  }
  .slider-row input[type=range]:active::-webkit-slider-thumb{
    transform:scale(1.2);background:var(--led)
  }
  .slider-row input[type=range]::-moz-range-thumb{
    width:18px;height:18px;border-radius:50%;background:var(--ink);border:2px solid var(--led);cursor:pointer
  }
  .s-val{font-family:var(--mono);font-size:11.5px;color:var(--ink);width:32px;text-align:right;flex:none}

  .stats{display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-top:16px}
  .stat{padding:10px 0 9px;border-top:1px solid var(--rule)}
  .stat .k{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
  .stat .v{font-family:var(--mono);font-size:12.5px;color:var(--ink);margin-top:4px;
       white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .stat .bar{height:3px;background:var(--ghost);margin-top:7px}
  /* The edition block is a link, so it must not inherit link styling and
     must not look clickable in the middle of a list of readouts. The
     sub-line is where the one thing worth saying goes. */
  a.stat{display:block;text-decoration:none;color:inherit}
  a.stat:hover .v{color:var(--led)}
  a.stat:hover .sub{color:var(--ink)}
  .stat .sub{font-size:11px;line-height:1.45;color:var(--faint);margin-top:5px;
       white-space:normal}
  .stat .bar i{display:block;height:100%;width:0;background:var(--led);transition:width .3s}

  /* ── Update banner (hidden until the browser proves it) ───── */
  #upd{display:none;margin-top:14px;border:1px solid var(--led);padding:11px 14px;
       font-size:13px;color:var(--ink);text-decoration:none;
       display:none;align-items:baseline;gap:10px}
  #upd .tag{font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--led);
       text-transform:uppercase;white-space:nowrap}
  #upd:hover{background:rgba(255,92,46,.06)}
  #upd .go{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--muted);white-space:nowrap}

  /* ── Feature rows ─────────────────────────────────────────── */
  .rows{margin-top:36px}
  .pf-kicker{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
       color:var(--faint);margin-bottom:6px}
  .pf-kicker + nav{margin-bottom:28px}
  nav{border-top:1px solid var(--rule)}
  nav:last-of-type{margin-bottom:0}
  .pf-row{display:block;position:relative;padding:16px 92px 16px 0;border-bottom:1px solid var(--rule);
       color:var(--muted);text-decoration:none;overflow:hidden;transition:color .15s ease}
  a.pf-row:hover{color:var(--ink)}
  a.pf-row:hover .pf-ghost{color:var(--muted)}
  .pf-ghost{position:absolute;right:-2px;top:50%;transform:translateY(-50%);color:var(--ghost);
       font-size:52px;font-weight:300;letter-spacing:-.04em;line-height:1;pointer-events:none;transition:color .15s ease}
  .pf-row-t{font-size:17px;font-weight:500;letter-spacing:-.01em;line-height:1.3;color:var(--ink)}
  .pf-row.soon .pf-row-t{color:var(--muted)}
  .pf-row-d{max-width:36ch;margin-top:3px;color:var(--muted);font-size:13px;line-height:1.45}
  .pf-row.soon,.pf-row.soon .pf-row-d{color:var(--faint)}
  .tag{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;
       border:1px solid var(--faint);color:var(--muted);padding:3px 8px 2px;margin-left:10px;vertical-align:2px}
  footer{margin-top:34px;display:flex;justify-content:space-between;gap:16px;
       font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
  footer a{color:var(--muted);text-decoration:none}
  footer a:hover{color:var(--ink)}
  @media(max-width:560px){body{padding:12px 14px 52px}
       .pf-ghost{font-size:42px}.pf-row{padding-right:70px}
       }
  /* Desktop: the whole console on one screen — panel pinned left, rows
     right — instead of a phone column floating in empty space. */
  @media(min-width:960px){
       .panel{max-width:1120px}
       .grid{display:grid;grid-template-columns:500px minmax(0,1fr);gap:60px;align-items:start}
       .left{position:sticky;top:44px}
       .rows{margin-top:0}}
</style></head><body>



<main class="panel">
  <header><span class="dot"></span><h1>Console</h1><span class="sub">device</span></header>

  <div class="grid">
  <div class="left">
  <div class="screen">
    <div class="now-hdr">
      <span class="now-k">Now playing</span>
      <div class="now-nav">
        <button class="now-btn" id="pat-prev" title="Previous pattern" type="button">&larr;</button>
        <button class="now-btn" id="pat-next" title="Next pattern" type="button">&rarr;</button>
      </div>
    </div>
    <div class="now" id="now">&mdash;</div>
    <div class="now-sub" id="nowsub"></div>

    <div class="pwr">
      <span class="pwr-k">Panel</span>
      <div class="pwr-btns">
        <button class="pwr-b" id="p-on" type="button">On</button>
        <button class="pwr-b" id="p-sleep" type="button">Sleep</button>
      </div>
    </div>
    <div class="pwr-note" id="pwrnote"></div>

    <div class="ctrls" id="ctrls">
      <div class="ctrls-hdr">
        <span class="ctrls-k">Live Knobs</span>
        <span class="ctrls-hint mono">K1–K4 · 0..100</span>
      </div>
      <div class="slider-row">
        <span class="s-label">K1</span>
        <input type="range" class="pf-slider" id="sl-0" min="0" max="100" step="1" value="50">
        <span class="s-val" id="sv-0">50</span>
      </div>
      <div class="slider-row">
        <span class="s-label">K2</span>
        <input type="range" class="pf-slider" id="sl-1" min="0" max="100" step="1" value="50">
        <span class="s-val" id="sv-1">50</span>
      </div>
      <div class="slider-row">
        <span class="s-label">K3</span>
        <input type="range" class="pf-slider" id="sl-2" min="0" max="100" step="1" value="50">
        <span class="s-val" id="sv-2">50</span>
      </div>
      <div class="slider-row">
        <span class="s-label">K4</span>
        <input type="range" class="pf-slider" id="sl-3" min="0" max="100" step="1" value="50">
        <span class="s-val" id="sv-3">50</span>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><span class="k">Patterns</span><div class="v" id="s-pat">&mdash;</div></div>
      <div class="stat"><span class="k">Storage</span><div class="v" id="s-fs">&mdash;</div>
        <div class="bar"><i id="s-fsbar"></i></div></div>
      <div class="stat"><span class="k">Wi-Fi</span><div class="v" id="s-wifi">&mdash;</div></div>
      <div class="stat"><span class="k">Address</span><div class="v" id="s-ip">&mdash;</div></div>
      <div class="stat"><span class="k">Memory</span><div class="v" id="s-heap">&mdash;</div></div>
      <div class="stat"><span class="k">Uptime</span><div class="v" id="s-up">&mdash;</div></div>
      <div class="stat"><span class="k">Firmware</span><div class="v" id="s-fw">&mdash;</div></div>
      <!-- Which edition this panel is running. It was a line of small print in
           the footer, which is where you put something nobody needs — and this
           is the first thing to know when a feature you expected is not here.
           Same block as everything else, and a link either way: on an edition
           it goes to that edition's card, on the default it goes to the shelf,
           because "where are the other ones" is the question the default
           raises. -->
      <a class="stat" id="s-ed-block" href="https://patternflow.work/editions">
        <span class="k">Edition</span>
        <div class="v" id="s-ed">&mdash;</div>
        <div class="sub" id="s-ed-sub"></div>
      </a>
    </div>
  </div>

  <!-- Points at the SITE, not this device's own /update: that page reads the
       release manifest and hands the new image to this board over Wi-Fi, so
       there is no .bin to find and nothing to download by hand. -->
  <a id="upd" href="https://patternflow.work/update" target="_blank" rel="noopener">
    <span class="tag">update</span>
    <span id="updtext"></span><span class="go">how to update &rarr;</span></a>
  </div>

  <div class="rows">
  <span class="pf-kicker">Patterns</span>
  <nav>
    <a class="pf-row" href="/patterns">
      <span class="pf-ghost">01</span>
      <div class="pf-row-t">Pattern library</div>
      <div class="pf-row-d">Drop in a <b>.pfm</b> module or a whole <b>.zip</b> pack &mdash; play, arrange, delete.</div>
    </a>
  </nav>

  <!-- Whatever features this firmware carries, one row each. The rows are
       not written into this page: they arrive from /api/status featureNav,
       contributed by the loaded features, so a page the core has never heard
       of still gets a row and a build with none gets no group. This page
       used to hand-write rows for /show, /mqtt and /weather - capability-
       gated, so they degraded, but named in a core page all the same, and
       the first feature page the list did not know about proved the point by
       having no row at all. -->
  <span class="pf-kicker" id="featKick" hidden>Features</span>
  <nav id="featRows" hidden></nav>

  <span class="pf-kicker">Setup</span>
  <nav>
    <a class="pf-row" href="/wifi">
      <span class="pf-ghost">03</span>
      <div class="pf-row-t">Wi-Fi</div>
      <div class="pf-row-d">Remember several networks &mdash; the device joins whichever one it finds.</div>
    </a>
  </nav>

  <span class="pf-kicker">Device</span>
  <nav>
    <a class="pf-row" href="/update">
      <span class="pf-ghost">05</span>
      <div class="pf-row-t">Firmware update</div>
      <div class="pf-row-d">Drop a .bin &mdash; the device flashes itself over the LAN and reboots. Patterns and Wi-Fi are untouched.</div>
    </a>
    <a class="pf-row" href="/status">
      <span class="pf-ghost">06</span>
      <div class="pf-row-t">Status</div>
      <div class="pf-row-d">Frame rate, memory, storage and network &mdash; what the device is actually doing.</div>
    </a>
  </nav>

  </div>
  </div>

  <footer><span id="host"></span>
    <a href="https://patternflow.work" target="_blank" rel="noopener">patternflow.work</a></footer>
</main>

<script>
function $(i){return document.getElementById(i)}
$('host').textContent=location.hostname;

// ── What this build actually has ───────────────────────────────
// Feature rows are not written into this page. Whatever features the firmware
// carries report their pages in /api/status featureNav — path, label, one
// line — and the Features group is built from that. A build with none gets
// no group, and a page the core has never heard of still gets a row. This
// used to work the other way round: rows for every feature in the markup,
// deleted when the capability was absent, which meant a core page naming
// features and a new feature's page getting no row at all.
//
// Rebuilt from scratch on every status (gate can fire twice at load), then
// everything renumbers so the list still reads 01, 02, 03.
function gate(s){
  var i,nav=(s&&s.featureNav)||[];
  var f=$('featRows'),fk=$('featKick');
  if(f){
    f.innerHTML='';
    for(i=0;i<nav.length;i++){
      var e=nav[i];if(!e||e.length<2)continue;
      var a=document.createElement('a');
      a.className='pf-row';a.href=e[0];
      a.innerHTML='<span class="pf-ghost">00</span>'+
        '<div class="pf-row-t"></div><div class="pf-row-d"></div>';
      a.querySelector('.pf-row-t').textContent=e[1];
      a.querySelector('.pf-row-d').textContent=e[2]||'';
      f.appendChild(a);
    }
    f.hidden=fk.hidden=!f.querySelector('.pf-row');
  }
  var ghosts=document.querySelectorAll('.rows .pf-ghost');
  for(i=0;i<ghosts.length;i++)
    ghosts[i].textContent=(i+1<10?'0':'')+(i+1);
}
document.addEventListener('pf-status',function(e){gate(e.detail)});
if(window.pfStatus){gate(window.pfStatus)}

// ── Device card ───────────────────────────────────────────────
// One status JSON, ~1.7 KB every 3 s — everything on the card comes out of
// it. The device streams no pixels: a frame-preview endpoint existed for one
// day and captured the render loop — see the note in core_patterns_http.h.
function dur(s){
  var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);
  if(d)return d+'d '+h+'h';if(h)return h+'h '+m+'m';
  if(m)return m+'m';return s+'s';
}
function tick(){
  if(document.hidden)return;
  fetch('/api/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){
    if(s.version){var pv=document.getElementById('pfVer');if(pv)pv.textContent='v'+s.version}
    // Three states, in the order the device resolves them. Asleep outranks
    // paused: a sleeping device is asleep whatever this page is doing to its
    // memory, and the frame rate below would be a number from before it went
    // dark either way.
    if(s.sleep){
      $('now').textContent='Asleep';
      $('nowsub').textContent=s.active?(s.active+' resumes on wake'):'panel off';
    }else if(s.consolePaused){
      // While this page is open the pattern is deliberately paused (the
      // console borrows its RAM) — say so instead of showing a make-believe
      // frame rate from the paused loop.
      $('now').textContent='Paused';
      $('nowsub').textContent='resumes when you close the console';
    }else{
      $('now').textContent=s.active||'—';
      $('nowsub').textContent=(s.frameUs?Math.round(1e6/s.frameUs)+' fps · ':'')+
        (s.activeIsModule?'module':'built in');
    }
    paintPower(s.sleep);
    $('s-pat').textContent=s.patterns+'  ('+s.presets+' built in + '+s.modules+' modules)';
    if(s.fsMounted){
      $('s-fs').textContent=Math.round((s.fsTotal-s.fsUsed)/1048576*10)/10+' MB free';
      $('s-fsbar').style.width=(s.fsTotal?s.fsUsed/s.fsTotal*100:0)+'%';
    }else{$('s-fs').textContent='not mounted'}
    $('s-wifi').textContent=s.wifi?(s.ssid+' · '+s.rssi+' dBm'):'offline';
    $('s-ip').textContent=s.wifi?s.ip:'—';
    $('s-heap').textContent=Math.round(s.heapInternal/1024)+'K + '+
      Math.round(s.heapPsram/1048576)+'M psram';
    $('s-up').textContent=dur(s.uptime);
    $('s-fw').textContent='v'+s.version;

    // Edition. The default build says what it is and where the others are,
    // because "the feature I wanted is missing" is the question it provokes;
    // an edition says which one and links to its own card.
    var ed=s.variant&&s.variant!=='core'?s.variant:'';
    if(ed){
      $('s-ed').textContent=ed+(s.variantVersion?' '+s.variantVersion:'');
      $('s-ed-sub').textContent='This panel runs the '+ed+' edition. '+
        'Tap for what it carries, or to go back to the standard firmware.';
      $('s-ed-block').href='https://patternflow.work/editions#'+encodeURIComponent(ed);
    }else{
      $('s-ed').textContent='Patternflow';
      $('s-ed-sub').textContent='The standard firmware. Other editions carry '+
        'what this one does not — tap to see them. Installing one is a click '+
        'and keeps your patterns and settings.';
      $('s-ed-block').href='https://patternflow.work/editions';
    }
    if(s.params)updateSliders(s.params);
    checkUpdate(s.version,s.variant);
  }).catch(function(){$('nowsub').textContent='cannot reach device'});
}

// ── Panel switch ──────────────────────────────────────────────
// The switch is a VIEW of the device's state, not its own truth: K1 on the
// device and an MQTT message change the same thing, and the 3 s poll is what
// keeps this honest when they do.
//
// The one exception is the moment after a click. POST /api/sleep only queues
// the transition — loop() performs it on its next pass — so a poll landing in
// between still reports the old value and would snap the switch back under the
// cursor. settleUntil suppresses that for a beat, which is long enough for the
// device to have actually moved.
var settleUntil=0;
function paintPower(asleep,force){
  if(!force&&Date.now()<settleUntil)return;
  $('p-on').className='pwr-b'+(asleep?'':' on');
  $('p-sleep').className='pwr-b'+(asleep?' on':'');
}
function note(t,cls){$('pwrnote').textContent=t||'';$('pwrnote').className='pwr-note'+(cls?' '+cls:'')}
function setPower(asleep){
  settleUntil=Date.now()+1500;
  paintPower(asleep,true);
  note(asleep?'sleeping…':'waking…');
  fetch('/api/sleep',{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:'on='+(asleep?'1':'0')})
    .then(function(r){if(!r.ok)throw 0;return r.json()})
    .then(function(){
      note(asleep?'panel off — any knob or button wakes it':'');
      // Confirm from the device rather than trusting the optimistic paint.
      setTimeout(function(){settleUntil=0;tick()},600);
    })
    .catch(function(){
      settleUntil=0;
      note('cannot reach device','err');
      tick();
    });
}
$('p-on').addEventListener('click',function(){setPower(false)});
$('p-sleep').addEventListener('click',function(){setPower(true)});

// ── Update check (runs in the browser, never on the device) ───
var updChecked=false;
// The manifest at patternflow.work describes CORE releases. Offering one
// of those to a panel running somebody else's firmware would talk a
// person into flashing away the thing they deliberately chose, with a
// version comparison that means nothing across two release lines. So on
// a variant this stays quiet: that maintainer announces their own
// updates, and the footer already links to them.
function checkUpdate(deviceVersion,variant){
  if(updChecked||!deviceVersion)return;
  if(variant&&variant!=='core')return;
  updChecked=true;
  fetch('https://patternflow.work/flash/manifest.json',{cache:'no-store'})
    .then(function(r){if(!r.ok)throw 0;return r.json()})
    .then(function(m){
      var latest=String(m.version||'').replace(/^v/,'');
      if(latest&&latest!==deviceVersion){
        $('updtext').textContent='v'+latest+' is out — this device runs v'+deviceVersion+'.';
        $('upd').style.display='flex';
      }
    }).catch(function(){/* offline LAN or no CORS — say nothing */});
}

// ── Live parameter sliders (K1..K4 · 0..100) ──────────────────
var activeSlider = -1;
var inFlight = false;
var queuedParams = {};
var lastReported = [50, 50, 50, 50];

function updateSliders(params) {
  if (!params || params.length < 4) return;
  for (var i = 0; i < 4; i++) {
    if (activeSlider === i) continue;
    var v = Math.round(params[i] / 10);
    if (v < 0) v = 0; if (v > 100) v = 100;
    var sl = $('sl-' + i), sv = $('sv-' + i);
    if (sl && sv) {
      sl.value = v;
      sv.textContent = v;
      lastReported[i] = v;
    }
  }
}

function pumpParams() {
  if (inFlight) return; // Drop redundant updates while in-flight; keep newest in queue
  var keys = Object.keys(queuedParams);
  if (!keys.length) return;

  var bodyParts = [];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    bodyParts.push(k + '=' + encodeURIComponent(queuedParams[k]));
  }
  queuedParams = {};
  inFlight = true;

  fetch('/api/params', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParts.join('&')
  }).catch(function() {
  }).finally(function() {
    inFlight = false;
    if (Object.keys(queuedParams).length) {
      pumpParams(); // Flush pending latest updates
    }
  });
}

function onSliderInput(idx, val) {
  var v = parseInt(val, 10);
  if (isNaN(v)) return;
  var d = v - lastReported[idx];
  lastReported[idx] = v;

  // pX (0..1000 for modern PFParams) + dX (relative delta for legacy patterns)
  queuedParams['p' + (idx + 1)] = v * 10;
  queuedParams['d' + (idx + 1)] = (queuedParams['d' + (idx + 1)] || 0) + d;

  pumpParams();
}

function initSliders() {
  for (var i = 0; i < 4; i++) {
    (function(idx) {
      var sl = $('sl-' + idx), sv = $('sv-' + idx);
      if (!sl) return;
      var onStart = function() { activeSlider = idx; };
      var onEnd = function() {
        activeSlider = -1;
        pumpParams();
      };
      sl.addEventListener('touchstart', onStart, {passive: true});
      sl.addEventListener('touchend', onEnd, {passive: true});
      sl.addEventListener('mousedown', onStart);
      window.addEventListener('mouseup', onEnd);
      sl.addEventListener('input', function() {
        var v = sl.value;
        if (sv) sv.textContent = v;
        onSliderInput(idx, v);
      });
    })(i);
  }
}
initSliders();

// ── Quick pattern stepping (← / →) ───────────────────────────
function stepPattern(dir) {
  var prev = $('now').textContent;
  $('now').textContent = dir > 0 ? 'Next…' : 'Prev…';
  fetch('/api/patterns/select?step=' + dir, {cache: 'no-store'})
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.ok && d.name) {
        $('now').textContent = d.name;
        $('nowsub').textContent = 'switched';
      }
      setTimeout(tick, 300);
    })
    .catch(function() {
      $('now').textContent = prev;
    });
}
$('pat-prev').addEventListener('click', function() { stepPattern(-1); });
$('pat-next').addEventListener('click', function() { stepPattern(1); });

tick();
setInterval(tick,3000);
document.addEventListener('visibilitychange',function(){if(!document.hidden)tick()});
</script>
</body></html>
)HTML";
