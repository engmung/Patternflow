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
/* Broker form. Labels sit beside their field on a desktop and stack on a
   phone, which is where this page is most likely to be opened — the board is
   across the room and the address is on a sticker. */
#cfg{margin:0 0 14px}
.field{display:flex;align-items:center;gap:12px;padding:6px 0}
.field label{flex:0 0 74px;font-size:13px;color:var(--muted)}
.field input{flex:1;min-width:0;font:inherit;font-family:var(--mono);font-size:12px;
padding:7px 9px;background:var(--panel);color:var(--ink);
border:1px solid var(--rule);border-radius:2px}
.field input:focus{outline:none;border-color:var(--led)}
.field input::placeholder{color:var(--faint)}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:10px}
.save,.forget{font:inherit;font-size:12px;padding:6px 12px;border-radius:2px;cursor:pointer}
.save{border:1px solid var(--led);background:var(--led);color:var(--panel);font-weight:600}
.save:disabled{opacity:.5;cursor:default}
.forget{border:1px solid var(--rule);background:none;color:var(--muted)}
.forget:hover{border-color:var(--led);color:var(--led)}
#cfgmsg{margin:0}
#cfgmsg.err{color:var(--led)}#cfgmsg.good{color:var(--ok)}
@media(max-width:420px){
.field{display:block}
.field label{display:block;margin-bottom:4px}
.field input{width:100%;box-sizing:border-box}}
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
  <div class="banner" id="unset">No broker set yet, so nothing will connect whichever role you
    pick. Fill in <b>Broker</b> below — it is saved on the device, not in the firmware.</div>
  <div class="roles">
    <button class="role" id="r-off" data-role="off"><b>Off</b><p>Disconnect from the broker. Knobs stay local.</p></button>
    <button class="role" id="r-publisher" data-role="publisher"><b>Publisher</b><p>Send the four knob values and the current pattern name.</p></button>
    <button class="role" id="r-subscriber" data-role="subscriber"><b>Subscriber</b><p>Read the last values, then follow live changes.</p></button>
  </div>
  <div id="msg"></div>
  <p class="note">Pick one panel as publisher and another as subscriber to keep them in sync.
    Values are retained on the broker, so a subscriber that joins late still catches up.
    The choice survives a reboot.</p>
  <p class="note">Publish to <code id="msgtopic">patternflow/message</code> and the text appears
    over the running pattern for ten seconds — any connected role, empty payload clears it.
    On a broker shared with other people, every panel using this prefix sees it.</p>
</section>

<section>
  <h2>Broker</h2>
  <!-- Typed in here rather than compiled into the firmware, so a broker
       address and its login never travel in a public image. Saved on this
       device; a reflash keeps them. -->
  <form id="cfg" autocomplete="off">
    <div class="field"><label for="f-host">Host</label>
      <input id="f-host" name="host" placeholder="broker.example.com or 192.168.1.10" maxlength="63"></div>
    <div class="field"><label for="f-port">Port</label>
      <input id="f-port" name="port" type="number" min="1" max="65535" value="1883"></div>
    <div class="field"><label for="f-user">User</label>
      <input id="f-user" name="user" placeholder="leave empty for anonymous" maxlength="31"></div>
    <div class="field"><label for="f-pass">Password</label>
      <input id="f-pass" name="pass" type="password" placeholder="unchanged" maxlength="47"></div>
    <div class="field"><label for="f-prefix">Prefix</label>
      <input id="f-prefix" name="prefix" placeholder="patternflow" maxlength="31"></div>
    <div class="actions">
      <button type="submit" class="save" id="save">Save broker</button>
      <button type="button" class="forget" id="forget">Forget</button>
      <span class="note" id="cfgmsg"></span>
    </div>
  </form>
  <p class="note">The password is stored on the device and never sent back to this page —
    leave it empty to keep the one already saved.</p>
  <dl>
    <div class="row"><dt>State</dt><dd id="state">-</dd></div>
  </dl>
</section>

<section>
  <h2>Last values</h2>
  <dl>
    <div class="row"><dt>Pattern</dt><dd id="pat">-</dd></div>
    <div class="row"><dt>Banner</dt><dd id="banner">-</dd></div>
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

// The form is filled once, and again only after a save. This page polls
// every two seconds, and a poll that writes into the inputs would erase
// whatever was half-typed — so once the fields are populated the status
// updates leave them alone.
var cfgFilled=false;
function fillConfig(d){
  $('f-host').value=d.host||'';
  $('f-port').value=d.port||1883;
  $('f-user').value=d.user||'';
  $('f-prefix').value=d.prefix||'';
  // Never populated: the device does not send it back. The placeholder says
  // which of the two empty-field meanings applies.
  $('f-pass').value='';
  $('f-pass').placeholder=d.hasPassword?'unchanged':'none set';
  cfgFilled=true;
}

function paint(d){
  var prefix=d.prefix||'patternflow';
  $('st').textContent=d.connected?'connected':(d.state||'offline');
  if(!cfgFilled)fillConfig(d);
  $('state').textContent=d.state||'-';
  // Only red when it is actually trying and failing: "off" and an
  // unconfigured build are resting states, not faults.
  $('state').className=d.connected?'ok':
    (d.role==='off'||!d.configured?'':'bad');
  $('unset').style.display=d.configured?'none':'block';
  $('pat').textContent=d.pattern||'-';
  // Counts down while it is on the panel, so you can tell a banner that just
  // arrived from one that is about to go.
  $('banner').textContent=d.messageMs>0
    ?(d.message||'(blank)')+'  ·  '+Math.ceil(d.messageMs/1000)+'s'
    :'-';
  var k=d.knobs||[0,0,0,0];
  for(var i=0;i<4;i++)$('k'+(i+1)).textContent=k[i];
  $('topics').textContent=prefix+'/knob/1..4  ·  '+prefix+'/pattern  ·  '+prefix+'/message';
  $('msgtopic').textContent=prefix+'/message';
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

function cfgSay(t,cls){var e=$('cfgmsg');e.textContent=t;e.className='note'+(cls?' '+cls:'')}

$('cfg').onsubmit=function(ev){
  ev.preventDefault();
  var host=$('f-host').value.trim();
  if(!host){cfgSay('a host is required — or press Forget','err');return}
  cfgSay('saving…');
  $('save').disabled=true;
  // The password rides only when something was typed. An empty field means
  // "keep what is stored", so sending it would blank a working login.
  var body='host='+encodeURIComponent(host)+
    '&port='+encodeURIComponent($('f-port').value||1883)+
    '&user='+encodeURIComponent($('f-user').value.trim())+
    '&prefix='+encodeURIComponent($('f-prefix').value.trim());
  if($('f-pass').value)body+='&pass='+encodeURIComponent($('f-pass').value);
  fetch('/api/mqtt/config',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body})
    .then(function(r){return r.json()}).then(function(d){
      $('save').disabled=false;
      if(d.ok===false){cfgSay(d.error||'could not save','err');return}
      cfgSay('saved — reconnecting','good');
      fillConfig(d);
      paint(d);
    }).catch(function(){$('save').disabled=false;cfgSay('no reply from device','err')});
};

$('forget').onclick=function(){
  if(!confirm('Forget this broker, including the saved password?'))return;
  cfgSay('clearing…');
  fetch('/api/mqtt/forget',{method:'POST'})
    .then(function(r){return r.json()}).then(function(d){
      cfgSay('broker forgotten','good');
      fillConfig(d);
      paint(d);
    }).catch(function(){cfgSay('no reply from device','err')});
};

load();
setInterval(load,2000);
</script></body></html>)HTML";
