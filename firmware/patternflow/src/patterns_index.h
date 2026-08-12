// ═══════════════════════════════════════════════════════════
// PatternFlow - /patterns management page (served by core_patterns_http.h)
//
// Same cream/ink/LED tokens as the update and home consoles. Kept to one
// PROGMEM string with no external assets: the device serves this with no
// internet in the loop. The one thing loaded separately is the unzip
// library, and that comes from the device too (/patterns/fflate.js), only
// when a .zip is dropped.
//
// Uploads run through a visible per-file queue (waiting / uploading % / done /
// failed), continue past failures, and offer one retry pass — a batch of eight
// files with one hiccup used to die silently at the hiccup, which read as
// "upload is broken" when seven of eight were actually fine.
//
// A .zip of .pfm + .json (a pattern pack, as the community Deck export
// produces) is unpacked in the browser and its members join that same
// queue — the device only ever receives ordinary single-file uploads.
// That approach — unpack in the browser, leave the device's upload path
// alone — is Simone Majocchi's (@SimonePDA), from his Patternflow fork.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>

static const char PATTERNS_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - Patterns</title>
<style>
/* Dark instrument tokens — same names every console page uses (--cream is
   "the page background" by history), night values. The marketing site stays
   paper; the device is the thing glowing in a dark room. */
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
h1{font-size:15px;font-weight:600;letter-spacing:.01em;margin:0;flex:1}
.sub{font-family:var(--mono);font-size:11px;color:var(--faint)}
section{margin-top:28px}
h2{font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;
color:var(--muted);margin:0 0 10px}
.drop{display:block;border:1px dashed var(--rule);border-radius:3px;padding:26px 18px;text-align:center;
background:rgba(255,255,255,.02);transition:border-color .15s,background .15s;cursor:pointer}
.drop.over{border-color:var(--led);background:rgba(255,92,46,.06)}
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
li.on{background:rgba(255,92,46,.09)}
/* The name is the play control now; make that discoverable. */
li .nm{cursor:pointer}
li .nm:hover{color:var(--led)}
li.drag{opacity:.35}
li.over-row{border-top:2px solid var(--led)}
button.del{font:inherit;font-size:11px;color:var(--muted);background:none;
border:1px solid var(--rule);border-radius:2px;padding:2px 8px;cursor:pointer}
button.del:hover{border-color:var(--led);color:var(--led)}
button.del:disabled{opacity:.4;cursor:default;border-color:var(--rule);color:var(--muted)}

/* Install queue: one row per file, states colour-coded. The bar under an
   uploading row is its own progress, not a global one. */
.queue{border-top:none;margin-top:12px;display:none}
.queue li{display:block;padding:6px 2px;border-bottom:1px dashed var(--rule-soft);
font-family:var(--mono);font-size:11.5px}
.qrow{display:flex;align-items:center;gap:10px}
.qn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}
.qs{white-space:nowrap}
.qs.get,.qs.wait{color:var(--faint)}
.qs.up{color:var(--ink)}
.qs.retry{color:var(--warn)}
.qs.ok{color:var(--ok)}
.qs.fail{color:var(--led)}
.qbar{height:2px;background:var(--rule-soft);margin-top:5px}
.qbar i{display:block;height:100%;width:0;background:var(--led)}
.qerr{margin-top:3px;color:var(--led);font-size:10.5px;white-space:normal}

#msg{margin-top:12px;font-family:var(--mono);font-size:11px;min-height:16px}
#msg.err{color:var(--led)}
#msg.good{color:var(--ok)}
.actions{display:flex;gap:8px;margin-top:8px;align-items:center}
input.sel{width:14px;height:14px;accent-color:var(--led);margin:0}
#bulk{display:none}
.bulkTop{margin:0 0 10px}
.bulkNote{font-family:var(--mono);font-size:11px;color:var(--faint)}
footer{margin-top:36px;padding-top:12px;border-top:1px solid var(--rule);
font-family:var(--mono);font-size:11px;color:var(--faint)}
a{color:var(--muted)}
/* Console navigation, same on every page. */
.pfnav{display:flex;flex-wrap:wrap;gap:13px;margin:10px 0 0;
font-family:var(--mono);font-size:11px;letter-spacing:.04em}
.pfnav a{color:var(--faint);text-decoration:none}
.pfnav a:hover{color:var(--led)}
.pfnav a.here{color:var(--ink)}
/* Desktop: upload pinned left, the library right — the whole page without
   scrolling, instead of a phone column with acres beside it. */
