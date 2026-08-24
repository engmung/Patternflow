// ═══════════════════════════════════════════════════════════
// PatternFlow - /show sequences page (PROGMEM HTML)
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

static const char SHOW_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - Sequences</title>
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
.note{font-size:12px;color:var(--faint);margin:8px 0 0;line-height:1.45}
#msg{margin-top:10px;font-family:var(--mono);font-size:11px;min-height:16px}
#msg.err{color:var(--led)}#msg.good{color:var(--ok)}
.drop{display:block;border:1px dashed var(--rule);padding:18px 14px;text-align:center;
cursor:pointer;color:var(--muted);font-size:13px}
.drop input{display:none}
.drop:hover{border-color:var(--led)}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}
.go,.stop,.del{font:inherit;font-size:12px;padding:6px 12px;border-radius:2px;cursor:pointer}
.go{border:1px solid var(--led);background:var(--led);color:var(--panel);font-weight:600}
.stop{border:1px solid var(--rule);background:none;color:var(--ink)}
.del{border:1px solid var(--rule);background:none;color:var(--muted)}
.del:hover{border-color:var(--led);color:var(--led)}
.clock{font-family:var(--mono);font-size:28px;letter-spacing:.04em;margin:4px 0}
.meta{font-family:var(--mono);font-size:12px;color:var(--muted)}
ul{list-style:none;margin:0;padding:0}
li{display:flex;gap:10px;align-items:center;padding:10px 2px;
border-bottom:1px solid var(--rule-soft)}
li .nm{flex:1;min-width:0}
li .nm b{display:block;font-size:14px}
li .nm span{font-family:var(--mono);font-size:11px;color:var(--faint)}
li.on .nm b{color:var(--led)}
.check{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted)}
.check input{accent-color:var(--led)}
.field{display:flex;align-items:center;gap:12px;padding:6px 0}
.field label{flex:0 0 108px;font-size:13px;color:var(--muted)}
.field input,.field select{flex:1;min-width:0;font:inherit;font-family:var(--mono);font-size:12px;
padding:7px 9px;background:var(--panel);color:var(--ink);
border:1px solid var(--rule);border-radius:2px}
.field input:focus,.field select:focus{outline:none;border-color:var(--led)}
.save{font:inherit;font-size:12px;padding:6px 12px;border-radius:2px;cursor:pointer;
border:1px solid var(--led);background:var(--led);color:var(--panel);font-weight:600}
#nmsg{margin-top:8px;font-family:var(--mono);font-size:11px;min-height:16px}
#nmsg.err{color:var(--led)}#nmsg.good{color:var(--ok)}
@media(max-width:420px){.field{display:block}.field label{display:block;margin-bottom:4px}.field input,.field select{width:100%}}
footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--rule);
font-family:var(--mono);font-size:11px;color:var(--faint)}
a{color:var(--muted)}
.pfnav{display:flex;flex-wrap:wrap;gap:13px;margin:10px 0 0;
font-family:var(--mono);font-size:11px;letter-spacing:.04em}
.pfnav a{color:var(--faint);text-decoration:none}
.pfnav a:hover{color:var(--led)}
.pfnav a.here{color:var(--ink)}
</style></head><body><div class="wrap">
<header><span class="dot"></span><h1>Sequences</h1><span class="sub" id="st">-</span></header>
<nav class="pfnav"><a href="/">Console</a><a href="/patterns">Patterns</a><a href="/show" class="here">Sequences</a><a href="/audio">Audio</a><a href="/status">Status</a><a href="/wifi">Wi-Fi</a><a href="/mqtt">MQTT</a><a href="/update">Update</a></nav>

<section>
  <h2>Now</h2>
  <div class="clock" id="clock">0:00</div>
  <div class="meta" id="now">idle</div>
  <div class="actions">
    <button class="stop" id="btnStop" type="button">Stop</button>
    <label class="check"><input type="checkbox" id="loop"> Loop</label>
  </div>
</section>

