// ═══════════════════════════════════════════════════════════
// PatternFlow - Browser self-update page (PROGMEM HTML bundle)
//
// Served at http://patternflow.local/update by core_web_update.h.
// Drop a firmware .bin (the app image the web build service emits, or an
// arduino-cli export) and the device flashes itself via Update.h.
//
// The page polls /update/status: stock builds are always ready
// (PF_WEBUPDATE_ALWAYS_ARMED 1); builds that opted into physical arming
// show a LOCKED tag plus the how-to-arm note until the UPDATE screen is
// opened on the device. Upload progress is the XHR's own send progress —
// the device flashes as it receives, so the bar tracks the actual write
// within a buffer's worth.
//
// Styled to the patternflow.work design system (web/docs/
// patternflow-styleguide.html): cream + ink + LED accent, thin rules,
// mono kickers/tags, dashed placeholder-style drop zone.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include <pgmspace.h>

const char WEB_UPDATE_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow — Firmware update</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--cream:#F4EFE6;--cream2:#EDE7DB;--ink:#141414;--muted:#6B655A;--faint:#A69F90;--rule:#D9D1C0;--rule-soft:#E5DDC9;--led:#E8552E;
        --sans:'Inter',ui-sans-serif,system-ui,sans-serif;
        --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:var(--cream);color:var(--ink);
       font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;
       display:flex;align-items:center;justify-content:center;padding:72px 24px}
  .version-tag{position:fixed;top:24px;left:32px;z-index:40;font-family:var(--mono);font-size:10px;
       letter-spacing:.14em;text-transform:uppercase;color:var(--muted);pointer-events:none}
  .version-tag .dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--led);
       margin-right:8px;vertical-align:1px;box-shadow:0 0 6px var(--led)}
  .panel{width:100%;max-width:560px;background:#ffffff;padding:48px 48px 44px}
  .top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:36px}
  .back{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;
       color:var(--muted);text-decoration:none}
  .back:hover{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
  #pill{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
       padding:5px 10px 4px;border:1px solid var(--faint);color:var(--muted)}
  #pill.ok{border-color:var(--ink);color:var(--ink)}
  #pill.warn{border-color:var(--led);color:var(--led)}
  #pill.bad{border-color:var(--faint);color:var(--faint)}
  h2{font-size:34px;font-weight:500;letter-spacing:-.025em;line-height:1.05;margin-bottom:12px}
  .sub{max-width:36ch;color:var(--muted);font-size:15px;line-height:1.5;margin-bottom:32px}
  .pf-kicker{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
       color:var(--muted);margin-bottom:2px}
  .step{display:grid;grid-template-columns:40px 1fr;gap:20px;padding:14px 0;border-bottom:1px solid var(--rule);align-items:baseline}
  .step:first-of-type{border-top:1px solid var(--rule)}
  .step .n{font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--muted)}
  .step p{font-size:14px;line-height:1.5;color:var(--muted)}
  .step b{font-weight:500;color:var(--ink)}
  #armHint{display:none;margin:20px 0 0;border:1px dashed var(--rule);background:var(--cream);
       padding:14px 16px;font-family:var(--mono);font-size:11.5px;line-height:1.6;color:var(--muted)}
  #armHint b{font-weight:500;color:var(--ink)}
  #drop{margin-top:28px;min-height:176px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
       border:1px dashed var(--rule);background:var(--cream);cursor:pointer;text-align:center;padding:24px;
       transition:border-color .16s ease,background .16s ease}
  #drop .big{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink)}
  #drop .small{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
  #drop.hover{border-color:var(--ink);background:var(--cream2)}
  #drop.disabled{opacity:.45}
  #bar{height:6px;background:var(--rule-soft);margin:20px 0 10px;display:none}
  #fill{height:100%;width:0%;background:var(--led);transition:width .1s linear}
  #msg{font-size:13px;min-height:20px;color:var(--muted);line-height:1.55;margin-top:12px}
  #msg.ok{color:var(--ink)} #msg.bad{color:var(--led)}
  @media(max-width:560px){body{padding:56px 16px}.panel{padding:36px 24px 32px}h2{font-size:28px}}
</style></head><body>

<div class="version-tag"><span class="dot"></span>device &middot; update</div>

<main class="panel">
  <div class="top">
    <a class="back" href="/">&larr; Console</a>
    <span id="pill">&hellip;</span>
  </div>

  <h2>Firmware update.</h2>
  <p class="sub">Drop a firmware .bin &mdash; the device flashes itself over the LAN and reboots on the new build.</p>

  <span class="pf-kicker">Two steps</span>
  <div class="step"><span class="n">01</span><p>Build &amp; download a <b>.bin</b> &mdash; patternflow.work &rarr; Build, or an <b>arduino-cli</b> export.</p></div>
  <div class="step"><span class="n">02</span><p>Drop it below. Keep the device powered; it verifies, flashes, and reboots itself.</p></div>

  <div id="armHint">This build requires arming first. On the device: hold <b>K2</b> &rarr; NETWORK, then turn <b>K4</b> &rarr; <b>UPDATE</b>.</div>

  <div id="drop">
    <span class="big">Drop .bin here</span>
    <span class="small">or click to choose a file</span>
  </div>
  <!-- No accept attribute: Android maps unknown extensions like .bin to a
       media-only picker (camera/gallery), hiding the file manager. The JS
       validates extension and size instead. -->
  <input id="file" type="file" style="display:none">
  <div id="bar"><div id="fill"></div></div>
  <div id="msg"></div>
</main>

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
