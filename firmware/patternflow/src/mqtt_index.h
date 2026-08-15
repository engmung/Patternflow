// ═══════════════════════════════════════════════════════════
// PatternFlow - /mqtt channel + role page (served by core_mqtt_http.h)
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

static const char MQTT_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - MQTT</title>
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
color:var(--muted);margin:0 0 10px}
.channels{display:grid;gap:8px;grid-template-columns:repeat(4,1fr)}
@media(min-width:560px){.channels{grid-template-columns:repeat(7,1fr)}}
.roles{display:grid;gap:10px}
@media(min-width:560px){.roles{grid-template-columns:1fr 1fr}}
.role,.ch{display:block;border:1px solid var(--rule);background:var(--panel);padding:12px 10px;
cursor:pointer;text-align:left;font-family:inherit;color:inherit}
.ch{padding:10px 6px;text-align:center}
.role:hover,.ch:hover{border-color:var(--muted)}
.role.on,.ch.on{border-color:var(--led);box-shadow:inset 0 0 0 1px var(--led)}
.role:disabled,.ch:disabled{opacity:.45;cursor:default}
.modes{display:grid;gap:8px;grid-template-columns:1fr 1fr;margin-bottom:10px}
#rolebox.hidden,#normalbox.hidden,#directorbox.hidden{display:none}
.role b,.ch b{display:block;font-size:13px;font-weight:600;margin-bottom:2px}
.role p{margin:0;font-size:12px;color:var(--muted);line-height:1.4}
.ch p{margin:0;font-size:10px;color:var(--muted);line-height:1.3}
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
.pfnav{display:flex;flex-wrap:wrap;gap:13px;margin:10px 0 0;
font-family:var(--mono);font-size:11px;letter-spacing:.04em}
.pfnav a{color:var(--faint);text-decoration:none}
.pfnav a:hover{color:var(--led)}
.pfnav a.here{color:var(--ink)}
#rolebox.hidden{display:none}
</style></head><body><div class="wrap">
<header><span class="dot"></span><h1>MQTT</h1><span class="sub" id="st">-</span></header>
<nav class="pfnav"><a href="/">Console</a><a href="/patterns">Patterns</a><a href="/show">Sequences</a><a href="/audio">Audio</a><a href="/status">Status</a><a href="/wifi">Wi-Fi</a><a href="/mqtt" class="here">MQTT</a><a href="/update">Update</a></nav>

<section>
  <h2>Mode</h2>
  <div class="modes">
    <button class="ch" id="m-normal" type="button"><b>Normal</b><p>community / HA broker</p></button>
    <button class="ch" id="m-director" type="button"><b>Director</b><p>local PC, no password</p></button>
  </div>
  <p class="note">Normal keeps your saved broker. Director talks only to the PC running Director
    on this Wi‑Fi — paste the LAN IP shown in the Director Setup tab.</p>
</section>

<section id="directorbox" class="hidden">
  <h2>Director PC</h2>
  <form id="dir" autocomplete="off">
    <div class="field"><label for="f-dirhost">PC IP</label>
      <input id="f-dirhost" name="dirhost" placeholder="192.168.1.10" maxlength="63" inputmode="decimal"></div>
    <div class="actions">
      <button type="submit" class="save" id="dirsave">Connect to Director</button>
      <span class="note" id="dirmsg"></span>
    </div>
  </form>
  <p class="note">Port <b>1883</b>, prefix <b>patternflow</b>, role <b>Subscriber</b>, no user or password.
    Your Normal broker settings are left untouched.</p>
</section>

<div id="normalbox">
<section>
  <h2>Channel</h2>
  <div class="banner" id="unset">No broker set yet, so nothing will connect whichever channel you
    pick. Fill in <b>Broker</b> below — it is saved on the device, not in the firmware.</div>
  <div class="channels">
    <button class="ch" id="c-off" data-channel="off"><b>Off</b><p>No broker</p></button>
    <button class="ch" id="c-broadcast" data-channel="broadcast"><b>Broadcast</b><p>sandbox</p></button>
    <button class="ch" id="c-ch1" data-channel="ch1"><b>Ch1</b><p>Sub only</p></button>
    <button class="ch" id="c-ch2" data-channel="ch2"><b>Ch2</b><p>Sub only</p></button>
    <button class="ch" id="c-ch3" data-channel="ch3"><b>Ch3</b><p>Sub only</p></button>
    <button class="ch" id="c-ch4" data-channel="ch4"><b>Ch4</b><p>Sub only</p></button>
    <button class="ch" id="c-live" data-channel="live"><b>Live</b><p>Ch5</p></button>
  </div>
  <div id="msg"></div>
  <p class="note">Timed shows use Ch1–4 (subscribe only). Live is channel 5. Broadcast is the
    community sandbox. Switching channel unsubscribes the previous prefix and resubscribes.</p>
