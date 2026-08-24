// ═══════════════════════════════════════════════════════════
// PatternFlow - /show sequences page (PROGMEM HTML)
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

static const char SHOW_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en">
<head><meta charset="utf-8">
<script src="/pf-console.js"></script>
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
.drop:hover,.drop.over{border-color:var(--led)}
.drop p{margin:0}
.drop .hint{margin-top:6px;font-family:var(--mono);font-size:11px;color:var(--faint)}
.queue{border-top:none;margin-top:12px;display:none}
.queue li{display:block;padding:6px 2px;border-bottom:1px dashed var(--rule-soft);
font-family:var(--mono);font-size:11.5px;list-style:none}
.qrow{display:flex;align-items:center;gap:10px}
.qn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}
.qs{white-space:nowrap}
.qs.wait{color:var(--faint)}
.qs.up{color:var(--ink)}
.qs.retry{color:var(--warn)}
.qs.ok{color:var(--ok)}
.qs.fail{color:var(--led)}
.qbar{height:2px;background:var(--rule-soft);margin-top:5px}
.qbar i{display:block;height:100%;width:0;background:var(--led)}
.qerr{margin-top:3px;color:var(--led);font-size:10.5px;white-space:normal}
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
li input.pick{flex:none;width:16px;height:16px;accent-color:var(--led);margin:0}
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
font-family:var(--mono);font-size:11px;letter-spacing:.04em}
html[data-theme=light]{--cream:#F4EFE6;--cream2:#FFFCFA;--bg:#F4EFE6;--panel:#FFFCFA;--ink:#1A1814;--muted:#6B6558;--faint:#9A9486;--ghost:#E0D9CC;--rule:#D9D1C2;--rule-soft:#E8E2D6;--led:#FF5C2E;--ok:#2F8A55;--warn:#B88120;--card:#FFFCFA;--fg:#1A1814}
</style></head><body><div class="wrap">
<header><span class="dot"></span><h1>Sequences</h1><span class="sub" id="st">-</span></header>

<section>
  <h2>Now</h2>
  <div class="clock" id="clock">0:00</div>
  <div class="meta" id="now">idle</div>
  <div class="actions">
    <button class="go" id="btnPlaySel" type="button">Start</button>
    <button class="stop" id="btnStop" type="button">Stop</button>
    <label class="check"><input type="checkbox" id="loop" checked> Loop playlist</label>
  </div>
  <p class="note"><b>Start</b> saves the ticked list on the panel and enters <em>Sequence</em> mode
    (local K4 SELECT → turn K3 to switch Normal / Sequence). <b>Stop</b> returns the panel to
    <em>Normal</em>. Loop repeats the list, not each file. Missing patterns or .pfs entries are skipped.</p>
</section>

<section>
  <h2>Variance</h2>
  <label class="check"><input type="checkbox" id="var-en"> Randomize one cue value each playthrough</label>
  <div class="field"><label for="var-cue">Change</label>
    <select id="var-cue">
      <option value="0">1 · pattern / first</option>
      <option value="1">2 · params @ 0s</option>
      <option value="2" selected>3 · params @ 8s</option>
      <option value="3">4 · params @ 16s</option>
      <option value="4">5 · params @ 24s</option>
    </select></div>
  <div class="field"><label for="var-param">Value</label>
    <select id="var-param">
      <option value="0">Param 1</option>
      <option value="1">Param 2</option>
      <option value="2">Param 3</option>
      <option value="3">Param 4</option>
    </select></div>
  <div class="meta" id="var-st">off</div>
  <p class="note">Demo tables have five timed changes. When enabled, that param is rolled 0–1000
    at the start of every .pfs playthrough (including playlist advances). Setting is stored on the panel.</p>
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
    <div class="actions">
      <button type="submit" class="save">Save night</button>
    </div>
  </form>
  <div id="nmsg"></div>
  <p class="note">End of night is the wake time. After the sequence ends, Black shows a large clock (Weather size). The performance hides that clock unless <a href="/weather">Weather</a> has “show clock on all patterns”. Night Black can keep a dim clock (default 15%). Timezone and NTP live on <a href="/weather">/weather</a> — the alarm does not fire until the clock is synced. A knob turn, click, Sequences Stop, or SELECT dismisses the cycle (not during night itself).</p>
</section>

<section>
  <h2>Upload</h2>
  <label class="drop" id="drop">
    <input type="file" id="file" accept=".pfs,.zip,application/zip,application/octet-stream" multiple>
    <p>Drop <b>.pfs</b> tables or a <b>.zip</b> of them here, or click to choose</p>
    <p class="hint">many at once · zip unpacks in the browser</p>
  </label>
  <ul class="queue" id="q"></ul>
  <p class="note">Director File tab → <b>Save device table</b>, or the all_patterns demos folder.
    Patterns used in a timeline must already be installed. This page does not pause the panel.</p>
  <div id="msg"></div>
  <div class="actions" style="margin-top:8px">
    <button class="stop" id="retry" type="button" style="display:none">Retry failed</button>
  </div>
</section>

<section>
  <h2>On device</h2>
  <div class="actions" style="margin-bottom:8px">
    <button class="stop" id="btnAll" type="button">Select all</button>
    <button class="stop" id="btnNone" type="button">Select none</button>
  </div>
  <ul id="list"></ul>
</section>

<footer>Start stores the list and enters Sequence mode. Hold K4 on the panel, turn K3 for Normal / Sequence.</footer>
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
  var mode=d.sequenceMode?'sequence':'normal';
  $('st').textContent=d.playing?(mode+' · playing'):(d.phase&&d.phase!=='idle'?d.phase:mode);
  $('clock').textContent=fmt(d.t||0)+' / '+fmt(d.length||0);
  var line='idle · '+mode;
  if(d.playlist&&d.playlistCount){
    line='playlist '+(d.playlistIndex+1)+'/'+d.playlistCount+' · '+(d.title||d.slug||'');
    if(d.playlistLoop)line+=' · loop list';
  }else if(d.playing){
    line=(d.title||d.slug||'sequence')+' · '+(d.cues||0)+' cues';
  }else if(d.loaded){
    line=(d.title||d.slug)+' loaded';
  }
  if(d.missing&&d.missing.length)line+=' · missing '+d.missing.join(', ');
  $('now').textContent=line;
  if(d.sequenceMode||d.playlist) $('loop').checked=!!(d.storedLoop!=null?d.storedLoop:d.playlistLoop);
  else if(!d.playlist) $('loop').checked=!!d.loop;
  $('btnStop').disabled=!d.playing && !d.playlist && !d.sequenceMode && d.phase!=='snooze' && d.phase!=='wake';
  paintVariance(d);
  paintNight(d);
  if(!selectedReady && d.storedSlugs){
    selected={};
    (d.storedSlugs||[]).forEach(function(s){selected[s]=true});
    selectedReady=true;
    listSig='';
  }
}
var nightReady=false;
var selected={};
var selectedReady=false;
function selectedList(){
  return Object.keys(selected).filter(function(k){return selected[k]});
}
function paintVariance(d){
  var editing=document.activeElement&&document.activeElement.closest&&
    (document.activeElement.id==='var-en'||document.activeElement.id==='var-cue'||document.activeElement.id==='var-param');
  if(!editing){
    $('var-en').checked=!!d.variance;
    if(d.varianceCue!=null)$('var-cue').value=String(d.varianceCue);
    if(d.varianceParam!=null)$('var-param').value=String(d.varianceParam);
  }
  var st='off';
  if(d.variance){
    st='change '+(1+(d.varianceCue|0))+' · P'+(1+(d.varianceParam|0));
    if(d.varianceValue!=null)st+=' · last roll '+d.varianceValue;
  }
  $('var-st').textContent=st;
}
function saveVariance(){
  var body='op=variance&en='+($('var-en').checked?'1':'0')
    +'&cue='+encodeURIComponent($('var-cue').value)
    +'&param='+encodeURIComponent($('var-param').value);
  fetch('/api/shows/control',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body})
    .then(function(r){return r.json()}).then(function(d){
      if(d.ok===false){say(d.error||'variance failed','err');return}
      say($('var-en').checked?'variance on':'variance off','good');
      paintVariance(d);
    }).catch(function(){say('no reply','err')});
}
function paintNight(d){
  var st=$('n-st');
  if(!d.timeSynced)st.textContent='waiting for clock (NTP) · set timezone on /weather';
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
var listSig='';
var catalogShows=[];
function applyListHighlight(d){
  Array.prototype.forEach.call(document.querySelectorAll('#list li'),function(li){
    var slugSpan=li.querySelector('span');
    var slug=slugSpan?String(slugSpan.textContent||'').split(' · ')[0]:'';
    li.className=(d.playing&&d.slug&&slug===d.slug)?'on':'';
  });
}
function rebuildList(d){
  var box=$('list');box.innerHTML='';
  (d.shows||[]).forEach(function(s){
    var li=document.createElement('li');
    if(d.slug&&s.slug===d.slug&&d.playing)li.className='on';
    var cb=document.createElement('input');
    cb.type='checkbox';cb.className='pick';cb.dataset.slug=s.slug;
    cb.checked=!!selected[s.slug];
    cb.onchange=function(){selected[s.slug]=cb.checked};
    var nm=document.createElement('div');nm.className='nm';
    nm.innerHTML='<b></b><span></span>';
    nm.querySelector('b').textContent=s.title||s.slug;
    nm.querySelector('span').textContent=s.slug+' · '+fmt(s.length)+' · '+s.cues+' cues';
    var play=document.createElement('button');play.className='go';play.type='button';play.textContent='Play';
    play.onclick=function(){post('play',s.slug)};
    var del=document.createElement('button');del.className='del';del.type='button';del.textContent='delete';
    del.onclick=function(){
      if(!confirm('Delete '+s.slug+'?'))return;
      fetch('/api/shows?slug='+encodeURIComponent(s.slug),{method:'DELETE'})
        .then(function(r){return r.json()}).then(function(x){
          say(x.ok?'deleted '+s.slug:(x.error||'delete failed'),x.ok?'good':'err');
          delete selected[s.slug];
          listSig='';
          loadCatalog();
        });
    };
    li.appendChild(cb);li.appendChild(nm);li.appendChild(play);li.appendChild(del);
    box.appendChild(li);
  });
  if(!(d.shows||[]).length){
    var empty=document.createElement('li');
    empty.innerHTML='<div class="nm"><span>No sequences yet — upload a Director .pfs (or copy demo_*.pfs into /shows).</span></div>';
    box.appendChild(empty);
  }
}
function paintFromStatus(d){
  d.shows=catalogShows;
  paintStatus(d);
  applyListHighlight(d);
}
function loadCatalog(){
  fetch('/api/shows',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
    catalogShows=d.shows||[];
    paintStatus(d);
    var sig=catalogShows.map(function(s){return s.slug+':'+s.cues+':'+(s.length|0)}).join('|');
    if(sig!==listSig){
      listSig=sig;
      rebuildList(d);
    }else{
      applyListHighlight(d);
    }
  }).catch(function(){say('cannot reach device or list JSON failed','err')});
}
function loadStatus(){
  fetch('/api/shows/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
    paintFromStatus(d);
  }).catch(function(){});
}
function load(){ loadCatalog(); }
function post(op,slug){
  var body='op='+encodeURIComponent(op);
  if(slug)body+='&slug='+encodeURIComponent(slug);
  if($('loop').checked)body+='&loop=1';
  fetch('/api/shows/control',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body})
    .then(function(r){return r.json()}).then(function(d){
      if(d.ok===false){say(d.error||'failed','err');return}
      say(op==='play'||op==='playlist'?'playing':'stopped','good');
      paintFromStatus(d);
    }).catch(function(){say('no reply','err')});
}
function playSelected(){
  var slugs=selectedList();
  if(!slugs.length){say('tick one or more sequences first','err');return}
  var body='op=playlist&slugs='+encodeURIComponent(slugs.join(','));
  if($('loop').checked)body+='&loop=1';
  else body+='&loop=0';
  fetch('/api/shows/control',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body})
    .then(function(r){return r.json()}).then(function(d){
      if(d.ok===false){say(d.error||'failed','err');return}
      say('sequence saved · '+slugs.length+' shows','good');
      selectedReady=true;
      paintFromStatus(d);
    }).catch(function(){say('no reply','err')});
}
$('btnPlaySel').onclick=playSelected;
$('btnStop').onclick=function(){post('stop')};
$('btnAll').onclick=function(){
  document.querySelectorAll('#list input.pick').forEach(function(cb){cb.checked=true;selected[cb.dataset.slug]=true});
};
$('btnNone').onclick=function(){
  selected={};
  document.querySelectorAll('#list input.pick').forEach(function(cb){cb.checked=false});
};
$('loop').onchange=function(){
  fetch('/api/shows/control',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'op=loop&loop='+($('loop').checked?'1':'0')});
};
$('var-en').onchange=saveVariance;
$('var-cue').onchange=saveVariance;
$('var-param').onchange=saveVariance;
$('night').onsubmit=function(e){
  e.preventDefault();
  var body='enabled='+($('n-en').checked?'1':'0');
  body+='&night='+encodeURIComponent($('n-night').value);
  body+='&wake='+encodeURIComponent($('n-wake').value);
  body+='&slug='+encodeURIComponent($('n-slug').value);
  body+='&repeat='+($('n-rpt').checked?'1':'0');
  body+='&nightClock='+($('n-clk').checked?'1':'0');
  body+='&nightDim='+encodeURIComponent($('n-dim').value||'15');
  fetch('/api/shows/schedule',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body})
    .then(function(r){return r.json()}).then(function(d){
      var n=$('nmsg');
      if(d.ok===false){n.textContent=d.error||'save failed';n.className='err';return}
      n.textContent='night saved';n.className='good';
      nightReady=false;
      loadStatus();
    }).catch(function(){$('nmsg').textContent='no reply';$('nmsg').className='err'});
};
function upload(file){
  if(!file)return;
  pickFiles([file]);
}
var qEl=$('q'),retryBtn=$('retry');
var items=[];
var STATE_LABEL={wait:'waiting',up:'uploading',ver:'verifying…',retry:'retrying…',ok:'✓ done',fail:'✗ failed'};
var ZIP_MAX_BYTES=8*1024*1024;

