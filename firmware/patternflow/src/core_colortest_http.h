// ═══════════════════════════════════════════════════════════
// PatternFlow - Colour pipeline A/B page  (TEMPORARY)
//
//   GET /colortest                     the page
//   GET /api/color                     current calibration
//   GET /api/color?gr=..&wr=..&sat=..  set it, rebuild the LUTs
//
// Exists to answer one question by eye rather than by argument: is the
// device's colour correction still helping now that Pattern Lab can set
// colour precisely?
//
// The driver already applies a CIE1931 curve (lumConvTab, ~2.44). The
// calibration here lands on top. Measured end to end with the stock values,
// mid-grey (128) reaches the panel at 2.2 % instead of 18.6 %, and full white
// is capped at 81 % — an effective exponent of 5.5. That is a lot of the
// author's intent being overwritten downstream of them.
//
// DELETE THIS FILE once the question is settled — fold the answer into the
// defaults in config.h and drop the endpoints.
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "../net_config.h"

#ifndef PF_COLORTEST_HTTP_ENABLED
#define PF_COLORTEST_HTTP_ENABLED 1
#endif

#if PF_COLORTEST_HTTP_ENABLED
#include <WebServer.h>
#include <WiFi.h>

// Owned by the sketch; the panel's PWM scale, persisted in NVS by K1 longpress.
extern uint8_t currentBrightness;