</section>

<section id="rolebox">
  <h2>Role</h2>
  <div class="roles">
    <button class="role" id="r-publisher" data-role="publisher"><b>Publisher</b><p>Send knobs and pattern name on this prefix.</p></button>
    <button class="role" id="r-subscriber" data-role="subscriber"><b>Subscriber</b><p>Follow live topics; apply retained snapshot on channels.</p></button>
  </div>
  <p class="note" id="rolenote">Broadcast and Live allow Pub or Sub. Ch1–4 are always Subscriber.</p>
</section>

<section>
  <h2>Broker</h2>
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
  <p class="note">Channel buttons set the prefix. Edit Prefix only for a custom/local broker namespace, then Save.</p>
  <dl>
    <div class="row"><dt>State</dt><dd id="state">-</dd></div>
  </dl>
</section>
</div>

<section>
  <h2>Last values</h2>
  <dl>
    <div class="row"><dt>Pattern</dt><dd id="pat">-</dd></div>
    <div class="row"><dt>K1</dt><dd id="k1">-</dd></div>
    <div class="row"><dt>K2</dt><dd id="k2">-</dd></div>
    <div class="row"><dt>K3</dt><dd id="k3">-</dd></div>
    <div class="row"><dt>K4</dt><dd id="k4">-</dd></div>
    <div class="row"><dt>P1–4</dt><dd id="params">-</dd></div>
  </dl>
</section>

<footer>Topics: <span id="topics"></span></footer>
</div>
<script>
function $(i){return document.getElementById(i)}
function say(t,cls){$('msg').textContent=t;$('msg').className=cls||''}

var cfgFilled=false;
function fillConfig(d){
  $('f-host').value=(d.normalHost!=null?d.normalHost:'')||'';
  $('f-port').value=d.normalPort||1883;
  $('f-user').value=d.normalUser||'';
  $('f-prefix').value=d.normalPrefix||'patternflow';
  $('f-pass').value='';
  $('f-pass').placeholder=d.normalHasPassword?'unchanged':'none set';
  if($('f-dirhost')) $('f-dirhost').value=d.directorHost||'';
  cfgFilled=true;
}

function paint(d){
  var prefix=d.prefix||'patternflow';
  var ch=d.channel||'off';
  var mode=d.mode||'normal';
  $('st').textContent=d.connected?'connected':(d.state||'offline');
  if(!cfgFilled)fillConfig(d);
  if($('f-dirhost') && d.directorHost!=null) $('f-dirhost').value=d.directorHost||$('f-dirhost').value;
  if($('m-normal')) $('m-normal').className='ch'+(mode==='normal'?' on':'');
  if($('m-director')) $('m-director').className='ch'+(mode==='director'?' on':'');
  if($('directorbox')) $('directorbox').className=mode==='director'?'':'hidden';
  if($('normalbox')) $('normalbox').className=mode==='director'?'hidden':'';
  $('state').textContent=d.state||'-';
  $('state').className=d.connected?'ok':
    (d.role==='off'||ch==='off'||!d.configured?'':'bad');
  $('unset').style.display=d.configured||mode==='director'?'none':'block';
  $('pat').textContent=d.pattern||'-';
  var k=d.knobs||[0,0,0,0];
  for(var i=0;i<4;i++)$('k'+(i+1)).textContent=k[i];
  var p=d.params||[0,0,0,0];
  var pa=d.paramActive||[false,false,false,false];
  $('params').textContent=p.map(function(v,i){return (pa[i]?v:'—')}).join(' · ');
  var topics=prefix+'/knob/1..4  ·  '+prefix+'/pattern  ·  '+prefix+'/param/1..4';
  if(ch==='ch1'||ch==='ch2'||ch==='ch3'||ch==='ch4'||ch==='live')
    topics+='  ·  '+prefix+'/snapshot';
  if(mode==='director')
    topics+='  ·  '+prefix+'/query  ·  '+prefix+'/inventory/#  ·  '+prefix+'/select';
  $('topics').textContent=topics;

  ['off','broadcast','ch1','ch2','ch3','ch4','live'].forEach(function(c){
    var el=$('c-'+c);
    if(el)el.className='ch'+(ch===c?' on':'');
  });
  var forces=!!d.forcesSub || ch==='ch1'||ch==='ch2'||ch==='ch3'||ch==='ch4';
  var showRole=ch!=='off';
  $('rolebox').className=showRole?'':'hidden';
  ['publisher','subscriber'].forEach(function(r){
    var el=$('r-'+r);
    if(!el)return;
    el.disabled=forces && r==='publisher';
    el.className='role'+(d.role===r?' on':'');
  });
  $('rolenote').textContent=forces
    ?'Channels 1–4 are Subscriber only (Show manager publishes).'
    :'Broadcast and Live allow Publisher or Subscriber.';
  if(d.error)say(d.error,'err');
}