function renderQ(){
  qEl.style.display=items.length?'block':'none';
  qEl.innerHTML='';
  items.forEach(function(it){
    var li=document.createElement('li');
    var row=document.createElement('div');row.className='qrow';
    var nm=document.createElement('span');nm.className='qn';nm.textContent=it.name;
    var st=document.createElement('span');
    st.className='qs '+(it.st==='ver'?'up':it.st);
    st.textContent=it.st==='up'?('uploading '+(it.pct||0)+'%'):STATE_LABEL[it.st];
    row.appendChild(nm);row.appendChild(st);li.appendChild(row);
    if(it.st==='up'){
      var b=document.createElement('div');b.className='qbar';
      var f=document.createElement('i');f.style.width=(it.pct||0)+'%';
      b.appendChild(f);li.appendChild(b);
    }
    if(it.st==='fail'&&it.err){
      var e=document.createElement('div');e.className='qerr';e.textContent=it.err;
      li.appendChild(e);
    }
    qEl.appendChild(li);
  });
}

function finishBatch(){
  var ok=0,fail=0;
  items.forEach(function(it){if(it.st==='ok')ok++;else if(it.st==='fail')fail++});
  if(fail===0){say(ok+' sequence'+(ok===1?'':'s')+' stored','good')}
  else{say(ok+' stored, '+fail+' failed','err')}
  retryBtn.style.display=items.some(function(it){return it.st==='fail'&&it.f})?'':'none';
  listSig='';
  setTimeout(loadCatalog,700);
}