namespace PatternflowColorTestHttp {

inline WebServer& server() { return PatternflowStatusHttp::server(); }
inline bool initialized = false;

static const char COLORTEST_HTML[] PROGMEM = R"HTML(<!doctype html>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Colour pipeline</title>
<style>
body{font:13px/1.6 system-ui,sans-serif;margin:16px;background:#111;color:#eee}
h1{font-size:15px;margin:0 0 4px}p{color:#999;margin:0 0 12px;max-width:60ch}
input{width:62px;background:#222;color:#eee;border:1px solid #444;border-radius:4px;padding:3px}
button{background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:5px;padding:5px 11px;cursor:pointer;margin:2px}
button:hover{background:#383838}
button.p{background:#1d3a1d;border-color:#3a6a3a}
table{border-collapse:collapse;margin:10px 0}td{padding:3px 8px 3px 0}
.n{color:#666}b{color:#6c6}
</style>
<h1>Colour pipeline</h1>
<p>The driver already applies its own CIE1931 curve, and everything below lands <b>on top of that</b>. Passthrough is the standard pipeline: editor colours are sRGB, the panel is linear PWM, and that curve is exactly the conversion between them.</p>
<p>Reach for the right control. <b>Too bright overall &rarr; brightness</b>, which scales PWM without bending colour. <b>Highlights collapsing to white &rarr; saturation</b>. <b>A colour cast &rarr; white balance</b>. Gamma is the driver's job and almost never yours. <span class=n>Nothing here is saved; a reboot restores config.h and the stored brightness.</span></p>
<table>
<tr><td>Gamma<td>R <input id=gr><td>G <input id=gg><td>B <input id=gb></tr>
<tr><td>White bal.<td>R <input id=wr><td>G <input id=wg><td>B <input id=wb></tr>
<tr><td>Saturation<td colspan=3><input id=sat></tr>
<tr><td>Brightness<td colspan=3><input id=bri> <span class=n>5-255, the panel's own PWM scale</span></tr>
</table>
<p>
<button onclick=save()>Apply</button>
<button class=p onclick="preset(1,1,1)">Passthrough (driver curve only)</button>
<button onclick="preset(2.4,1,1)">Gamma 2.4, no WB/sat</button>
<button onclick=restore()>config.h defaults</button>
</p>
<p><span class=n>brightness:</span>
<button onclick="bright(255)">100%</button>
<button onclick="bright(204)">80%</button>
<button onclick="bright(153)">60%</button>
<button onclick="bright(102)">40%</button>
<button onclick="bright(51)">20%</button>
</p>
<p id=eff class=n></p>
<script>
const F=['gr','gg','gb','wr','wg','wb','sat','bri'];
async function load(){
  const d=await(await fetch('/api/color')).json();
  F.forEach(f=>{const e=document.getElementById(f);
    if(document.activeElement!==e)e.value=d[f];});
  document.getElementById('eff').textContent=
    `now: gamma ${d.gr}/${d.gg}/${d.gb} · wb ${d.wr}/${d.wg}/${d.wb} · sat ${d.sat}`;
}
async function save(){
  const q=F.map(f=>f+'='+document.getElementById(f).value).join('&');
  await fetch('/api/color?'+q); load();
}
async function preset(g,w,s){
  await fetch(`/api/color?gr=${g}&gg=${g}&gb=${g}&wr=${w}&wg=${w}&wb=${w}&sat=${s}`); load();
}
async function bright(v){ await fetch('/api/color?bri='+v); load(); }
async function restore(){ await fetch('/api/color?reset=1'); load(); }
load();
</script>)HTML";

inline void handleApi() {
  bool changed = false;

  if (server().hasArg("bri")) {
    int b = server().arg("bri").toInt();
    if (b < 5) b = 5;
    if (b > 255) b = 255;
    currentBrightness = (uint8_t)b;
    dma_display->setBrightness8(currentBrightness);
    Serial.printf(">>> COLOR: brightness %u\n", currentBrightness);
  }

  if (server().hasArg("reset")) {
    PFCanvas::calGammaR = LED_GAMMA_R; PFCanvas::calGammaG = LED_GAMMA_G;
    PFCanvas::calGammaB = LED_GAMMA_B; PFCanvas::calWbR = LED_WB_R;
    PFCanvas::calWbG = LED_WB_G;       PFCanvas::calWbB = LED_WB_B;
    PFCanvas::calSat = LED_SAT_BOOST;
    changed = true;
  } else {
    struct { const char* k; float* v; } f[] = {
      {"gr", &PFCanvas::calGammaR}, {"gg", &PFCanvas::calGammaG}, {"gb", &PFCanvas::calGammaB},
      {"wr", &PFCanvas::calWbR},    {"wg", &PFCanvas::calWbG},    {"wb", &PFCanvas::calWbB},
      {"sat", &PFCanvas::calSat},
    };
    for (auto& e : f) {
      if (!server().hasArg(e.k)) continue;
      float v = server().arg(e.k).toFloat();
      // A gamma of 0 would make every value 1.0 and a negative one is
      // meaningless; clamp rather than hand powf something it cannot use.
      if (v < 0.01f) v = 0.01f;
      if (v > 8.0f) v = 8.0f;
      *e.v = v;
      changed = true;
    }
  }

  if (changed) {
    PFCanvas::buildGammaLUT();
    Serial.printf(">>> COLOR: gamma %.2f/%.2f/%.2f  wb %.2f/%.2f/%.2f  sat %.2f\n",
                  PFCanvas::calGammaR, PFCanvas::calGammaG, PFCanvas::calGammaB,
                  PFCanvas::calWbR, PFCanvas::calWbG, PFCanvas::calWbB, PFCanvas::calSat);
  }

  char buf[224];
  snprintf(buf, sizeof(buf),
           "{\"gr\":%.2f,\"gg\":%.2f,\"gb\":%.2f,"
           "\"wr\":%.2f,\"wg\":%.2f,\"wb\":%.2f,\"sat\":%.2f,\"bri\":%u}",
           PFCanvas::calGammaR, PFCanvas::calGammaG, PFCanvas::calGammaB,
           PFCanvas::calWbR, PFCanvas::calWbG, PFCanvas::calWbB, PFCanvas::calSat,
           currentBrightness);
  server().sendHeader("Cache-Control", "no-store");
  server().send(200, "application/json", buf);
}

inline void handleIndex() {
  server().sendHeader("Cache-Control", "no-store");
  server().send_P(200, "text/html", COLORTEST_HTML);
}

inline void begin() {
  if (initialized) return;
  if (WiFi.status() != WL_CONNECTED) return;

  server().on("/colortest", HTTP_GET, handleIndex);
  server().on("/api/color", HTTP_GET, handleApi);

  initialized = true;
  Serial.printf("[COLORTEST] Ready - http://%s.local/colortest\n", PF_OTA_HOSTNAME);
}

}  // namespace PatternflowColorTestHttp

#else   // PF_COLORTEST_HTTP_ENABLED

namespace PatternflowColorTestHttp {
inline void begin() {}
}

#endif  // PF_COLORTEST_HTTP_ENABLED
