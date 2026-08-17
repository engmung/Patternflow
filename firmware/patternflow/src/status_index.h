// ═══════════════════════════════════════════════════════════
// PatternFlow - /status page (served by core_status_http.h)
// Same cream/ink/LED tokens as the other consoles; no external assets.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

static const char STATUS_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - Status</title>
<style>
:root{--cream:#0C0B09;--ink:#EDE7DB;--muted:#8A8272;--faint:#5A5546;
--rule:#242118;--rule-soft:#1B1914;--led:#FF5C2E;--ok:#57B87F;--warn:#D9A03F;
--panel:#131110;
--sans:'Inter',ui-sans-serif,system-ui,sans-serif;
--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);font-family:var(--sans);
line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:680px;margin:0 auto;padding:32px 20px 64px}
header{display:flex;align-items:center;gap:8px;padding-bottom:12px;
border-bottom:1px solid var(--rule)}
.dot{width:7px;height:7px;background:var(--led);border-radius:1px}
h1{font-size:15px;font-weight:600;margin:0;flex:1}
.sub{font-family:var(--mono);font-size:11px;color:var(--faint)}
section{margin-top:26px}
h2{font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;
color:var(--muted);margin:0 0 8px}
dl{margin:0;border-top:1px solid var(--rule-soft)}
.row{display:flex;align-items:baseline;gap:12px;padding:7px 2px;
border-bottom:1px solid var(--rule-soft)}
dt{flex:1;font-size:13px;color:var(--muted);margin:0}
dd{margin:0;font-family:var(--mono);font-size:12px;text-align:right}
dd.big{font-size:13px;font-weight:600}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--led)}
.bar{height:3px;background:var(--rule-soft);margin-top:5px;width:100%}
.bar i{display:block;height:100%;background:var(--led)}
.note{font-size:12px;color:var(--faint);margin:8px 0 0;line-height:1.45}
footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--rule);
font-family:var(--mono);font-size:11px;color:var(--faint)}
a{color:var(--muted)}
/* Console navigation, same on every page. */
.pfnav{display:flex;flex-wrap:wrap;gap:13px;margin:10px 0 0;
font-family:var(--mono);font-size:11px;letter-spacing:.04em}
.pfnav a{color:var(--faint);text-decoration:none}
.pfnav a:hover{color:var(--led)}
.pfnav a.here{color:var(--ink)}
</style></head><body><div class="wrap">
<header><span class="dot"></span><h1>Status</h1><span class="sub" id="up">-</span></header>
<nav class="pfnav"><a href="/">Console</a><a href="/patterns">Patterns</a><a href="/audio">Audio</a><a href="/status" class="here">Status</a><a href="/wifi">Wi-Fi</a><a href="/mqtt">MQTT</a><a href="/update">Update</a></nav>

<section><h2>Render</h2><dl>
  <div class="row"><dt>Panel</dt><dd id="pwr">-</dd></div>
  <div class="row"><dt>Frame rate</dt><dd class="big" id="fps">-</dd></div>
  <div class="row"><dt>Frame time</dt><dd id="ft">-</dd></div>
  <div class="row"><dt>Active pattern</dt><dd id="act">-</dd></div>
</dl>
<p class="note" id="pwrnote"></p></section>

<section><h2>Patterns</h2><dl>
  <div class="row"><dt>Total</dt><dd id="pt">-</dd></div>
  <div class="row"><dt>Built into firmware</dt><dd id="pp">-</dd></div>
  <div class="row"><dt>Loaded from storage</dt><dd id="pm">-</dd></div>
</dl>
<p class="note" id="loadnote"></p></section>

<section><h2>Memory</h2><dl>
  <div class="row"><dt>Internal heap free</dt><dd id="hi">-</dd></div>
  <div class="row"><dt>Largest free block</dt><dd id="hl">-</dd></div>
  <div class="row"><dt>PSRAM free</dt><dd id="hp">-</dd></div>
</dl>
<p class="note">Internal heap is the scarce one - the LED panel's DMA buffers
live there. Below ~10 KB this page itself stops loading.</p></section>

<section><h2>Storage</h2><dl>
  <div class="row"><dt>Pattern storage</dt><dd id="fs">-</dd></div>
</dl><div class="bar"><i id="fsbar" style="width:0"></i></div></section>