function runQ(i){
  while(i<items.length&&items[i].st!=='wait'&&items[i].st!=='retry')i++;
  if(i>=items.length){finishBatch();return}
  var it=items[i];
  it.st='up';it.pct=0;renderQ();
  var xhr=new XMLHttpRequest();
  xhr.open('PUT','/api/shows');
  xhr.setRequestHeader('X-PF-Name',it.name);
  xhr.upload.onprogress=function(e){
    if(!e.lengthComputable)return;
    it.pct=Math.round(e.loaded/e.total*90);
    if(e.loaded===e.total)it.st='ver';
    renderQ();
  };
  var next=function(){setTimeout(function(){runQ(i+1)},350)};
  var deadReply=function(){
    it.tries=(it.tries||0)+1;
    it.pct=0;
    if(it.tries<=2){it.st='retry';renderQ();
      setTimeout(function(){runQ(i)},700);return}
    it.st='fail';it.err='no reply from device';renderQ();next();
  };
  xhr.onload=function(){
    var d=null;try{d=JSON.parse(xhr.responseText)}catch(e){}
    if(d&&d.ok){it.st='ok';it.pct=100;renderQ();next()}
    else if(d&&d.error){it.st='fail';it.err=d.error;renderQ();next()}
    else deadReply();
  };
  xhr.onerror=deadReply;
  xhr.send(it.f);
}