@media(min-width:960px){
.wrap{max-width:1140px}
.cols{display:grid;grid-template-columns:430px minmax(0,1fr);gap:48px;align-items:start}
.colL{position:sticky;top:18px}
.colR section{margin-top:16px}}
</style></head><body><div class="wrap">
<header><span class="dot"></span><h1>Patterns</h1><span class="sub" id="fs">-</span></header>
<nav class="pfnav"><a href="/">Console</a><a href="/patterns" class="here">Patterns</a><a href="/audio">Audio</a><a href="/status">Status</a><a href="/wifi">Wi-Fi</a><a href="/mqtt">MQTT</a><a href="/update">Update</a></nav>


<div class="cols">
<div class="colL">
<section>
  <h2>Upload</h2>
  <label class="drop" id="drop">
    <input type="file" id="file" accept=".pfm,.json,.zip,application/zip" multiple>
    <p>Drop <b>.pfm</b> files or a <b>.zip</b> pack here, or click to choose</p>
    <p class="hint">modules + their .json sidecars, all at once &middot; zip unpacks in the browser</p>
  </label>
  <ul class="queue" id="q"></ul>
  <div id="msg"></div>
  <div class="actions">
    <button class="del" id="retry" style="display:none">Retry failed</button>
    <button class="del" id="fmt" style="display:none">Format storage</button>
    <span class="bulkNote" id="fmtNote"></span>
  </div>
</section>
</div>

<div class="colR">
<section>
  <h2>Installed</h2>
  <div class="actions bulkTop" id="bulk">
    <button class="del" id="selAll">Select all</button>
    <button class="del" id="bulkDel">Delete selected</button>
    <button class="del" id="saveOrd" style="display:none">Save order</button>
    <span class="bulkNote" id="bulkN"></span>
  </div>
  <ul id="list"></ul>
</section>
</div>
</div>

<footer>Presets are built into the firmware and cannot be removed here.
&nbsp;<a href="/">Home</a></footer>
</div>
<script>
function $(i){return document.getElementById(i)}
var msg=$('msg'),listEl=$('list'),drop=$('drop'),file=$('file'),fs=$('fs'),
    qEl=$('q'),retryBtn=$('retry'),bulk=$('bulk'),bulkDel=$('bulkDel'),bulkN=$('bulkN'),
    selAll=$('selAll');

// Only modules get a checkbox — presets live in firmware.bin and are not
// deletable — so these are also the count of what bulk actions can touch.
function selBoxes(){return listEl.querySelectorAll('input.sel')}

function selectedSlugs(){
  var out=[];
  listEl.querySelectorAll('input.sel:checked').forEach(function(c){out.push(c.dataset.slug)});
  return out;
}

// The bar is visible whenever there is anything selectable, not just once
// something is selected: "Select all" has to be reachable from zero, which
// is exactly the state you are in when a long list needs clearing out.
function updateBulk(){
  var total=selBoxes().length;
  var n=selectedSlugs().length;
  bulk.style.display=total?'flex':'none';
  bulkDel.textContent='Delete selected ('+n+')';
  bulkDel.disabled=n===0;
  selAll.textContent=(n===total&&total>0)?'Clear selection':'Select all';
  bulkN.textContent=total?(n?'presets cannot be deleted':total+' module'+(total===1?'':'s')):'';
}

selAll.onclick=function(){
  var boxes=selBoxes();
  var want=selectedSlugs().length!==boxes.length;
  boxes.forEach(function(c){c.checked=want});
  updateBulk();
};