<section>
  <h2>Night &amp; wake</h2>
  <div class="meta" id="n-st">clock not synced</div>
  <form id="night" autocomplete="off">
    <label class="check"><input type="checkbox" id="n-en"> Enable night black and wake sequence</label>
    <div class="field"><label for="n-night">Night starts</label>
      <input id="n-night" type="time" value="23:00" required></div>
    <div class="field"><label for="n-wake">Wake at</label>
      <input id="n-wake" type="time" value="07:00" required></div>
    <div class="field"><label for="n-slug">Wake sequence</label>
      <select id="n-slug"><option value="">— none (clock only) —</option></select></div>
    <label class="check"><input type="checkbox" id="n-rpt" checked> Repeat every 5 minutes until interaction is detected</label>
    <label class="check"><input type="checkbox" id="n-clk" checked> Dim clock on black at night</label>
    <div class="field"><label for="n-dim">Night dim %</label>
      <input id="n-dim" type="number" min="5" max="40" step="1" value="15">
    </div>
    <div class="field"><label for="n-tz">UTC offset (min)</label>
      <input id="n-tz" type="number" min="-720" max="840" step="15" value="0">
    </div>
    <div class="actions">
      <button type="submit" class="save">Save night</button>
    </div>
  </form>
  <div id="nmsg"></div>
  <p class="note">End of night is the wake time. After the sequence ends, Black shows a large clock; night Black can keep a dim clock (default 15%). Time comes from NTP once Wi-Fi is up — set the UTC offset in minutes (Seoul +540, Rome +60/+120 DST); the alarm does not fire until the clock is synced. A knob turn, click, Sequences Stop, or SELECT dismisses the cycle (not during night itself).</p>
</section>

<section>
  <h2>Upload</h2>
  <label class="drop" id="drop">
    <input type="file" id="file" accept=".pfs,application/octet-stream">
    <p>Drop a Director <b>.pfs</b> table here, or click to choose</p>
  </label>
  <p class="note">Director File tab → <b>Save device table</b>. Patterns used in the timeline must already be installed. This page does not pause the panel.</p>
  <div id="msg"></div>
</section>

<section>
  <h2>On device</h2>
  <ul id="list"></ul>
</section>