function loadFflate(){
  if(window.fflate)return Promise.resolve();
  return new Promise(function(res,rej){
    var s=document.createElement('script');
    s.src='/patterns/fflate.js';
    s.onload=function(){res()};
    s.onerror=function(){rej(new Error('could not load the unzip library'))};
    document.head.appendChild(s);
  });
}

function expandFiles(fileList){
  var list=Array.prototype.slice.call(fileList||[]);
  var keep=function(n){return /\.pfs$/i.test(n)};
  if(!list.some(function(f){return /\.zip$/i.test(f.name)}))
    return Promise.resolve(list.filter(function(f){return keep(f.name)}));
  say('unpacking zip…');
  return loadFflate().then(function(){
    var out=[],seen={},total=0;
    var push=function(f){if(!seen[f.name]){seen[f.name]=1;out.push(f)}};
    var chain=Promise.resolve();
    list.forEach(function(f){
      if(!/\.zip$/i.test(f.name)){if(keep(f.name))push(f);return}
      chain=chain.then(function(){return f.arrayBuffer()}).then(function(buf){
        var unzipped=fflate.unzipSync(new Uint8Array(buf));
        Object.keys(unzipped).forEach(function(name){
          var base=name.split(/[\\/]/).pop();
          if(!base||base.charAt(0)==='.'||!keep(base))return;
          total+=unzipped[name].length;
          if(total>ZIP_MAX_BYTES)
            throw new Error('zip holds more than '+(ZIP_MAX_BYTES>>20)+' MB of sequences');
          push(new File([unzipped[name]],base));
        });
      });
    });
    return chain.then(function(){return out});
  });
}