function say(t,cls){msg.textContent=t;msg.className=cls||''}

function load(){
  fetch('/api/patterns').then(function(r){return r.json()}).then(function(d){
    fs.textContent=d.mounted?(Math.round(d.free/1024)+' KB free'):'storage not mounted';
    // A board whose pattern partition was never formatted cannot store
    // modules. Formatting is deliberate and destructive, so it is a button
    // rather than something the firmware does behind your back.
    $('fmt').style.display=d.mounted?'none':'';
    $('fmtNote').textContent=d.mounted?'':
      'this board has never stored patterns - format once to start';
    listEl.innerHTML='';
    d.patterns.slice().reverse().forEach(function(p){
      var li=document.createElement('li');
      if(p.index===d.active)li.className='on';
      var n=document.createElement('span');n.className='n';n.textContent=p.index+1;
      var nm=document.createElement('span');nm.className='nm';nm.textContent=p.name;
      nm.title='play';
      nm.onclick=function(){play(p.index,p.name)};
      var tg=document.createElement('span');
      tg.className='tag'+(p.module?' mod':'');
      tg.textContent=p.module?'module':'preset';
      if(p.module){
        var c=document.createElement('input');c.type='checkbox';c.className='sel';
        c.dataset.slug=p.module;c.onchange=updateBulk;
        li.appendChild(c);
        li.draggable=true;
        li.dataset.slug=p.module;
        wireDrag(li);
      }else{
        var sp=document.createElement('span');sp.style.width='14px';li.appendChild(sp);
      }
      li.appendChild(n);li.appendChild(nm);li.appendChild(tg);
      if(p.module){
        var b=document.createElement('button');b.className='del';b.textContent='delete';
        b.onclick=function(){del(p.module,p.name)};
        li.appendChild(b);
      }
      listEl.appendChild(li);
    });
    updateBulk();
  }).catch(function(){say('cannot reach device','err')});
}

// ── Play (click a name) ──────────────────────────────────────────
// Same endpoint the community's one-click install uses. The device queues
// the switch and the loop performs it, so this returns before the module
// has even been read — the highlight moves optimistically and load()
// verifies shortly after.
function play(index,name){
  say('switching to '+name+'…');
  fetch('/api/patterns/select?index='+index,{cache:'no-store'})
    .then(function(r){return r.json()})
    .then(function(d){
      if(!d.ok){say(d.error||'switch failed','err');return}
      say('now playing: '+d.name,'good');
      listEl.querySelectorAll('li').forEach(function(el){el.classList.remove('on')});
      var rows=listEl.querySelectorAll('li .n');
      rows.forEach(function(el){
        if(parseInt(el.textContent,10)===index+1)el.parentElement.classList.add('on');
      });
    }).catch(function(){say('no reply from device','err')});
}

// ── Arrange (drag rows, then Save order) ─────────────────────────
// Dragging is DISPLAY order; the device's order is the reverse (the list
// shows the last pattern first, because "one back-turn from Origin" is the
// closest slot to hand). saveOrder() un-reverses before writing, so
// catalog.txt reads top of the file = pattern 2, exactly what
// pattern_registry.h expects. The file travels through the ordinary upload
// path with X-PF-Name: catalog.txt — no dedicated endpoint.
var dragging=null,orderDirty=false;
function wireDrag(li){
  li.addEventListener('dragstart',function(){dragging=li;li.classList.add('drag')});
  li.addEventListener('dragend',function(){
    li.classList.remove('drag');
    listEl.querySelectorAll('li').forEach(function(el){el.classList.remove('over-row')});
  });
  li.addEventListener('dragover',function(ev){
    if(!dragging||dragging===li)return;
    ev.preventDefault();
    li.classList.add('over-row');
  });
  li.addEventListener('dragleave',function(){li.classList.remove('over-row')});
  li.addEventListener('drop',function(ev){
    ev.preventDefault();
    li.classList.remove('over-row');
    if(!dragging||dragging===li)return;
    listEl.insertBefore(dragging,li);
    orderDirty=true;
    $('saveOrd').style.display='';
    say('order changed — not saved yet','good');
  });
}

