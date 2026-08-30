// ═══════════════════════════════════════════════════════════
// PatternFlow - /weather console page (PROGMEM HTML)
// License: MIT
// ═══════════════════════════════════════════════════════════
// The page body below is generated from console/weather.html — edit that,
// then run: python firmware/toolchain/console_pages.py build
#pragma once

#include <Arduino.h>

static const char WEATHER_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en">
<head><meta charset="utf-8">
<script src="/pf-console.js"></script>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow - Weather</title>
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
.field input:focus{outline:none;border-color:var(--led)}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:10px}
.save,.forget,.fetch,.go{font:inherit;font-size:12px;padding:6px 12px;border-radius:2px;cursor:pointer}
.save,.go{border:1px solid var(--led);background:var(--led);color:var(--panel);font-weight:600}
.fetch{border:1px solid var(--rule);background:none;color:var(--ink)}
.forget{border:1px solid var(--rule);background:none;color:var(--muted)}
.forget:hover{border-color:var(--led);color:var(--led)}
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
<header><span class="dot"></span><h1>Weather</h1><span class="sub" id="st">-</span></header>

<section>
  <h2>OpenWeather</h2>
  <form id="cfg" autocomplete="off">
    <label class="check"><input type="checkbox" id="f-en"> Enable weather fetch (every 30 min)</label>
    <label class="check"><input type="checkbox" id="f-clock"> Show clock on all patterns</label>
    <div class="field"><label for="f-layout">Layout</label>
      <select id="f-layout"><option value="compact">Compact (128×64)</option>
        <option value="extended">Extended (64×128 portrait)</option></select></div>
    <div class="field"><label for="f-key">API key</label>
      <input id="f-key" name="key" type="password" placeholder="unchanged" maxlength="47"></div>
    <div class="field"><label for="f-q">City</label>
      <input id="f-q" name="query" placeholder="Milan,IT" maxlength="63"></div>
    <div class="field"><label for="f-lat">Lat</label>
      <input id="f-lat" name="lat" placeholder="optional if city set"></div>
    <div class="field"><label for="f-lon">Lon</label>
      <input id="f-lon" name="lon" placeholder="optional if city set"></div>
    <div class="field"><label for="f-units">Units</label>
      <select id="f-units"><option value="1">Metric (°C)</option><option value="0">Imperial (°F)</option></select></div>
    <div class="field"><label for="f-tz">UTC offset</label>
      <input id="f-tz" name="tz" type="number" step="15" placeholder="minutes, e.g. 240 Dubai / 60 Rome"></div>
    <div class="actions">
      <button type="submit" class="save" id="save">Save</button>
      <button type="button" class="fetch" id="fetch">Fetch now</button>
      <button type="button" class="go" id="activate">Show on panel</button>
      <button type="button" class="forget" id="forget">Forget</button>
    </div>
  </form>
  <div id="msg"></div>
  <p class="note">Key and location stay on this device (NVS). City <em>or</em> lat/lon.
    UTC offset is minutes east of UTC (Dubai +240, Rome +60 / +120 with DST).
    Compact fits clock + rotating stats on landscape; Extended is a 64×128 portrait
    frame (panel on its end): upper half rotates Now / +3h / +6h / +24h (icon + temps),
    lower half keeps current humidity / pressure trend / wind / clouds / UV.
    Clock overlay needs NTP (Wi-Fi) and the offset above; skipped on the Weather pattern itself.
    Knobs: K1 condition · K2 temp · K3 humidity · K4 feels-like (0..1).</p>
</section>

<section>
  <h2>Last reading</h2>
  <dl>
    <div class="row"><dt>Local time</dt><dd id="clock">-</dd></div>
    <div class="row"><dt>Condition</dt><dd id="cond">-</dd></div>
    <div class="row"><dt>Description</dt><dd id="desc">-</dd></div>
    <div class="row"><dt>Temperature</dt><dd id="temp">-</dd></div>
    <div class="row"><dt>Feels like</dt><dd id="feels">-</dd></div>
    <div class="row"><dt>Humidity</dt><dd id="hum">-</dd></div>
    <div class="row"><dt>Pressure</dt><dd id="pres">-</dd></div>
    <div class="row"><dt>Wind</dt><dd id="wind">-</dd></div>
    <div class="row"><dt>Clouds</dt><dd id="clouds">-</dd></div>
    <div class="row"><dt>UV index</dt><dd id="uv">-</dd></div>
    <div class="row"><dt>Age</dt><dd id="age">-</dd></div>
    <div class="row"><dt>K1..K4</dt><dd id="knobs">-</dd></div>
  </dl>
</section>

