// ═══════════════════════════════════════════════════════════
// PatternFlow - shared console chrome + theme (PROGMEM JS bundle)
//
// Served at /pf-console.js by core_audio_ws.h and loaded by every console
// page as one parser-blocking <script src> in <head>. One file owns the
// whole cross-page system; the pages themselves carry zero nav or theme
// markup:
//
//   1. THEME — reads localStorage 'pf-theme' and stamps data-theme=light
//      on <html> BEFORE first paint (parser-blocking => no dark flash),
//      then injects the html[data-theme=light]{...} variable overrides.
//      The block is the union of every page's palette family (console
//      --cream/--ink/..., home --bg/--ghost, audio --card/--fg/...);
//      variables a page does not define are inert.
//
//   2. CHROME — after DOM ready, mounts the same header band on every
//      page: brand (LED dot + Patternflow + optional #pfVer, which the
//      home page fills from /api/status), the nav, and the Light toggle.
//      The current page is highlighted by matching location.pathname, so
//      adding a page means editing the NAV table here — nowhere else.
//      (The old per-page copy-pasted <nav class="pfnav"> is how /show
//      went missing from half the console for a month.)
//
// Class names are pf-chrome / pf-cnav / pf-brand — deliberately NOT the
// legacy .pfnav, so any page CSS that still mentions .pfnav cannot leak
// into the shared chrome.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include <pgmspace.h>

const char PF_CONSOLE_JS[] PROGMEM = R"JS((function(){
var light=false;try{light=localStorage.getItem('pf-theme')==='light'}catch(e){}
if(light)document.documentElement.setAttribute('data-theme','light');
var st=document.createElement('style');
st.textContent='html[data-theme=light]{--cream:#F4EFE6;--cream2:#FFFCFA;--ink:#1A1814;--muted:#6B6558;--faint:#9A9486;--rule:#D9D1C2;--rule-soft:#E8E2D6;--led:#FF5C2E;--ok:#2F8A55;--warn:#B88120;--panel:#FFFCFA;--bg:#F4EFE6;--ghost:#E0D9CC;--card:#FFFCFA;--card2:#E8E2D6;--fg:#1A1814;--mut:#6B6558;--ln:#D9D1C2;--bad:#B8402E;--bar:#E0D9CC;--bar-on:#FF5C2E;--accent:#FF5C2E}'
+'.pf-chrome{border-bottom:1px solid var(--rule,#242118);background:var(--cream,var(--bg,#0C0B09))}'
+'.pf-chrome-in{max-width:1140px;margin:0 auto;display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;padding:13px 20px}'
+'.pf-brand{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono,ui-monospace,monospace);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#8A8272);text-decoration:none;white-space:nowrap}'
+'.pf-brand .pf-dot{width:5px;height:5px;border-radius:50%;background:var(--led,#FF5C2E);box-shadow:0 0 6px var(--led,#FF5C2E)}'
+'#pfVer{color:var(--faint,#5A5546);letter-spacing:.08em}'
+'.pf-cnav{display:flex;flex-wrap:wrap;gap:6px 13px;font-family:var(--mono,ui-monospace,monospace);font-size:11px;letter-spacing:.04em}'
+'.pf-cnav a{color:var(--faint,#5A5546);text-decoration:none}'
+'.pf-cnav a:hover{color:var(--led,#FF5C2E)}'
+'.pf-cnav a.here{color:var(--ink,var(--fg,#EDE7DB))}'
+'.pf-theme{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-family:var(--mono,ui-monospace,monospace);font-size:11px;letter-spacing:.04em;color:var(--faint,#9A9486);cursor:pointer;user-select:none;white-space:nowrap}'
+'.pf-theme input{accent-color:var(--led,#FF5C2E);margin:0}';
(document.head||document.documentElement).appendChild(st);
function mount(){
if(document.getElementById('pfChrome'))return;
// path, label, and the capability the page needs (null = always there).
// Features live in addons now, so a build may genuinely not have /show or
// /mqtt — linking to them anyway hands people a 404 and makes the device
// look broken. /api/status lists what is actually loaded.
var NAV=[['/','Console',null],['/patterns','Patterns',null],
['/show','Sequences','shows'],['/audio','Audio','audio'],
['/status','Status',null],['/wifi','Wi-Fi',null],
['/mqtt','MQTT','mqtt'],['/weather','Weather','weather'],
['/update','Update',null]];
var p=location.pathname.replace(/\/+$/,'')||'/';
var h=document.createElement('header');h.className='pf-chrome';h.id='pfChrome';
var m='<div class="pf-chrome-in"><a class="pf-brand" href="/"><span class="pf-dot"></span>Patternflow <span id="pfVer"></span></a><nav class="pf-cnav">';
function navLink(e){return '<a href="'+e[0]+'"'+(p===e[0]?' class="here"':'')+'>'+e[1]+'</a>'}
// Draw the unconditional pages now; the rest join when caps arrive, so
// the header never sits empty waiting on a request.
for(var i=0;i<NAV.length;i++)if(!NAV[i][2])m+=navLink(NAV[i]);
m+='</nav><label class="pf-theme"><input type="checkbox" id="pfTheme"> Light</label></div>';
h.innerHTML=m;
document.body.insertBefore(h,document.body.firstChild);
// Fill in the capability-gated links. Failing quietly is deliberate: an
// unreachable device should not also lose the pages that do work.
fetch('/api/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
var caps=d.caps||[];var nav=h.querySelector('.pf-cnav');if(!nav)return;
var html='';
for(var i=0;i<NAV.length;i++){
var e=NAV[i];
if(e[2]&&caps.indexOf(e[2])<0)continue;
html+=navLink(e);
}
nav.innerHTML=html;
var v=document.getElementById('pfVer');
if(v&&d.version)v.textContent='v'+d.version;
// One status fetch, shared. A page that needs to know what this build
// actually has — the home page hides rows for absent features — listens
// for this rather than asking again. window.pfStatus covers a listener
// that registered after the fetch already landed.
window.pfStatus=d;
document.dispatchEvent(new CustomEvent('pf-status',{detail:d}));
}).catch(function(){});

var c=document.getElementById('pfTheme');
c.checked=document.documentElement.getAttribute('data-theme')==='light';
c.onchange=function(){var on=c.checked;
document.documentElement.setAttribute('data-theme',on?'light':'dark');
try{localStorage.setItem('pf-theme',on?'light':'dark')}catch(e){}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);
else mount();
})();
)JS";