$('saveOrd').onclick=function(){
  var slugs=[];
  listEl.querySelectorAll('li[data-slug]').forEach(function(el){slugs.push(el.dataset.slug)});
  slugs.reverse();  // display order → device order (see note above)
  var text='# Patternflow running order — first line is pattern 2\n'+slugs.join('\n')+'\n';
  say('saving order…');
  var xhr=new XMLHttpRequest();
  xhr.open('PUT','/api/patterns');
  xhr.setRequestHeader('X-PF-Name','catalog.txt');
  xhr.setRequestHeader('X-PF-Last','1');
  xhr.onload=function(){
    var d=null;try{d=JSON.parse(xhr.responseText)}catch(e){}
    if(d&&d.ok){orderDirty=false;$('saveOrd').style.display='none';
      say('order saved','good');setTimeout(load,900)}
    else say((d&&d.error)||'save failed','err');
  };
  xhr.onerror=function(){say('no reply from device','err')};
  xhr.send(new Blob([text]));
};

// ── Bulk delete ──────────────────────────────────────────────────
// ONE request for the whole selection. This used to walk the per-slug
// DELETE with a breather between each, and every one of those calls made
// the device rescan FATFS and reload the running module — so clearing a
// library of fifty was a minute of watching the list redraw. The device
// now takes the list, removes the files in one pass, and rescans once.
//
// Sending "*" instead of the list is the whole library: the device clears
// whatever .pfm files are actually on disk, which also catches modules the
// loader rejected at boot and that therefore never appear in this list.
function deleteSlugs(slugs, label){
  say('deleting ' + label + '…');
  bulkDel.disabled = true;
  fetch('/api/patterns/delete',{method:'POST',body:slugs.join('\n')})
    .then(function(r){return r.json()})
    .then(function(d){
      bulkDel.disabled=false;
      if(!d.ok){say(d.error||'delete failed','err');return}
      var msg=d.removed+' module'+(d.removed===1?'':'s')+' removed';
      if(d.missing)msg+=', '+d.missing+' not found';
      say(msg,d.missing?'err':'good');
      // The rescan is deferred on the device (see requestReload), so the
      // list is only right a moment after the reply.
      setTimeout(load,900);
    })
    .catch(function(){bulkDel.disabled=false;say('no reply from device','err')});
}

bulkDel.onclick=function(){
  var slugs=selectedSlugs();
  if(!slugs.length)return;
  var total=selBoxes().length;
  // Clearing everything is the common case behind a big selection, and the
  // device can do it without being told fifty names.
  if(slugs.length===total&&total>2){
    if(!confirm('Delete all '+total+' modules? Origin stays.'))return;
    deleteSlugs(['*'],'every module');
    return;
  }
  if(!confirm('Delete '+slugs.length+' module'+(slugs.length===1?'':'s')+
              ' -- '+slugs.join(', ')+'?'))return;
  deleteSlugs(slugs,slugs.length+' module'+(slugs.length===1?'':'s'));
};

function del(slug,name){
  if(!confirm('Delete "'+name+'"?'))return;
  fetch('/api/patterns?slug='+encodeURIComponent(slug),{method:'DELETE'})
    .then(function(r){return r.json()}).then(function(d){
      say(d.ok?('deleted '+slug):(d.error||'delete failed'),d.ok?'':'err');
      // The device rebuilds its list off the HTTP path ~150ms later.
      setTimeout(load,700);
    }).catch(function(){say('delete failed','err')});
}

// ── Install queue ────────────────────────────────────────────────
// items: {f:File|null, name, st:'get'|'wait'|'up'|'retry'|'ok'|'fail', pct, err}
var items=[];