<footer>api.openweathermap.org · One Call API 3.0</footer>
</div>
<script>
function $(i){return document.getElementById(i)}
function say(t,cls){$('msg').textContent=t||'';$('msg').className=cls||''}
function age(ms){
  if(!ms)return '-';
  var s=Math.floor(ms/1000);
  if(s<60)return s+'s';
  var m=Math.floor(s/60);if(m<60)return m+'m';
  return Math.floor(m/60)+'h '+ (m%60)+'m';
}
var cfgFilled=false;
function fill(d){
  if(!cfgFilled){
    $('f-en').checked=!!d.enabled;
    $('f-clock').checked=!!d.clockOverlay;
    $('f-layout').value=d.layoutExtended?'extended':'compact';
    $('f-q').value=d.query||'';
    $('f-lat').value=(d.lat==null?'':d.lat);
    $('f-lon').value=(d.lon==null?'':d.lon);
    $('f-units').value=d.metric?'1':'0';
    $('f-tz').value=(d.tzOffsetMin!=null?d.tzOffsetMin:0);
    $('f-key').placeholder=d.hasKey?'unchanged':'paste OpenWeather key';
    cfgFilled=true;
  }
  $('st').textContent=d.enabled?(d.hasData?'live':(d.error||'waiting')):(d.configured?'off':'setup');
  $('st').className='sub '+(d.error&&d.enabled?'bad':(d.hasData?'ok':''));
  $('clock').textContent=d.timeSynced?(d.localTime||'-'):'syncing…';
  $('cond').textContent=d.condition||'-';
  $('desc').textContent=d.description||'-';
  if(d.hasData){
    var u=d.metric?'C':'F';
    var t=d.metric?d.tempC:(d.tempC*9/5+32);
    var f=d.metric?d.feelsC:(d.feelsC*9/5+32);
    $('temp').textContent=t.toFixed(1)+' °'+u;
    $('feels').textContent=f.toFixed(1)+' °'+u;
    $('hum').textContent=Number(d.humidity).toFixed(0)+' %';
    $('pres').textContent=Number(d.pressure).toFixed(0)+' hPa';
    var wind=d.metric?(Number(d.windKmh).toFixed(1)+' km/h'):(Number(d.windMph).toFixed(1)+' mph');
    $('wind').textContent=wind+' '+((d.windDir||'')+' ('+Number(d.windDeg).toFixed(0)+'°)');
    $('clouds').textContent=Number(d.clouds).toFixed(0)+' %';
    $('uv').textContent=(d.uv==null||d.uv===undefined)?'-':Number(d.uv).toFixed(2);
    $('age').textContent=age(d.ageMs);
    $('knobs').textContent=(d.knobs||[]).map(function(v){return Number(v).toFixed(2)}).join(' · ');
  }else{
    $('temp').textContent=$('feels').textContent=$('hum').textContent='-';
    $('pres').textContent=$('wind').textContent=$('clouds').textContent=$('uv').textContent='-';
    $('age').textContent=d.error||'-';
    $('knobs').textContent='-';
  }
}
function poll(){
  fetch('/api/weather',{cache:'no-store'}).then(function(r){return r.json()}).then(fill)
    .catch(function(){$('st').textContent='offline'});
}
$('cfg').onsubmit=function(e){
  e.preventDefault();
  var body=new URLSearchParams();
  body.set('enabled',$('f-en').checked?'1':'0');
  body.set('clock',$('f-clock').checked?'1':'0');
  body.set('layout',$('f-layout').value);
  body.set('metric',$('f-units').value);
  body.set('tz',$('f-tz').value.trim()||'0');
  body.set('query',$('f-q').value.trim());
  body.set('lat',$('f-lat').value.trim());
  body.set('lon',$('f-lon').value.trim());
  if($('f-key').value)body.set('key',$('f-key').value);
  say('saving…');
  fetch('/api/weather/config',{method:'POST',body:body}).then(function(r){return r.json()}).then(function(d){
    cfgFilled=false;fill(d);$('f-key').value='';
    say(d.ok?'saved':'failed',d.ok?'good':'err');
  }).catch(function(){say('save failed','err')});
};
$('fetch').onclick=function(){
  say('fetching…');
  fetch('/api/weather/fetch',{method:'POST'}).then(function(r){return r.json()}).then(function(d){
    fill(d);say(d.hasData?'updated':(d.error||'failed'),d.hasData?'good':'err');
  }).catch(function(){say('fetch failed','err')});
};
$('activate').onclick=function(){
  fetch('/api/weather/activate',{method:'POST'}).then(function(r){return r.json()}).then(function(d){
    say(d.ok?'Weather pattern selected':(d.error||'failed'),d.ok?'good':'err');
  }).catch(function(){say('activate failed','err')});
};
$('forget').onclick=function(){
  if(!confirm('Clear API key and location from this device?'))return;
  fetch('/api/weather/forget',{method:'POST'}).then(function(r){return r.json()}).then(function(d){
    cfgFilled=false;fill(d);say('cleared','good');
  });
};
poll();setInterval(poll,15000);
document.addEventListener('visibilitychange',function(){
  if(!document.hidden)poll();
});
</script>
</body></html>
)HTML";
