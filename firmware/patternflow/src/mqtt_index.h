// ═══════════════════════════════════════════════════════════
// PatternFlow - /mqtt role page (served by core_mqtt_http.h)
// Same cream/ink/LED tokens as the other consoles; no external assets.
//
// The broker is compile-time, so the only control here is the role. When
// no broker is configured the page says so and points at the secrets file
// rather than leaving you watching a connect loop fail.
//
// The role picker is Simone Majocchi's (@SimonePDA), from his Patternflow
// fork; restyled here to the device console's palette.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

static const char MQTT_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - MQTT</title>
<style>
/* Dark instrument tokens — see patterns_index.h for the note. */
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
color:var(--muted);margin:0 0 10px}
.roles{display:grid;gap:10px}
@media(min-width:560px){.roles{grid-template-columns:1fr 1fr 1fr}}
.role{display:block;border:1px solid var(--rule);background:var(--panel);padding:14px 12px;
cursor:pointer;text-align:left;font-family:inherit;color:inherit}
.role:hover{border-color:var(--muted)}
.role.on{border-color:var(--led);box-shadow:inset 0 0 0 1px var(--led)}
.role b{display:block;font-size:14px;font-weight:600;margin-bottom:4px}
.role p{margin:0;font-size:12px;color:var(--muted);line-height:1.4}
dl{margin:0;border-top:1px solid var(--rule-soft)}
.row{display:flex;align-items:baseline;gap:12px;padding:7px 2px;
border-bottom:1px solid var(--rule-soft)}
dt{flex:1;font-size:13px;color:var(--muted);margin:0}
dd{margin:0;font-family:var(--mono);font-size:12px;text-align:right}
.ok{color:var(--ok)}.bad{color:var(--led)}.warn{color:var(--warn)}
.note{font-size:12px;color:var(--faint);margin:8px 0 0;line-height:1.45}
.banner{border:1px solid var(--warn);padding:10px 12px;margin-bottom:12px;
font-size:12px;color:var(--muted);line-height:1.45;display:none}
.banner code{font-family:var(--mono);font-size:11px;color:var(--ink)}
#msg{margin-top:12px;font-family:var(--mono);font-size:11px;min-height:16px}
#msg.err{color:var(--led)}#msg.good{color:var(--ok)}
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
<header><span class="dot"></span><h1>MQTT</h1><span class="sub" id="st">-</span></header>
<nav class="pfnav"><a href="/">Console</a><a href="/patterns">Patterns</a><a href="/audio">Audio</a><a href="/status">Status</a><a href="/wifi">Wi-Fi</a><a href="/mqtt" class="here">MQTT</a><a href="/update">Update</a></nav>

<section>
  <h2>Role</h2>
  <div class="banner" id="unset">No broker is configured in this build, so nothing will connect
    whichever role you pick. Set <code>PF_MQTT_HOST</code> (and user / password if the broker
    wants them) in <code>patternflow_secrets.h</code> and reflash.</div>
  <div class="roles">
    <button class="role" id="r-off" data-role="off"><b>Off</b><p>Disconnect from the broker. Knobs stay local.</p></button>
    <button class="role" id="r-publisher" data-role="publisher"><b>Publisher</b><p>Send the four knob values and the current pattern name.</p></button>
    <button class="role" id="r-subscriber" data-role="subscriber"><b>Subscriber</b><p>Read the last values, then follow live changes.</p></button>
  </div>
  <div id="msg"></div>
  <p class="note">Pick one panel as publisher and another as subscriber to keep them in sync.
    Values are retained on the broker, so a subscriber that joins late still catches up.
    The choice survives a reboot.</p>
</section>

<section>
  <h2>Broker</h2>
  <dl>
    <div class="row"><dt>Host</dt><dd id="host">-</dd></div>
    <div class="row"><dt>Port</dt><dd id="port">-</dd></div>
    <div class="row"><dt>User</dt><dd id="user">-</dd></div>
    <div class="row"><dt>Prefix</dt><dd id="prefix">-</dd></div>
    <div class="row"><dt>State</dt><dd id="state">-</dd></div>
  </dl>
</section>

<section>
  <h2>Last values</h2>
  <dl>
    <div class="row"><dt>Pattern</dt><dd id="pat">-</dd></div>
    <div class="row"><dt>K1</dt><dd id="k1">-</dd></div>
    <div class="row"><dt>K2</dt><dd id="k2">-</dd></div>
    <div class="row"><dt>K3</dt><dd id="k3">-</dd></div>
    <div class="row"><dt>K4</dt><dd id="k4">-</dd></div>
  </dl>
</section>

<footer>Topics: <span id="topics"></span></footer>
</div>
<script>
function $(i){return document.getElementById(i)}
function say(t,cls){$('msg').textContent=t;$('msg').className=cls||''}

function paint(d){
  var prefix=d.prefix||'patternflow';
  $('st').textContent=d.connected?'connected':(d.state||'offline');
  $('host').textContent=d.host||'(not set)';
  $('port').textContent=d.port||'-';
  $('user').textContent=d.user||'(anonymous)';
  $('prefix').textContent=prefix;
  $('state').textContent=d.state||'-';
  // Only red when it is actually trying and failing: "off" and an
  // unconfigured build are resting states, not faults.
  $('state').className=d.connected?'ok':
    (d.role==='off'||!d.configured?'':'bad');
  $('unset').style.display=d.configured?'none':'block';
  $('pat').textContent=d.pattern||'-';
  var k=d.knobs||[0,0,0,0];
  for(var i=0;i<4;i++)$('k'+(i+1)).textContent=k[i];
  $('topics').textContent=prefix+'/knob/1..4  ·  '+prefix+'/pattern';
  ['off','publisher','subscriber'].forEach(function(r){
    var el=$('r-'+r);
    if(el)el.className='role'+(d.role===r?' on':'');
  });
  if(d.error)say(d.error,'err');
}

function load(){
  fetch('/api/mqtt',{cache:'no-store'}).then(function(r){return r.json()})
    .then(paint).catch(function(){say('cannot reach device','err')});
}

Array.prototype.forEach.call(document.querySelectorAll('.role'),function(btn){
  btn.onclick=function(){
    var role=btn.getAttribute('data-role');
    say('switching…');
    fetch('/api/mqtt',{method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:'role='+encodeURIComponent(role)})
      .then(function(r){return r.json()}).then(function(d){
        if(d.ok===false){say(d.error||'failed','err');return}
        say('role saved: '+role,'good');
        paint(d);
      }).catch(function(){say('no reply from device','err')});
  };
});

load();
setInterval(load,2000);
</script></body></html>)HTML";
