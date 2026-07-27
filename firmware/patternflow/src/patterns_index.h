// ═══════════════════════════════════════════════════════════
// PatternFlow - /patterns management page (served by core_patterns_http.h)
//
// Same cream/ink/LED tokens as the update and home consoles. Kept to one
// PROGMEM string with no external assets: the device serves this with no
// internet in the loop.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

static const char PATTERNS_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - Patterns</title>
<style>
:root{--cream:#F4EFE6;--ink:#141414;--muted:#6B655A;--faint:#A69F90;
--rule:#D9D1C0;--rule-soft:#E5DDC9;--led:#E8552E;
--sans:'Inter',ui-sans-serif,system-ui,sans-serif;
--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);font-family:var(--sans);
line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:680px;margin:0 auto;padding:32px 20px 64px}
header{display:flex;align-items:center;gap:8px;padding-bottom:12px;
border-bottom:1px solid var(--rule)}
.dot{width:7px;height:7px;background:var(--led);border-radius:1px}
h1{font-size:15px;font-weight:600;letter-spacing:.01em;margin:0;flex:1}
.sub{font-family:var(--mono);font-size:11px;color:var(--faint)}
section{margin-top:28px}
h2{font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;
color:var(--muted);margin:0 0 10px}
.drop{border:1px dashed var(--rule);border-radius:3px;padding:26px 18px;text-align:center;
background:rgba(255,255,255,.4);transition:border-color .15s,background .15s;cursor:pointer}
.drop.over{border-color:var(--led);background:rgba(232,85,46,.05)}
.drop p{margin:0;font-size:13px;color:var(--muted)}
.drop b{color:var(--ink);font-weight:600}
.hint{font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:6px}
input[type=file]{display:none}
ul{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule-soft)}
li{display:flex;align-items:center;gap:10px;padding:9px 2px;
border-bottom:1px solid var(--rule-soft);font-size:13px}
li .n{font-family:var(--mono);font-size:11px;color:var(--faint);min-width:24px}
li .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tag{font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;
padding:1px 6px;border:1px solid var(--rule);border-radius:2px;color:var(--muted)}
.tag.mod{border-color:var(--led);color:var(--led)}
li.on{background:rgba(232,85,46,.06)}
button.del{font:inherit;font-size:11px;color:var(--muted);background:none;
border:1px solid var(--rule);border-radius:2px;padding:2px 8px;cursor:pointer}
button.del:hover{border-color:var(--led);color:var(--led)}
#msg{margin-top:14px;font-family:var(--mono);font-size:11px;min-height:16px}
#msg.err{color:var(--led)}
.bar{height:2px;background:var(--rule-soft);margin-top:12px;display:none}
.bar i{display:block;height:100%;width:0;background:var(--led);transition:width .2s}
footer{margin-top:36px;padding-top:12px;border-top:1px solid var(--rule);
font-family:var(--mono);font-size:11px;color:var(--faint)}
a{color:var(--muted)}
</style></head><body><div class="wrap">
<header><span class="dot"></span><h1>Patterns</h1><span class="sub" id="fs">-</span></header>

<section>
  <h2>Upload</h2>
  <label class="drop" id="drop">
    <input type="file" id="file" accept=".pfm,.json" multiple>
    <p>Drop a <b>.pfm</b> here, or click to choose</p>
    <p class="hint">module + optional .json sidecar</p>
  </label>
  <div class="bar" id="bar"><i></i></div>
  <div id="msg"></div>
</section>

<section>
  <h2>Installed</h2>
  <ul id="list"></ul>
</section>

<footer>Presets are built into the firmware and cannot be removed here.
&nbsp;<a href="/">Home</a></footer>
</div>
<script>
var msg=document.getElementById('msg'),bar=document.getElementById('bar'),
    list=document.getElementById('list'),drop=document.getElementById('drop'),
    file=document.getElementById('file'),fs=document.getElementById('fs');

function say(t,err){msg.textContent=t;msg.className=err?'err':''}

function load(){
  fetch('/api/patterns').then(function(r){return r.json()}).then(function(d){
    fs.textContent=d.mounted?(Math.round(d.free/1024)+' KB free'):'FS not mounted';
    list.innerHTML='';
    d.patterns.forEach(function(p){
      var li=document.createElement('li');
      if(p.index===d.active)li.className='on';
      var n=document.createElement('span');n.className='n';n.textContent=p.index+1;
      var nm=document.createElement('span');nm.className='nm';nm.textContent=p.name;
      var tg=document.createElement('span');
      tg.className='tag'+(p.module?' mod':'');
      tg.textContent=p.module?'module':'preset';
      li.appendChild(n);li.appendChild(nm);li.appendChild(tg);
      if(p.module){
        var b=document.createElement('button');b.className='del';b.textContent='delete';
        b.onclick=function(){del(p.module,p.name)};
        li.appendChild(b);
      }
      list.appendChild(li);
    });
  }).catch(function(){say('cannot reach device',1)});
}