// Upload states only — deleting is one request now and reports as a single
// line, so it no longer borrows this queue.
var STATE_LABEL={get:'fetching…',wait:'waiting',up:'uploading',
                 ver:'verifying…',retry:'retrying…',ok:'✓ done',fail:'✗ failed'};

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
  if(fail===0){say(ok+' file'+(ok===1?'':'s')+' installed','good')}
  else{say(ok+' installed, '+fail+' failed','err')}
  retryBtn.style.display=items.some(function(it){return it.st==='fail'&&it.f})?'':'none';
  setTimeout(load,700);
}

// Sequential with a breather between files — this WebServer flakes under
// rapid back-to-back multipart POSTs (~1 in 12 dies even when healthy).
// Failures don't stop the batch: the row goes red with the reason and the
// rest carry on. A dead reply (device usually stored the file anyway) gets
// two retries; a real JSON rejection never retries.
function runQ(i){
  while(i<items.length&&items[i].st!=='wait'&&items[i].st!=='retry')i++;
  if(i>=items.length){finishBatch();return}
  var it=items[i];
  var isLast=true;
  for(var j=i+1;j<items.length;j++)
    if(items[j].st==='wait'||items[j].st==='retry')isLast=false;
  it.st='up';it.pct=0;renderQ();

  var xhr=new XMLHttpRequest();
  // Raw PUT, not multipart: the device WebServer's multipart parser is its
  // flakiest path (multi-chunk bodies died with no reply often enough to make
  // installs feel broken). A raw body sidesteps boundary parsing entirely.
  // Filename and the batch flag travel as headers; last=1 triggers the
  // device's single end-of-batch rescan.
  xhr.open('PUT','/api/patterns');
  xhr.setRequestHeader('X-PF-Name',it.name);
  xhr.setRequestHeader('X-PF-Last',isLast?'1':'0');
  // Transfer shows 0-90%. "100% handed to the network" is not "installed" —
  // a bar parked on 100 while the device was still writing (or failing) read
  // as success. The last 10% is the device's own confirmation.
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

// ── Pattern packs (.zip) ─────────────────────────────────────────
// A pack is an ordinary zip of .pfm + .json — what the community Deck
// export hands you. The device never sees the archive: it is expanded
// here and the members join the same queue a plain multi-select uses,
// so the upload path below stays untouched. fflate comes from the
// device (not a CDN) so this works on a LAN with no internet, and it is
// only fetched when a zip actually shows up.
var ZIP_MAX_BYTES=8*1024*1024;

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

// Promise for a flat File[]: zip members expanded, loose files passed
// through. Folders collapse to basenames and dotfiles go away, which is
// what drops the __MACOSX/._* junk a Mac-made zip carries.
//
// Split on BOTH separators. The zip spec says entry names use "/", but
// .NET's CreateFromDirectory — what PowerShell's Compress-Archive is built
// on — writes "\" on Windows, and a pack made that way arrives with its
// whole path stuck to the filename: the junk filter stops matching, the
// duplicate check stops matching, and the queue shows "a\b\wave.pfm".
function expandFiles(fileList){
  var list=Array.prototype.slice.call(fileList||[]);
  // catalog.txt rides along: it is the pack's running order (deck order).
  var keep=function(n){return /\.(pfm|json)$/i.test(n)||/^catalog\.txt$/i.test(n)};
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
            throw new Error('zip holds more than '+(ZIP_MAX_BYTES>>20)+' MB of patterns');
          push(new File([unzipped[name]],base));
        });
      });
    });
    return chain.then(function(){return out});
  });
}

// Every entry point to the queue goes through here so a zip is unpacked
// exactly once, wherever it came from.
function pickFiles(fileList){
  expandFiles(fileList).then(function(files){
    if(!files.length){say('nothing to install — no .pfm or .json in that drop','err');return}
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

$('fmt').onclick=function(){
  if(!confirm('Format pattern storage? This erases every module on the device.'))return;
  say('formatting...');
  fetch('/api/patterns/format',{method:'POST'})
    .then(function(r){return r.json()}).then(function(d){
      say(d.ok?'storage ready - upload patterns now':(d.error||'format failed'),
          d.ok?'good':'err');
      setTimeout(load,900);
    }).catch(function(){say('format failed','err')});
};

retryBtn.onclick=function(){
  var redo=[];
  items.forEach(function(it){if(it.st==='fail'&&it.f)redo.push(it.f)});
  if(redo.length)startBatch(redo);
};

file.onchange=function(){if(file.files.length)pickFiles(file.files)};
['dragenter','dragover'].forEach(function(e){
  drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.add('over')})});
['dragleave','drop'].forEach(function(e){
  drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.remove('over')})});
