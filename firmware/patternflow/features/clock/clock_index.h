// ═══════════════════════════════════════════════════════════
// PatternFlow - /clock console page (PROGMEM HTML)
// License: MIT
// ═══════════════════════════════════════════════════════════
// The page body below is generated from console/clock.html — edit that,
// then run: python firmware/toolchain/console_pages.py build
#pragma once

#include <Arduino.h>

static const char CLOCK_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en">
<head><meta charset="utf-8">
<script src="/pf-console.js"></script>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - Clock</title>
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
.field{display:flex;align-items:center;gap:12px;padding:6px 0}
.field label{flex:0 0 88px;font-size:13px;color:var(--muted)}
.field input,.field select{flex:1;min-width:0;font:inherit;font-family:var(--mono);font-size:12px;
padding:7px 9px;background:var(--panel);color:var(--ink);
border:1px solid var(--rule);border-radius:2px}
.field input[type=color]{flex:0 0 64px;height:32px;padding:2px}
.field input:focus,.field select:focus{outline:none;border-color:var(--led)}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:10px}
.save{font:inherit;font-size:12px;padding:6px 12px;border-radius:2px;cursor:pointer;
border:1px solid var(--led);background:var(--led);color:var(--panel);font-weight:600}
.check{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted);padding:6px 0}
.check input{accent-color:var(--led)}
.note{font-size:12px;color:var(--faint);margin:8px 0 0;line-height:1.45}
#msg{margin-top:10px;font-family:var(--mono);font-size:11px;min-height:16px}
#msg.err{color:var(--led)}#msg.good{color:var(--ok)}
dl{margin:0;border-top:1px solid var(--rule-soft)}
.row{display:flex;align-items:baseline;gap:12px;padding:7px 2px;
border-bottom:1px solid var(--rule-soft)}
dt{flex:1;font-size:13px;color:var(--muted);margin:0}
dd{margin:0;font-family:var(--mono);font-size:12px;text-align:right}
.ok{color:var(--ok)}.bad{color:var(--led)}
footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--rule);
font-family:var(--mono);font-size:11px;color:var(--faint)}
a{color:var(--muted)}
html[data-theme=light]{--cream:#F4EFE6;--cream2:#FFFCFA;--bg:#F4EFE6;--panel:#FFFCFA;--ink:#1A1814;--muted:#6B6558;--faint:#9A9486;--ghost:#E0D9CC;--rule:#D9D1C2;--rule-soft:#E8E2D6;--led:#FF5C2E;--ok:#2F8A55;--warn:#B88120;--card:#FFFCFA;--fg:#1A1814}
@media(max-width:420px){.field{display:block}.field label{display:block;margin-bottom:4px}.field input,.field select{width:100%}}
</style></head><body><div class="wrap">
<header><span class="dot"></span><h1>Clock</h1><span class="sub" id="st">-</span></header>

<form id="cfg" autocomplete="off">
<section>
  <h2>On the panel</h2>
  <label class="check"><input type="checkbox" id="f-on"> Show the clock over every pattern</label>
  <div class="field"><label for="f-pos">Where</label>
    <select id="f-pos">
      <option value="0">Top left</option>
      <option value="1">Top right</option>
      <option value="2">Bottom left</option>
      <option value="3">Bottom right</option>
      <option value="4">Centre</option>
    </select></div>
  <div class="field"><label for="f-size">Size</label>
    <select id="f-size">
      <option value="0">Small — fine print in a corner</option>
      <option value="1">Medium — the banner face</option>
      <option value="2">Large — seven-segment digits</option>
    </select></div>
  <div class="field"><label for="f-rot">Panel</label>
    <select id="f-rot">
      <option value="0">Wide (0°)</option>
      <option value="1">Stood on end (90°)</option>
      <option value="2">Wide, upside down (180°)</option>
      <option value="3">Stood on end, the other way (270°)</option>
    </select></div>
  <label class="check"><input type="checkbox" id="f-sec"> Seconds</label>
  <label class="check"><input type="checkbox" id="f-h12"> 12-hour</label>
  <label class="check"><input type="checkbox" id="f-date"> Date underneath</label>
  <label class="check"><input type="checkbox" id="f-blink"> Blink the colon (large digits only)</label>
  <div class="field"><label for="f-ink">Colour</label>
    <input id="f-ink" type="color" value="#f5f5f5"></div>
  <p class="note">Drawn after the pattern, with a one-pixel black outline so the pattern
  shows through around the digits. Off while the panel's own menus are up.</p>
</section>

<section>
  <h2>Time zone</h2>
  <div class="field"><label for="f-zone">Zone</label>
    <select id="f-zone">
      <option value="UTC0">UTC</option>
      <option value="GMT0BST,M3.5.0/1,M10.5.0">London, Dublin, Lisbon</option>
      <option value="CET-1CEST,M3.5.0,M10.5.0/3">Berlin, Paris, Rome, Madrid, Amsterdam</option>
      <option value="EET-2EEST,M3.5.0/3,M10.5.0/4">Athens, Helsinki, Kyiv</option>
      <option value="MSK-3">Moscow, Istanbul</option>
      <option value="&lt;+04&gt;-4">Dubai</option>
      <option value="IST-5:30">India</option>
      <option value="&lt;+07&gt;-7">Bangkok, Jakarta</option>
      <option value="CST-8">Shanghai, Singapore, Taipei, Manila</option>
      <option value="KST-9">Seoul</option>
      <option value="JST-9">Tokyo</option>
      <option value="AEST-10AEDT,M10.1.0,M4.1.0/3">Sydney, Melbourne</option>
      <option value="NZST-12NZDT,M9.5.0,M4.1.0/3">Auckland</option>
      <option value="HST10">Honolulu</option>
      <option value="PST8PDT,M3.2.0,M11.1.0">Los Angeles, Vancouver</option>
      <option value="MST7MDT,M3.2.0,M11.1.0">Denver</option>
      <option value="CST6CDT,M3.2.0,M11.1.0">Chicago, Mexico City</option>
      <option value="EST5EDT,M3.2.0,M11.1.0">New York, Toronto</option>
      <option value="&lt;-03&gt;3">São Paulo, Buenos Aires</option>
      <option value="custom">Custom (POSIX TZ string)…</option>
    </select></div>
  <div class="field" id="customrow" hidden><label for="f-tz">POSIX</label>
    <input id="f-tz" placeholder="e.g. CET-1CEST,M3.5.0,M10.5.0/3" maxlength="47"></div>
  <p class="note">A zone carries its summer-time rule, so the clock moves itself in spring
  and autumn. The Weather page's UTC offset is the older setting and cannot; when the two
  disagree, this one wins.</p>
  <div class="actions"><button type="submit" class="save" id="save">Save</button></div>
  <div id="msg"></div>
</section>
</form>

<section>
  <h2>As the panel sees it</h2>
  <dl>
    <div class="row"><dt>Time</dt><dd id="time">-</dd></div>
    <div class="row"><dt>Date</dt><dd id="today">-</dd></div>
    <div class="row"><dt>Zone</dt><dd id="zone">-</dd></div>
    <div class="row"><dt>NTP</dt><dd id="sync">-</dd></div>
  </dl>
  <p class="note">Nothing is drawn until NTP has answered once after boot — a clock reading
  12:00 while it waits is worse than none.</p>
</section>

<footer>pool.ntp.org · time.google.com</footer>
</div>
<script>
function $(i){return document.getElementById(i)}
function say(t,cls){$('msg').textContent=t||'';$('msg').className=cls||''}
var cfgFilled=false;
function zoneKnown(tz){
  var o=$('f-zone').options;
  for(var i=0;i<o.length;i++){if(o[i].value===tz)return true}
  return false;
}
function fill(d){
  if(!cfgFilled){
    $('f-on').checked=!!d.on;
    $('f-pos').value=String(d.pos);
    $('f-size').value=String(d.size);
    $('f-rot').value=String(d.rot);
    $('f-sec').checked=!!d.sec;
    $('f-h12').checked=!!d.h12;
    $('f-date').checked=!!d.date;
    $('f-blink').checked=!!d.blink;
    $('f-ink').value='#'+(d.ink||'F5F5F5').toLowerCase();
    if(zoneKnown(d.tz)){$('f-zone').value=d.tz;$('customrow').hidden=true}
    else{$('f-zone').value='custom';$('f-tz').value=d.tz||'';$('customrow').hidden=false}
    cfgFilled=true;
  }
  $('st').textContent=d.on?(d.synced?'on':'waiting for NTP'):'off';
  $('st').className='sub '+(d.on&&d.synced?'ok':'');
  $('time').textContent=d.synced?(d.time||'-'):'syncing…';
  $('today').textContent=d.synced?(d.today||'-'):'-';
  $('zone').textContent=(d.zone?d.zone+' · ':'')+(d.tz||'-');
  $('sync').textContent=d.synced?'synced':'not yet';
  $('sync').className=d.synced?'ok':'';
}
function poll(){
  fetch('/api/clock',{cache:'no-store'}).then(function(r){return r.json()}).then(fill)
    .catch(function(){$('st').textContent='offline'});
}
$('f-zone').onchange=function(){
  var custom=$('f-zone').value==='custom';
  $('customrow').hidden=!custom;
  if(custom)$('f-tz').focus();
};
$('cfg').onsubmit=function(e){
  e.preventDefault();
  var body=new URLSearchParams();
  body.set('on',$('f-on').checked?'1':'0');
  body.set('pos',$('f-pos').value);
  body.set('size',$('f-size').value);
  body.set('rot',$('f-rot').value);
  body.set('sec',$('f-sec').checked?'1':'0');
  body.set('h12',$('f-h12').checked?'1':'0');
  body.set('date',$('f-date').checked?'1':'0');
  body.set('blink',$('f-blink').checked?'1':'0');
  body.set('ink',$('f-ink').value.replace('#',''));
  var tz=$('f-zone').value==='custom'?$('f-tz').value.trim():$('f-zone').value;
  if(tz)body.set('tz',tz);
  say('saving…');
  fetch('/api/clock',{method:'POST',body:body}).then(function(r){return r.json()}).then(function(d){
    cfgFilled=false;fill(d);
    say(d.ok?'saved':'failed',d.ok?'good':'err');
  }).catch(function(){say('save failed','err')});
};
poll();setInterval(poll,5000);
document.addEventListener('visibilitychange',function(){
  if(!document.hidden)poll();
});
</script>
</body></html>
)HTML";