function del(slug,name){
  if(!confirm('Delete "'+name+'"?'))return;
  fetch('/api/patterns?slug='+encodeURIComponent(slug),{method:'DELETE'})
    .then(function(r){return r.json()}).then(function(d){
      say(d.ok?('deleted '+slug):(d.error||'delete failed'),!d.ok);load();
    }).catch(function(){say('delete failed',1)});
}

// One at a time: the device writes straight to flash and a second concurrent
// multipart POST would interleave with the first upload's chunk state.
function send(files,i,retried){
  if(i>=files.length){bar.style.display='none';load();return}
  var fd=new FormData();
  // last=0 defers the device's rescan-and-reload to the batch's final file —
  // reloading a module between every file starves the uploads of heap. Sent as
  // a form field, NOT a URL query: the ESP32 WebServer drops multipart POSTs
  // that carry a query string (empty reply, found the hard way).
  fd.append('last',i===files.length-1?'1':'0');
  fd.append('module',files[i]);
  var xhr=new XMLHttpRequest();
  xhr.open('POST','/api/patterns');
  bar.style.display='block';
  xhr.upload.onprogress=function(e){
    if(e.lengthComputable)bar.firstChild.style.width=(e.loaded/e.total*100)+'%';
  };
  // The device occasionally stores the file but drops the connection before
  // the reply gets out (low-heap first request after boot, typically). One
  // retry after a beat rides that out — re-sending the same bytes just
  // overwrites the same file. A real rejection (a JSON error) never retries.
  var failSoft=function(){
    if(!retried){say('retrying '+files[i].name+'…');
      setTimeout(function(){send(files,i,1)},500);return}
    say('upload failed at '+files[i].name,1);bar.style.display='none';load();
  };
  xhr.onload=function(){
    var d=null;try{d=JSON.parse(xhr.responseText)}catch(e){}
    if(d&&d.ok){say('uploaded '+d.slug+' ('+d.bytes+' B)');send(files,i+1)}
    else if(d&&d.error){say(d.error,1);bar.style.display='none';load()}
    else failSoft();
  };
  xhr.onerror=failSoft;
  xhr.send(fd);
}

file.onchange=function(){if(file.files.length)send(file.files,0)};
['dragenter','dragover'].forEach(function(e){
  drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.add('over')})});
['dragleave','drop'].forEach(function(e){
  drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.remove('over')})});
drop.addEventListener('drop',function(ev){
  if(ev.dataTransfer.files.length)send(ev.dataTransfer.files,0)});

// One-click install from the community site: /patterns?src=<modules-url>.
// This page runs in the visitor's browser, which can reach both the (https)
// community and this (http) device — so IT does the ferrying: fetch the file
// list, then each file, hand them to the same send() the drop zone uses.
// The device never talks to the internet and the visitor downloads nothing.
function installFromUrl(src){
  say('fetching module list…');
  var sep=src.indexOf('?')>=0?'&':'?';
  fetch(src+sep+'list=1').then(function(r){
    if(!r.ok)throw 0;return r.json();
  }).then(function(d){
    var names=(d.files||[]).filter(function(n){
      return /\.(pfm|json)$/.test(n)});
    if(!names.length)throw 0;
    var files=[];
    // Sequential on purpose: one at a time is all the device can take anyway.
    return names.reduce(function(chain,name){
      return chain.then(function(){
        say('fetching '+name+'…');
        return fetch(src+sep+'file='+encodeURIComponent(name))
          .then(function(r){if(!r.ok)throw 0;return r.blob()})
          .then(function(b){files.push(new File([b],name))});
      });
    },Promise.resolve()).then(function(){
      say('installing '+files.length+' file(s)…');
      send(files,0);
    });
  }).catch(function(){
    say('could not fetch modules from the link — is the build still available?',1);
  });
}
var srcParam=new URLSearchParams(location.search).get('src');
if(srcParam&&/^https?:\/\//.test(srcParam)){
  // Strip the query so a reload doesn't reinstall.
  history.replaceState(null,'',location.pathname);
  installFromUrl(srcParam);
}

load();
</script></body></html>)HTML";