<footer>Play Now walks the packed cue table. MQTT is not required.</footer>
</div>
<script>
function $(i){return document.getElementById(i)}
function say(t,cls){$('msg').textContent=t;$('msg').className=cls||''}
function fmt(s){
  s=Math.max(0,s|0);
  var m=(s/60)|0,r=s%60;
  return m+':'+(r<10?'0':'')+r;
}
function paintStatus(d){
  $('st').textContent=d.playing?'playing':(d.phase&&d.phase!=='idle'?d.phase:'idle');
  $('clock').textContent=fmt(d.t||0)+' / '+fmt(d.length||0);
  var line=d.playing?(d.title||d.slug||'sequence')+' · '+(d.cues||0)+' cues':(d.loaded?(d.title||d.slug)+' loaded':'idle');
  if(d.missing&&d.missing.length)line+=' · missing '+d.missing.join(', ');
  $('now').textContent=line;
  $('loop').checked=!!d.loop;
  $('btnStop').disabled=!d.playing && d.phase!=='snooze' && d.phase!=='wake';
  paintNight(d);
}
var nightReady=false;
function paintNight(d){
  var st=$('n-st');
  if(!d.timeSynced)st.textContent='waiting for clock (NTP) · check Wi-Fi and the UTC offset below';
  else{
    var bits=[d.localTime||'', d.phase||'idle'];
    if(d.phase==='snooze'&&d.repeat&&d.snoozeMs)bits.push('repeat in '+fmt((d.snoozeMs/1000)|0));
    if(d.phase==='snooze'&&!d.repeat)bits.push('waiting for interaction');
    if(d.schedEnabled&&d.phase==='idle')bits.push('wake '+ (d.wakeAt||''));
    st.textContent=bits.filter(Boolean).join(' · ');
  }
  var editing=document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#night');
  if(nightReady&&editing)return;
  $('n-en').checked=!!d.schedEnabled;
  if(d.nightAt)$('n-night').value=d.nightAt;
  if(d.wakeAt)$('n-wake').value=d.wakeAt;
  $('n-rpt').checked=!!d.repeat;
  $('n-clk').checked=!!d.nightClock;
  if(d.nightDim!=null)$('n-dim').value=d.nightDim;
  if(d.tzMin!=null)$('n-tz').value=d.tzMin;
  var sel=$('n-slug');
  var keep=d.wakeSlug||'';
  sel.innerHTML='';
  var opt0=document.createElement('option');opt0.value='';opt0.textContent='— none (clock only) —';
  sel.appendChild(opt0);
  (d.shows||[]).forEach(function(s){
    var o=document.createElement('option');o.value=s.slug;o.textContent=s.title||s.slug;
    sel.appendChild(o);
  });
  sel.value=keep;
  if(keep&&sel.value!==keep){
    var extra=document.createElement('option');
    extra.value=keep;extra.textContent=keep+' (missing)';
    sel.appendChild(extra);sel.value=keep;
  }
  nightReady=true;
}
function load(){
  fetch('/api/shows',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
    paintStatus(d);
    var box=$('list');box.innerHTML='';
    (d.shows||[]).forEach(function(s){
      var li=document.createElement('li');
      if(d.slug&&s.slug===d.slug&&d.playing)li.className='on';
      var nm=document.createElement('div');nm.className='nm';
      nm.innerHTML='<b></b><span></span>';
      nm.querySelector('b').textContent=s.title||s.slug;
      nm.querySelector('span').textContent=s.slug+' · '+fmt(s.length)+' · '+s.cues+' cues'+(s.loop?' · loop':'');
      var play=document.createElement('button');play.className='go';play.type='button';play.textContent='Play';
      play.onclick=function(){post('play',s.slug)};
      var del=document.createElement('button');del.className='del';del.type='button';del.textContent='delete';
      del.onclick=function(){
        if(!confirm('Delete '+s.slug+'?'))return;
        fetch('/api/shows?slug='+encodeURIComponent(s.slug),{method:'DELETE'})
          .then(function(r){return r.json()}).then(function(x){
            say(x.ok?'deleted '+s.slug:(x.error||'delete failed'),x.ok?'good':'err');
            load();
          });
      };
      li.appendChild(nm);li.appendChild(play);li.appendChild(del);
      box.appendChild(li);
    });
    if(!(d.shows||[]).length){
      var empty=document.createElement('li');
      empty.innerHTML='<div class="nm"><span>No sequences yet — upload a .pfs from Director.</span></div>';
      box.appendChild(empty);
    }
  }).catch(function(){say('cannot reach device or list JSON failed','err')});
}
function post(op,slug){
  var body='op='+encodeURIComponent(op);
  if(slug)body+='&slug='+encodeURIComponent(slug);
  if($('loop').checked)body+='&loop=1';
  fetch('/api/shows/control',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body})
    .then(function(r){return r.json()}).then(function(d){
      if(d.ok===false){say(d.error||'failed','err');return}
      say(op==='play'?'playing':'stopped','good');
      load();
    }).catch(function(){say('no reply','err')});
}
$('btnStop').onclick=function(){post('stop')};
$('loop').onchange=function(){
  fetch('/api/shows/control',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'op=loop&loop='+($('loop').checked?'1':'0')});
};
$('night').onsubmit=function(e){
  e.preventDefault();
  var body='enabled='+($('n-en').checked?'1':'0');
  body+='&night='+encodeURIComponent($('n-night').value);
  body+='&wake='+encodeURIComponent($('n-wake').value);
  body+='&slug='+encodeURIComponent($('n-slug').value);
  body+='&repeat='+($('n-rpt').checked?'1':'0');
  body+='&nightClock='+($('n-clk').checked?'1':'0');
  body+='&nightDim='+encodeURIComponent($('n-dim').value||'15');
  body+='&tz='+encodeURIComponent($('n-tz').value||'0');
  fetch('/api/shows/schedule',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body})
    .then(function(r){return r.json()}).then(function(d){
      var n=$('nmsg');
      if(d.ok===false){n.textContent=d.error||'save failed';n.className='err';return}
      n.textContent='night saved';n.className='good';
      nightReady=false;
      load();
    }).catch(function(){$('nmsg').textContent='no reply';$('nmsg').className='err'});
};
function upload(file){
  if(!file)return;
  say('uploading '+file.name+'…');
  var xhr=new XMLHttpRequest();
  xhr.open('PUT','/api/shows');
  xhr.setRequestHeader('X-PF-Name',file.name);
  xhr.onload=function(){
    var d=null;try{d=JSON.parse(xhr.responseText)}catch(e){}
    if(d&&d.ok){say('stored '+d.slug,'good');load()}
    else say((d&&d.error)||'upload failed','err');
  };
  xhr.onerror=function(){say('no reply from device','err')};
  xhr.send(file);
}
$('file').onchange=function(){if(this.files[0])upload(this.files[0]);this.value=''};
var drop=$('drop');
drop.ondragover=function(e){e.preventDefault()};
drop.ondrop=function(e){e.preventDefault();if(e.dataTransfer.files[0])upload(e.dataTransfer.files[0])};
load();
setInterval(load,1000);
</script></body></html>)HTML";