<section><h2>Network</h2><dl>
  <div class="row"><dt>Network</dt><dd id="ss">-</dd></div>
  <div class="row"><dt>Signal</dt><dd id="rs">-</dd></div>
  <div class="row"><dt>Address</dt><dd id="ip">-</dd></div>
  <div class="row"><dt>MQTT</dt><dd id="mq">-</dd></div>
</dl></section>

<footer>Firmware <span id="fw">-</span> &middot; panel <span id="pn">-</span>
&nbsp;<a href="/">Home</a> &middot; <a href="/patterns">Patterns</a></footer>
</div>
<script>
function $(i){return document.getElementById(i)}
function kb(b){return b>=1048576?(b/1048576).toFixed(2)+' MB':Math.round(b/1024)+' KB'}
function dur(s){
  var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),
      m=Math.floor(s%3600/60),x=s%60;
  if(d)return d+'d '+h+'h';if(h)return h+'h '+m+'m';
  if(m)return m+'m '+x+'s';return x+'s';
}
function cls(el,c){el.className='big '+c}

function tick(){
  fetch('/api/status').then(function(r){return r.json()}).then(function(d){
    $('up').textContent='up '+dur(d.uptime);
    $('fw').textContent=d.version;$('pn').textContent=d.panel;

    // Read-only here; the switch lives on the console home page. Both dark
    // states are worth naming, because the numbers below them look identical
    // either way — and asleep or paused, the frame rate is from before the
    // panel went dark.
    var dark=d.sleep||d.consolePaused;
    $('pwr').textContent=d.sleep?'asleep':d.consolePaused?'paused by console':'awake';
    $('pwr').className=d.sleep?'warn':'';
    $('pwrnote').textContent=d.sleep
      ?'Panel off, still on the network. Any knob or button wakes it, as does the switch on the console home page.'
      :d.consolePaused?'This console is holding the pattern paused to free memory. It resumes when you are done.':'';

    var fps=d.frameUs?1e6/d.frameUs:0;
    $('fps').textContent=d.frameUs?(dark?'—':fps.toFixed(1)+' fps'):'-';
    cls($('fps'),dark?'':fps>=45?'ok':fps>=25?'warn':'bad');
    $('ft').textContent=d.frameUs&&!dark?(d.frameUs/1000).toFixed(2)+' ms':'-';
    $('act').textContent=d.active+(d.activeIsModule?'  (module)':'  (built in)');

    $('pt').textContent=d.patterns;$('pp').textContent=d.presets;
    $('pm').textContent=d.modules;

    if(d.load.total){
      $('loadnote').textContent='Last module load: '+(d.load.total/1000).toFixed(1)+
        ' ms  =  read '+(d.load.read/1000).toFixed(1)+
        ' + relocate '+(d.load.relocate/1000).toFixed(1)+
        ' + setup '+(d.load.setup/1000).toFixed(1)+' ms';
    } else {
      $('loadnote').textContent='No module loaded since boot.';
    }

    $('hi').textContent=kb(d.heapInternal);
    $('hi').className=d.heapInternal>12288?'ok':d.heapInternal>8192?'warn':'bad';
    $('hl').textContent=kb(d.heapLargest);
    $('hp').textContent=kb(d.heapPsram);

    if(d.fsMounted){
      var used=d.fsUsed,tot=d.fsTotal;
      $('fs').textContent=kb(tot-used)+' free of '+kb(tot);
      $('fsbar').style.width=(tot?used/tot*100:0)+'%';
    } else { $('fs').textContent='not mounted'; $('fs').className='bad'; }

    $('ss').textContent=d.wifi?d.ssid:'offline';
    $('ss').className=d.wifi?'ok':'bad';
    $('rs').textContent=d.wifi?d.rssi+' dBm':'-';
    $('ip').textContent=d.wifi?d.ip:'-';

    // "off" is a choice, not a fault — only a role that is trying and
    // failing gets the red treatment.
    var role=d.mqttRole||'off';
    $('mq').textContent=role==='off'?'off':(role+' · '+(d.mqttState||'-'));
    $('mq').className=role==='off'?'':(d.mqttConnected?'ok':'bad');
  }).catch(function(){$('up').textContent='disconnected'});
}
tick();setInterval(tick,2000);
</script></body></html>)HTML";
