// ═══════════════════════════════════════════════════════════
// PatternFlow - Browser self-update page (PROGMEM HTML bundle)
//
// Served at http://patternflow.local/update by core_web_update.h.
// Drop a firmware .bin (the app image the web build service emits, or an
// arduino-cli export) and the device flashes itself via Update.h.
//
// The page polls /update/status so the ARMED/LOCKED chip mirrors the
// device: the POST endpoint only accepts firmware while the UPDATE screen
// is open on the device (hold K2 → NETWORK, turn K4). Upload progress is
// the XHR's own send progress — the device flashes as it receives, so the
// bar tracks the actual write within a buffer's worth.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include <pgmspace.h>

const char WEB_UPDATE_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow Update</title>
<style>
  :root{--bg:#0a0a0a;--card:#0d0d0d;--fg:#e8e8e8;--mut:#666;--ln:#1f1f1f;--accent:#5fdb89;--bad:#ff5d5d;--warn:#e8c35f}
  *{box-sizing:border-box}
  body{margin:0 auto;background:var(--bg);color:var(--fg);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:20px;max-width:560px}
  h1{font-size:11px;letter-spacing:.4em;opacity:.5;font-weight:normal;margin:0 0 4px}
  .sub{font-size:11px;color:var(--mut);margin-bottom:20px}
  a{color:var(--mut)}
  #chip{position:fixed;top:14px;right:14px;font-size:10px;padding:7px 11px;border:1px solid var(--ln);background:var(--card);letter-spacing:.15em;z-index:10}
  .ok{color:var(--accent)} .bad{color:var(--bad)} .warn{color:var(--warn)}
  .section{margin:14px 0;padding:14px;border:1px solid var(--ln);background:var(--card)}
  .section h2{font-size:10px;letter-spacing:.25em;color:var(--mut);font-weight:normal;text-transform:uppercase;margin:0 0 12px}
  ol{margin:0;padding-left:18px;color:var(--mut);font-size:12px}
  ol li{margin:4px 0}
  ol b{color:var(--fg);font-weight:normal}
  code{color:var(--fg)}
  #drop{margin:14px 0;padding:38px 14px;border:1px dashed #333;background:var(--card);text-align:center;color:var(--mut);cursor:pointer;transition:border-color .15s}
  #drop.hover{border-color:var(--accent);color:var(--fg)}
  #drop.disabled{opacity:.45}
  #bar{height:6px;background:#1a1a1a;margin:14px 0 6px;display:none}
  #fill{height:100%;width:0%;background:var(--accent)}
  #msg{font-size:12px;min-height:18px;color:var(--mut)}
  #msg.ok{color:var(--accent)} #msg.bad{color:var(--bad)}
</style></head><body>
<h1>PATTERNFLOW &middot; UPDATE</h1>
<div class="sub">Drop a firmware .bin &mdash; the device flashes itself over the LAN. <a href="/">audio-react &rarr;</a></div>
<div id="chip">&hellip;</div>

<div class="section"><h2>How</h2>
<ol>
<li>Build &amp; download a firmware <b>.bin</b> (patternflow.work &rarr; Build, or an <code>arduino-cli</code> export).</li>
<li>On the device: hold <b>K2</b> &rarr; NETWORK, then turn <b>K4</b> &rarr; <b>UPDATE</b>. The chip above turns ARMED.</li>
<li>Drop the file below. Keep the device powered; it reboots itself when done.</li>
</ol></div>

<div id="drop">drop firmware .bin here<br>or click to choose</div>
<input id="file" type="file" accept=".bin" style="display:none">
<div id="bar"><div id="fill"></div></div>
<div id="msg"></div>

<script>
var drop=document.getElementById('drop'),fileIn=document.getElementById('file'),
    chip=document.getElementById('chip'),bar=document.getElementById('bar'),
    fill=document.getElementById('fill'),msg=document.getElementById('msg');
var armed=false,busy=false,uploading=false;
var ARM_HINT='Device is locked. On the device: hold K2 for NETWORK, then turn K4 for UPDATE.';

function setChip(t,c){chip.textContent=t;chip.className=c||''}
function setMsg(t,c){msg.textContent=t;msg.className=c||''}

function poll(){
  if(uploading)return;
  fetch('/update/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){
    armed=s.armed;busy=s.busy;
    if(busy)setChip('BUSY','warn');
    else if(armed)setChip('ARMED','ok');
    else setChip('LOCKED','bad');
    drop.classList.toggle('disabled',!armed||busy);
  }).catch(function(){setChip('OFFLINE','bad')});
}
setInterval(poll,2000);poll();

drop.addEventListener('click',function(){if(!uploading)fileIn.click()});
fileIn.addEventListener('change',function(){if(fileIn.files.length)upload(fileIn.files[0])});
['dragover','dragenter'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.add('hover')})});
['dragleave','drop'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.remove('hover')})});
drop.addEventListener('drop',function(e){if(!uploading&&e.dataTransfer.files.length)upload(e.dataTransfer.files[0])});

function upload(f){
  if(uploading)return;
  if(!/\.bin$/i.test(f.name)){setMsg('That is not a .bin file.','bad');return}
  if(f.size>3*1024*1024){setMsg('Too big for the 3 MB app partition. This looks like a merged full-flash image; upload the app .bin instead.','bad');return}
  if(f.size<200*1024){setMsg('Suspiciously small for Patternflow firmware. Wrong file?','bad');return}
  if(!armed){setMsg(ARM_HINT,'bad');return}
  uploading=true;
  setChip('FLASHING','warn');
  bar.style.display='block';fill.style.width='0%';
  setMsg('Uploading '+f.name+' ('+(f.size/1048576).toFixed(2)+' MB). Keep this tab open and the device powered.');
  var xhr=new XMLHttpRequest();
  xhr.open('POST','/update?size='+f.size);
  xhr.upload.onprogress=function(e){if(e.lengthComputable)fill.style.width=Math.round(e.loaded*100/e.total)+'%'};
  xhr.onload=function(){
    uploading=false;
    if(xhr.status===200){
      fill.style.width='100%';
      setMsg('Flashed. Rebooting - the device should be back in about 10 seconds.','ok');
      waitForReboot();
    }else{
      var t='upload failed ('+xhr.status+')';
      try{t=JSON.parse(xhr.responseText).error||t}catch(e){}
      setMsg('Failed: '+t,'bad');
      bar.style.display='none';
    }
  };
  xhr.onerror=function(){
    uploading=false;
    setMsg('Connection lost during upload. The device still runs its old firmware unless it just rebooted - if in doubt, try again.','bad');
    bar.style.display='none';
  };
  var fd=new FormData();fd.append('firmware',f,f.name);
  xhr.send(fd);
}

function waitForReboot(){
  var tries=0;
  var t=setInterval(function(){
    if(++tries>30){clearInterval(t);return}
    fetch('/update/status',{cache:'no-store'}).then(function(r){
      if(r.ok){clearInterval(t);setChip('BACK','ok');setMsg('Device is back online on the new firmware.','ok')}
    }).catch(function(){});
  },2000);
}
</script>
</body></html>
)HTML";
