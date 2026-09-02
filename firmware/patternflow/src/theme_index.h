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
// A variant's name, in the LED colour, on every page. Buried in a footer
// it answered a question nobody thought to ask; the point of the badge is
// that somebody who did not flash this panel themselves can tell what it
// is running without going looking. Core shows nothing — it is the
// default and a badge on every panel would say nothing.
+'#pfVariant{display:none;align-items:center;padding:1px 6px;border:1px solid var(--led,#FF5C2E);border-radius:2px;color:var(--led,#FF5C2E);letter-spacing:.1em;text-decoration:none}'
+'#pfVariant:hover{background:var(--led,#FF5C2E);color:var(--cream,var(--bg,#0C0B09))}'
+'.pf-cnav{display:flex;flex-wrap:wrap;gap:6px 13px;font-family:var(--mono,ui-monospace,monospace);font-size:11px;letter-spacing:.04em}'
+'.pf-cnav a{color:var(--faint,#5A5546);text-decoration:none}'
+'.pf-cnav a:hover{color:var(--led,#FF5C2E)}'
+'.pf-cnav a.here{color:var(--ink,var(--fg,#EDE7DB))}'
+'.pf-theme{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-family:var(--mono,ui-monospace,monospace);font-size:11px;letter-spacing:.04em;color:var(--faint,#9A9486);cursor:pointer;user-select:none;white-space:nowrap}'
+'.pf-theme input{accent-color:var(--led,#FF5C2E);margin:0}';
(document.head||document.documentElement).appendChild(st);
function mount(){
if(document.getElementById('pfChrome'))return;
// The core's own pages, and only those. Feature pages are not listed here:
// this file used to name /show, /mqtt and /weather, which meant a core file
// knowing three optional features by path and label. They arrive from
// /api/status featureNav now, contributed by whichever features are loaded, so
// a page the core has never heard of still gets a link and a build without
// it still gets a header that is right.
var NAV=[['/','Console'],['/patterns','Patterns'],
['/status','Status'],['/wifi','Wi-Fi'],['/update','Update']];
// Where a feature's links are spliced in: after Patterns, before Status, which
// is where Sequences sat when it was hard-coded.
var NAV_AT=2;
var p=location.pathname.replace(/\/+$/,'')||'/';
var h=document.createElement('header');h.className='pf-chrome';h.id='pfChrome';
var m='<div class="pf-chrome-in"><a class="pf-brand" href="/"><span class="pf-dot"></span>Patternflow <span id="pfVer"></span></a>'
+'<a id="pfVariant" class="pf-brand" target="_blank" rel="noopener"></a>'
+'<nav class="pf-cnav">';
function navLink(e){return '<a href="'+e[0]+'"'+(p===e[0]?' class="here"':'')+'>'+e[1]+'</a>'}
// Draw the core's pages now; feature links join when /api/status answers, so
// the header never sits empty waiting on a request.
for(var i=0;i<NAV.length;i++)m+=navLink(NAV[i]);
m+='</nav><label class="pf-theme"><input type="checkbox" id="pfTheme"> Light</label></div>';
h.innerHTML=m;
document.body.insertBefore(h,document.body.firstChild);
// Fill in the capability-gated links. Failing quietly is deliberate: an
// unreachable device should not also lose the pages that do work.
fetch('/api/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
var nav=h.querySelector('.pf-cnav');if(!nav)return;
// Splice whatever the device says it serves into the core's list. No caps
// check: a feature that reported a nav entry IS loaded, so there is nothing
// left to gate on - the check existed only because the paths were guesses
// written into this file.
var all=NAV.slice();
var extra=d.featureNav||[];
for(var i=0;i<extra.length;i++){
if(!extra[i]||extra[i].length<2)continue;
all.splice(NAV_AT+i,0,extra[i]);
}
var html='';
for(i=0;i<all.length;i++)html+=navLink(all[i]);
nav.innerHTML=html;
var v=document.getElementById('pfVer');
// On a variant the badge carries its own version, so this one has to say
// whose it is — unlabelled, it reads as the variant's and is wrong.
if(v&&d.version)v.textContent=(d.variant&&d.variant!=='core'?'core v':'v')+d.version;
// Only a variant gets a badge, and it links to its own entry on the
// shelf so the name is a way in rather than a label.
var vb=document.getElementById('pfVariant');
if(vb&&d.variant&&d.variant!=='core'){
vb.textContent=d.variant+(d.variantVersion?' '+d.variantVersion:'');
vb.href='https://patternflow.work/variants#'+encodeURIComponent(d.variant);
vb.style.display='inline-flex';
}
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
// Every link from here to the site carries this panel's address, so the site
// can point "send to my panel" straight at it and stop depending on
// patternflow.local resolving on that phone. Done at click time, because
// pages set some of these hrefs after status arrives.
document.addEventListener('click',function(e){
var t=e.target;var a=t&&t.closest?t.closest('a[href]'):null;if(!a)return;
if(!/^https:\/\/([a-z0-9-]+\.)*patternflow\.work([\/?#]|$)/.test(a.href))return;
var ip=(window.pfStatus&&window.pfStatus.ip)||location.hostname;if(!ip)return;
try{var u=new URL(a.href);if(!u.searchParams.has('device')){u.searchParams.set('device',ip);a.href=u.toString();}}catch(x){}
},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);
else mount();
})();
)JS";
