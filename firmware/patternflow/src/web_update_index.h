// ═══════════════════════════════════════════════════════════
// PatternFlow - Browser self-update page (PROGMEM HTML bundle)
//
// Served at http://patternflow.local/update by core_web_update.h.
// Drop a firmware .bin (the app image the web build service emits, or an
// arduino-cli export) and the device flashes itself via Update.h.
//
// The page polls /update/status: stock builds are always ready
// (PF_WEBUPDATE_ALWAYS_ARMED 1); builds that opted into physical arming
// show a LOCKED pill plus the how-to-arm hint until the UPDATE screen is
// opened on the device. Upload progress is the XHR's own send progress —
// the device flashes as it receives, so the bar tracks the actual write
// within a buffer's worth.
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
  :root{--bg:#0a0a0a;--card:#0e0e0e;--fg:#e8e8e8;--mut:#666;--ln:#212121;--accent:#5fdb89;--blue:#6ab7ff;--bad:#ff5d5d;--warn:#e8c35f}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:var(--bg);color:var(--fg);
       font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       padding:36px 20px;
       background-image:radial-gradient(ellipse 90% 55% at 50% -12%,#151515 0%,transparent 65%)}
  .col{width:100%;max-width:400px}
  .top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px}
  .back{font-size:11px;color:var(--mut);text-decoration:none;letter-spacing:.1em}
  .back:hover{color:var(--fg)}
  #pill{font-size:9px;padding:4px 10px;border:1px solid var(--ln);letter-spacing:.2em;background:var(--card)}
  h1{font-size:13px;letter-spacing:.35em;font-weight:normal;margin:18px 0 6px;color:var(--blue)}
  .sub{font-size:11px;color:var(--mut);line-height:1.7;margin-bottom:22px}
  .ok{color:var(--accent);border-color:#1e3a2a!important}
  .bad{color:var(--bad);border-color:#3a1e1e!important}
  .warn{color:var(--warn);border-color:#3a331e!important}
  .steps{margin:0 0 16px;padding:16px 18px;border:1px solid var(--ln);background:var(--card)}
  .steps div{display:flex;gap:12px;font-size:11px;color:var(--mut);line-height:1.7;margin:4px 0}
  .steps .n{color:#3a3a3a;letter-spacing:.1em}
  .steps b{color:var(--fg);font-weight:normal}
  #armHint{display:none;margin:0 0 16px;padding:13px 18px;border:1px solid #3a331e;background:#12100a;font-size:11px;color:var(--warn);line-height:1.7}
  #armHint b{font-weight:normal;color:var(--fg)}
  #drop{min-height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
        border:1px dashed #333;background:var(--card);cursor:pointer;text-align:center;padding:20px;
        transition:border-color .16s,background .16s}
  #drop .big{font-size:12px;letter-spacing:.2em;color:var(--fg)}
  #drop .small{font-size:10px;color:var(--mut);letter-spacing:.1em}
  #drop.hover{border-color:var(--blue);background:#0f1216}
  #drop.disabled{opacity:.45}
  #bar{height:5px;background:#1a1a1a;margin:16px 0 8px;display:none}
  #fill{height:100%;width:0%;background:var(--blue);transition:width .1s linear}
  #msg{font-size:11px;min-height:18px;color:var(--mut);line-height:1.7}
  #msg.ok{color:var(--accent)} #msg.bad{color:var(--bad)}
</style></head><body>
<div class="col">
  <div class="top">
    <a class="back" href="/">&larr; console</a>
    <span id="pill">&hellip;</span>
  </div>
  <h1>FIRMWARE UPDATE</h1>
  <div class="sub">Drop a firmware .bin &mdash; the device flashes itself over the LAN and reboots on the new build.</div>

  <div class="steps">
    <div><span class="n">01</span><span>Build &amp; download a <b>.bin</b> &mdash; patternflow.work &rarr; Build, or an <b>arduino-cli</b> export.</span></div>
    <div><span class="n">02</span><span>Drop it below. Keep the device powered; it verifies, flashes, and reboots itself.</span></div>
  </div>

  <div id="armHint">This build requires arming first. On the device: hold <b>K2</b> &rarr; NETWORK, then turn <b>K4</b> &rarr; <b>UPDATE</b>.</div>

  <div id="drop">
    <span class="big">DROP .BIN HERE</span>
    <span class="small">or click to choose a file</span>
  </div>
  <input id="file" type="file" accept=".bin" style="display:none">
  <div id="bar"><div id="fill"></div></div>
  <div id="msg"></div>
</div>

<script>
var drop=document.getElementById('drop'),fileIn=document.getElementById('file'),
    pill=document.getElementById('pill'),bar=document.getElementById('bar'),
    fill=document.getElementById('fill'),msg=document.getElementById('msg'),
    armHint=document.getElementById('armHint');
var armed=false,busy=false,uploading=false;

function setPill(t,c){pill.textContent=t;pill.className=c||''}
function setMsg(t,c){msg.textContent=t;msg.className=c||''}

function poll(){
  if(uploading)return;
  fetch('/update/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){
    armed=s.armed;busy=s.busy;
    if(busy)setPill('BUSY','warn');
    else if(armed)setPill('READY','ok');
    else setPill('LOCKED','bad');
    armHint.style.display=(!armed&&!busy)?'block':'none';
    drop.classList.toggle('disabled',!armed||busy);
  }).catch(function(){setPill('OFFLINE','bad')});
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
  if(!armed){setMsg('Device is locked - see the arming note above.','bad');return}
  uploading=true;
  setPill('FLASHING','warn');
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
      if(r.ok){clearInterval(t);setPill('BACK','ok');setMsg('Device is back online on the new firmware.','ok')}
    }).catch(function(){});
  },2000);
}
</script>
</body></html>
)HTML";