drop.addEventListener('drop',function(ev){
  if(ev.dataTransfer.files.length)pickFiles(ev.dataTransfer.files)});

// One-click install from the community site: /patterns?src=<modules-url>.
// This page runs in the visitor's browser, which can reach both the (https)
// community and this (http) device — so IT does the ferrying: fetch the file
// list, then each file, then the same upload queue the drop zone uses. The
// device never talks to the internet and the visitor downloads nothing.
function installFromUrl(src){
  say('fetching module list from the community…');
  var sep=src.indexOf('?')>=0?'&':'?';
  fetch(src+sep+'list=1').then(function(r){
    if(!r.ok)throw 0;return r.json();
  }).then(function(d){
    var names=(d.files||[]).filter(function(n){return /\.(pfm|json)$/.test(n)});
    if(!names.length)throw 0;
    items=names.map(function(n){return {f:null,name:n,st:'get',pct:0,tries:0}});
    retryBtn.style.display='none';
    say('');renderQ();
    var chain=Promise.resolve();
    items.forEach(function(it){
      chain=chain.then(function(){
        return fetch(src+sep+'file='+encodeURIComponent(it.name))
          .then(function(r){if(!r.ok)throw 0;return r.blob()})
          .then(function(b){it.f=new File([b],it.name);it.st='wait';renderQ()})
          .catch(function(){it.st='fail';it.err='could not fetch from community';renderQ()});
      });
    });
    return chain.then(function(){runQ(0)});
  }).catch(function(){
    say('could not fetch modules from the link — is the build still available?','err');
  });
}
// One-click install of a PACK: /patterns?src=<url of a .zip>.
//
// The same ferrying as above, one file instead of a listing — a deck's
// download address and the site's own pattern packs are both plain zips, so
// sharing a set becomes a link rather than "download this, then drag it
// here". The archive goes through pickFiles, so it is unpacked by exactly
// the code a dropped zip uses; nothing here knows what a .pfm is.
//
// A deck nobody has downloaded yet has to be compiled first, and that route
// says so with 202 rather than blocking. Polling is capped: if a build is
// wedged, saying so beats a spinner that never resolves.
function installZipFromUrl(src,tries){
  tries=tries||0;
  say(tries?'building the pack…':'fetching the pack…');
  fetch(src,{cache:'no-store'}).then(function(r){
    if(r.status===202){
      if(tries>=40)throw new Error('the pack is still building — try again in a minute');
      return new Promise(function(res){setTimeout(res,2000)})
        .then(function(){return installZipFromUrl(src,tries+1)});
    }
    if(!r.ok)throw new Error('could not fetch that pack ('+r.status+')');
    return r.blob().then(function(b){
      say('');
      pickFiles([new File([b],'pack.zip')]);
    });
  }).catch(function(e){
    say((e&&e.message)||'could not fetch that pack','err');
  });
}

var srcParam=new URLSearchParams(location.search).get('src');
if(srcParam&&/^https?:\/\//.test(srcParam)){
  // Strip the query so a reload doesn't reinstall.
  history.replaceState(null,'',location.pathname);
  // Match on the path only: a listing URL carrying "?…=x.zip" must not be
  // mistaken for a pack. Both shapes count — a file named "basics.zip" and
  // a deck's route, which ends in "/zip" with no extension at all.
  var srcPath=srcParam.split('?')[0].split('#')[0];
  if(/[./]zip$/i.test(srcPath))installZipFromUrl(srcParam);
  else installFromUrl(srcParam);
}

load();
</script></body></html>)HTML";