function load(){
  fetch('/api/mqtt',{cache:'no-store'}).then(function(r){return r.json()})
    .then(paint).catch(function(){say('cannot reach device','err')});
}

function postMqtt(body,okMsg){
  say('switching…');
  fetch('/api/mqtt',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:body})
    .then(function(r){return r.json()}).then(function(d){
      if(d.ok===false){say(d.error||'failed','err');return}
      say(okMsg,'good');
      paint(d);
    }).catch(function(){say('no reply from device','err')});
}

Array.prototype.forEach.call(document.querySelectorAll('.ch'),function(btn){
  btn.onclick=function(){
    var channel=btn.getAttribute('data-channel');
    postMqtt('channel='+encodeURIComponent(channel),'channel: '+channel);
  };
});

Array.prototype.forEach.call(document.querySelectorAll('.role'),function(btn){
  btn.onclick=function(){
    if(btn.disabled)return;
    var role=btn.getAttribute('data-role');
    postMqtt('role='+encodeURIComponent(role),'role saved: '+role);
  };
});

function cfgSay(t,cls){var e=$('cfgmsg');e.textContent=t;e.className='note'+(cls?' '+cls:'')}

$('cfg').onsubmit=function(ev){
  ev.preventDefault();
  var host=$('f-host').value.trim();
  if(!host){cfgSay('a host is required — or press Forget','err');return}
  cfgSay('saving…');
  $('save').disabled=true;
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

function dirSay(t,cls){var e=$('dirmsg');if(!e)return;e.textContent=t;e.className='note'+(cls?' '+cls:'')}

$('m-normal').onclick=function(){
  fetch('/api/mqtt/mode',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'mode=normal'})
    .then(function(r){return r.json()}).then(function(d){
      if(d.ok===false){say(d.error||'failed','err');return}
      say('Normal MQTT','good');
      paint(d);
    }).catch(function(){say('no reply from device','err')});
};

$('m-director').onclick=function(){
  fetch('/api/mqtt/mode',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'mode=director'})
    .then(function(r){return r.json()}).then(function(d){
      if(d.ok===false){say(d.error||'failed','err');return}
      say('Director MQTT — paste the PC IP','good');
      paint(d);
    }).catch(function(){say('no reply from device','err')});
};

$('dir').onsubmit=function(ev){
  ev.preventDefault();
  var host=$('f-dirhost').value.trim();
  if(!host){dirSay('paste the Director PC IP','err');return}
  dirSay('connecting…');
  $('dirsave').disabled=true;
  fetch('/api/mqtt/director',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'host='+encodeURIComponent(host)})
    .then(function(r){return r.json()}).then(function(d){
      $('dirsave').disabled=false;
      if(d.ok===false){dirSay(d.error||'could not save','err');return}
      dirSay('saved — connecting to '+host,'good');
      paint(d);
    }).catch(function(){$('dirsave').disabled=false;dirSay('no reply from device','err')});
};

load();
setInterval(load,2000);
</script></body></html>)HTML";