function pickFiles(fileList){
  expandFiles(fileList).then(function(files){
    if(!files.length){say('nothing to install — no .pfs in that drop','err');return}
    startBatch(files);
  }).catch(function(e){say((e&&e.message)||'could not read that zip','err')});
}

function startBatch(fileList){
  items=[];
  for(var i=0;i<fileList.length;i++)
    items.push({f:fileList[i],name:fileList[i].name,st:'wait',pct:0,tries:0});
  retryBtn.style.display='none';
  say('');renderQ();runQ(0);
}

retryBtn.onclick=function(){
  items.forEach(function(it){if(it.st==='fail'&&it.f){it.st='wait';it.err='';it.tries=0;it.pct=0}});
  retryBtn.style.display='none';
  say('');renderQ();runQ(0);
};

$('file').onchange=function(){if(this.files.length)pickFiles(this.files);this.value=''};
var drop=$('drop');
['dragenter','dragover'].forEach(function(e){
  drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.add('over')})});
['dragleave','drop'].forEach(function(e){
  drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.remove('over')})});
drop.addEventListener('drop',function(ev){
  if(ev.dataTransfer.files.length)pickFiles(ev.dataTransfer.files)});
loadCatalog();
setInterval(loadStatus,1000);
</script>
</body></html>)HTML";
