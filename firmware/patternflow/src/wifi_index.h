// ═══════════════════════════════════════════════════════════
// PatternFlow - /wifi page (served by core_wifi_http.h)
// Same cream/ink/LED tokens as the other consoles; no external assets.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

static const char WIFI_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - Wi-Fi</title>
<style>
/* Dark instrument tokens — see patterns_index.h for the note. */
:root{--cream:#0C0B09;--ink:#EDE7DB;--muted:#8A8272;--faint:#5A5546;
--rule:#242118;--rule-soft:#1B1914;--led:#FF5C2E;--ok:#57B87F;--panel:#131110;
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
ul{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule-soft)}
li{display:flex;align-items:center;gap:10px;padding:9px 2px;
border-bottom:1px solid var(--rule-soft);font-size:13px}
li .n{font-family:var(--mono);font-size:11px;color:var(--faint);min-width:20px}
li .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
font-family:var(--mono);font-size:12px}
.tag{font-family:var(--mono);font-size:10px;letter-spacing:.06em;
text-transform:uppercase;padding:1px 6px;border:1px solid var(--ok);
border-radius:2px;color:var(--ok)}
button{font:inherit;cursor:pointer}
button.del{font-size:11px;color:var(--muted);background:none;
border:1px solid var(--rule);border-radius:2px;padding:2px 8px}
button.del:hover{border-color:var(--led);color:var(--led)}
form{margin:0;display:grid;gap:10px;max-width:380px}
label{display:block;font-size:12px;color:var(--muted);margin-bottom:3px}
input{width:100%;font:inherit;font-family:var(--mono);font-size:13px;padding:7px 9px;
background:var(--card);color:var(--fg);border:1px solid var(--rule);border-radius:2px}
input:focus{outline:none;border-color:var(--led)}
.actions{display:flex;gap:8px;align-items:center;margin-top:2px}
button.primary{background:var(--ink);color:var(--cream);border:1px solid var(--ink);
border-radius:2px;padding:7px 16px;font-size:13px}
button.primary:hover{background:var(--led);border-color:var(--led)}
.check{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--muted)}
.check input{width:auto}
#msg{margin-top:12px;font-family:var(--mono);font-size:11px;min-height:16px}
#msg.err{color:var(--led)}
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
<header><span class="dot"></span><h1>Wi-Fi</h1><span class="sub" id="st">-</span></header>
<nav class="pfnav"><a href="/">Console</a><a href="/patterns">Patterns</a><a href="/show">Sequences</a><a href="/audio">Audio</a><a href="/status">Status</a><a href="/wifi" class="here">Wi-Fi</a><a href="/mqtt">MQTT</a><a href="/weather">Weather</a><a href="/update">Update</a></nav>

<section>
  <h2>Saved networks</h2>
  <ul id="list"></ul>
  <p class="note" id="cap"></p>
</section>

<section>
  <h2>Add a network</h2>
  <form id="f">
    <div>
      <label for="ssid">Network name</label>
      <input id="ssid" name="ssid" maxlength="32" autocomplete="off" required>
    </div>
    <div>
      <label for="pass">Password</label>
      <input id="pass" name="pass" type="password" maxlength="63" autocomplete="off">
    </div>
    <div class="actions">
      <button class="primary" type="submit">Save</button>
      <span class="check">
        <input type="checkbox" id="now"><label for="now" style="margin:0">switch now</label>
      </span>
    </div>
  </form>
  <div id="msg"></div>
  <p class="note">Saved networks are tried in order, so the device joins whichever
  one it can find &mdash; useful if it moves between home, a studio and a venue.
  A new network is only stored; leave <em>switch now</em> unticked and this page
  keeps working. Ticking it drops the current connection immediately.</p>
</section>

<footer><a href="/">Home</a> &middot; <a href="/status">Status</a></footer>
</div>
<script>
function $(i){return document.getElementById(i)}
function say(t,err){$('msg').textContent=t;$('msg').className=err?'err':''}

var max=5;

function load(){
  fetch('/api/wifi').then(function(r){return r.json()}).then(function(d){
    max=d.max;
    $('st').textContent=d.connected?(d.ip):d.status;
    $('list').innerHTML='';
    if(!d.networks.length){
      var li=document.createElement('li');
      li.innerHTML='<span class="nm" style="color:var(--faint)">none saved yet</span>';
      $('list').appendChild(li);
    }
    d.networks.forEach(function(n,i){
      var li=document.createElement('li');
      var num=document.createElement('span');num.className='n';num.textContent=i+1;
      var nm=document.createElement('span');nm.className='nm';nm.textContent=n.ssid;
      li.appendChild(num);li.appendChild(nm);
      if(d.connected&&n.ssid===d.current){
        var t=document.createElement('span');t.className='tag';t.textContent='connected';
        li.appendChild(t);
      }
      var b=document.createElement('button');b.className='del';b.textContent='forget';
      b.onclick=function(){del(n.ssid)};
      li.appendChild(b);
      $('list').appendChild(li);
    });
    $('cap').textContent=d.networks.length+' of '+max+' slots used'+
      (d.networks.length>=max?' — adding another replaces the last one':'');
  }).catch(function(){$('st').textContent='disconnected'});
}

function del(ssid){
  if(!confirm('Forget "'+ssid+'"?\n\nIf the device is on this network it stays '+
              'connected until the next drop.'))return;
  fetch('/api/wifi?ssid='+encodeURIComponent(ssid),{method:'DELETE'})
    .then(function(r){return r.json()}).then(function(d){
      say(d.ok?('forgot '+ssid):(d.error||'failed'),!d.ok);load();
    }).catch(function(){say('failed',1)});
}

$('f').onsubmit=function(e){
  e.preventDefault();
  var ssid=$('ssid').value.trim();
  if(!ssid){say('enter a network name',1);return}
  var now=$('now').checked;
  if(now&&!confirm('Switch to "'+ssid+'" now?\n\nThis page will stop responding '+
                   'if the new network is different from the one you are on.'))return;
  var body='ssid='+encodeURIComponent(ssid)+'&pass='+encodeURIComponent($('pass').value);
  if(now)body+='&connect=1';
  fetch('/api/wifi',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body})
    .then(function(r){return r.json()}).then(function(d){
      if(!d.ok){say(d.error||'failed',1);return}
      $('pass').value='';$('ssid').value='';$('now').checked=false;
      say(d.switching?('saved '+d.ssid+' — switching, reconnect on that network'):
                      ('saved '+d.ssid));
      load();
    }).catch(function(){say('failed',1)});
};

load();setInterval(load,5000);
</script></body></html>)HTML";
