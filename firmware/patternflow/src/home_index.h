// ═══════════════════════════════════════════════════════════
// PatternFlow - Device web console home (PROGMEM HTML bundle)
//
// Served at http://patternflow.local/ by core_audio_ws.h. A landing page
// with one ghost-numeral row per device feature:
//   01  AUDIO SYNC       → /audio   (audio_index.h)
//   02  FIRMWARE UPDATE  → /update  (web_update_index.h)
//   03  REMOTE COMPUTE   — placeholder, external computing link planned
//
// Styled to the patternflow.work design system (web/docs/
// patternflow-styleguide.html): cream + ink + one LED accent, thin rules,
// Pretendard wordmark, JetBrains Mono kickers, pf-row ghost numerals.
// Webfonts load from Google/jsDelivr exactly like the styleguide; on an
// offline LAN the system font stacks take over and nothing breaks.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include <pgmspace.h>

const char HOME_INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patternflow</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  @font-face{font-family:'Pretendard';font-weight:400;font-style:normal;font-display:swap;
    src:url('https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2') format('woff2')}
  @font-face{font-family:'Pretendard';font-weight:700;font-style:normal;font-display:swap;
    src:url('https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-Bold.woff2') format('woff2')}
  :root{--cream:#F4EFE6;--cream2:#EDE7DB;--ink:#141414;--muted:#6B655A;--faint:#A69F90;--ghost:#C9C2B0;--rule:#D9D1C0;--led:#E8552E;
        --sans:'Inter','Pretendard',ui-sans-serif,system-ui,sans-serif;
        --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
        --pretendard:'Pretendard',ui-sans-serif,system-ui,sans-serif}
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:var(--cream);color:var(--ink);
       font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;
       display:flex;align-items:center;justify-content:center;padding:72px 24px}
  .version-tag{position:fixed;top:24px;left:32px;z-index:40;font-family:var(--mono);font-size:10px;
       letter-spacing:.14em;text-transform:uppercase;color:var(--muted);pointer-events:none}
  .version-tag .dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--led);
       margin-right:8px;vertical-align:1px;box-shadow:0 0 6px var(--led)}
  .panel{width:100%;max-width:560px;background:#ffffff;padding:56px 48px 44px}
  h1{font-family:var(--pretendard);font-size:44px;font-weight:700;letter-spacing:-.035em;line-height:1;margin-bottom:10px}
  .kicker{font-family:var(--pretendard);font-size:20px;font-weight:400;letter-spacing:-.015em;margin-bottom:44px}
  .pf-kicker{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
       color:var(--muted);margin-bottom:6px}
  .pf-row{display:block;position:relative;padding:18px 96px 18px 0;border-bottom:1px solid var(--rule);
       color:var(--muted);text-decoration:none;overflow:hidden;transition:color .15s ease}
  .pf-row:first-of-type{border-top:1px solid var(--rule)}
  a.pf-row:hover{color:var(--ink)}
  a.pf-row:hover .pf-ghost{color:var(--ink)}
  .pf-ghost{position:absolute;right:-2px;top:50%;transform:translateY(-50%);color:var(--ghost);
       font-size:56px;font-weight:300;letter-spacing:-.04em;line-height:1;pointer-events:none;transition:color .15s ease}
  .pf-row-t{font-size:18px;font-weight:500;letter-spacing:-.01em;line-height:1.3;color:inherit}
  .pf-row-d{max-width:34ch;margin-top:3px;color:var(--muted);font-size:14px;line-height:1.45}
  .pf-row.soon,.pf-row.soon .pf-row-d{color:var(--faint)}
  .tag{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;
       border:1px solid var(--faint);color:var(--muted);padding:3px 8px 2px;margin-left:10px;vertical-align:2px}
  footer{margin-top:36px;display:flex;justify-content:space-between;gap:16px;
       font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
  footer a{color:var(--muted);text-decoration:none}
  footer a:hover{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
  @media(max-width:560px){body{padding:56px 16px}.panel{padding:40px 24px 36px}
       h1{font-size:36px}.kicker{font-size:18px;margin-bottom:36px}
       .pf-ghost{font-size:44px}.pf-row{padding-right:72px}}
</style></head><body>

<div class="version-tag"><span class="dot"></span>device &middot; <span id="ver">console</span></div>

<main class="panel">
  <h1>Patternflow</h1>
  <div class="kicker">Device console.</div>

  <span class="pf-kicker">Console</span>
  <nav>
    <a class="pf-row" href="/patterns">
      <span class="pf-ghost">01</span>
      <div class="pf-row-t">Patterns</div>
      <div class="pf-row-d">Drop in a pattern module &mdash; it appears in the list without reflashing.</div>
    </a>
    <a class="pf-row" href="/audio">
      <span class="pf-ghost">02</span>
      <div class="pf-row-t">Audio sync</div>
      <div class="pf-row-d">Stream music from this browser &mdash; four FFT bands drive the four knobs.</div>
    </a>
    <a class="pf-row" href="/status">
      <span class="pf-ghost">03</span>
      <div class="pf-row-t">Status</div>
      <div class="pf-row-d">Frame rate, memory, storage and network &mdash; what the device is actually doing.</div>
    </a>
    <a class="pf-row" href="/wifi">
      <span class="pf-ghost">04</span>
      <div class="pf-row-t">Wi-Fi</div>
      <div class="pf-row-d">Remember several networks &mdash; the device joins whichever one it finds.</div>
    </a>
    <a class="pf-row" href="/update">
      <span class="pf-ghost">05</span>
      <div class="pf-row-t">Firmware update</div>
      <div class="pf-row-d">Drop a .bin &mdash; the device flashes itself over the LAN and reboots.</div>
    </a>
    <div class="pf-row soon">
      <span class="pf-ghost">06</span>
      <div class="pf-row-t">Remote compute<span class="tag">Soon</span></div>
      <div class="pf-row-d">Link an external computer to drive patterns with more horsepower.</div>
    </div>
  </nav>

  <footer><span id="host"></span><a href="https://patternflow.work" target="_blank" rel="noopener">patternflow.work</a></footer>
</main>

<script>
document.getElementById('host').textContent=location.hostname;
fetch('/update/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){
  if(s.version)document.getElementById('ver').textContent='v'+s.version;
}).catch(function(){});
</script>
</body></html>
)HTML";
