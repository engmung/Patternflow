// ═══════════════════════════════════════════════════════════
// PatternFlow - the clock face: a wall clock composed over the running pattern
//
// What time it is comes from the core (src/core_clock.h: NTP, one cached
// reading per 500 ms). This file is everything a person decides about
// showing it, and the drawing itself.
//
// It draws on the frame's way to the panel (the composeFrame hook), not on
// the panel after the fact: the pattern's finished canvas is copied to a
// scratch buffer, the clock is blended into the copy with real alpha, and
// the copy is what gets blitted. The canvas is never written - patterns that
// accumulate across frames own it.
//
// Four styles:
//   overlay   anti-aliased digits (Inter Bold, rasterised offline into
//             clock_glyphs.h) with a soft drop shadow; three sizes
//   digital   seven-segment digits drawn as rectangles, sized to the panel
//   clip      the pattern shows only INSIDE huge digits - hours over minutes
//             on an upright panel, four across on a wide one; outside them
//             the frame is black, or dimmed to a chosen level; the minute
//             change crossfades
//   inverse   the same mask the other way round: digits cut out of the pattern
//
// Orientation is a quarter-turn count. 1 is upright - the panel stood on
// end, the way its own menus read - and the default; 0 is the wide way.
//
// The zone is a POSIX TZ string, which is what the C library reads and the
// only form that carries a DST rule; the weather page's UTC offset in
// minutes cannot say when summer time starts. On first boot the offset a
// panel already had there is read (never written) as the starting zone.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once
#include "clock_config.h"

#include <Arduino.h>
#include <Preferences.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "../../src/core_clock.h"
#include "../../src/core_mem.h"
#include "../../src/core_ui_text.h"     // the chrome font, for the date line
#include "../../presets/preset_calib.h" // the test card owns the panel while it is up
#include "../pf_feature.h"
#include "clock_glyphs.h"

namespace PatternflowClockFace {

constexpr size_t TZ_BYTES = 48;
constexpr const char* NVS_NS = "pfclock";

enum Pos : uint8_t { TopLeft = 0, TopRight = 1, BottomLeft = 2, BottomRight = 3, Center = 4 };
enum Size : uint8_t { Small = 0, Medium = 1, Large = 2 };
enum Style : uint8_t { Overlay = 0, Digital = 1, Clip = 2, ClipInverse = 3 };

// ── Settings ─────────────────────────────────────────────────────────────
inline bool enabled = false;
inline char tz[TZ_BYTES] = PF_CLOCK_DEFAULT_TZ;
inline uint8_t style = Overlay;
inline uint8_t size = Small;
inline uint8_t pos = TopRight;
inline uint8_t rotation = 1;  // quarter turns; 1 = upright, the default
inline bool showSeconds = false;
inline bool twelveHour = false;
inline bool showDate = false;
inline bool blinkColon = false;
inline uint8_t inkR = 245, inkG = 245, inkB = 245;
inline uint8_t ink2R = 255, ink2G = 92, ink2B = 46;
inline bool gradient = false;
inline uint8_t dimPct = 0;   // clip: how bright the outside stays, 0..100
inline bool fade = true;     // clip: crossfade the minute change

// Bumped by whoever changes a setting, so a cached mask is rebuilt.
inline uint32_t layoutEpoch = 0;

inline uint32_t packRGB(uint8_t r, uint8_t g, uint8_t b) {
  return ((uint32_t)r << 16) | ((uint32_t)g << 8) | b;
}
inline uint32_t inkPacked() { return packRGB(inkR, inkG, inkB); }
inline uint32_t ink2Packed() { return packRGB(ink2R, ink2G, ink2B); }
inline void setInkPacked(uint32_t v) {
  inkR = (uint8_t)(v >> 16);
  inkG = (uint8_t)(v >> 8);
  inkB = (uint8_t)v;
}
inline void setInk2Packed(uint32_t v) {
  ink2R = (uint8_t)(v >> 16);
  ink2G = (uint8_t)(v >> 8);
  ink2B = (uint8_t)v;
}

#if PF_CLOCK_ENABLED

// A UTC offset in minutes → the POSIX string that means the same thing. The
// sign inverts: POSIX counts hours WEST of Greenwich, so UTC+9 is "UTC-9".
inline void posixFromOffsetMinutes(int32_t minutesEast, char* out, size_t n) {
  int32_t m = -minutesEast;
  char sign = m < 0 ? '-' : '+';
  if (m < 0) m = -m;
  if (m % 60) snprintf(out, n, "UTC%c%d:%02d", sign, (int)(m / 60), (int)(m % 60));
  else snprintf(out, n, "UTC%c%d", sign, (int)(m / 60));
}

inline void loadConfig() {
  Preferences p;
  bool haveOwn = false;
  if (p.begin(NVS_NS, true)) {
    haveOwn = p.isKey("tz");
    enabled = p.getBool("on", false);
    if (haveOwn) p.getString("tz", tz, sizeof(tz));
    style = p.getUChar("style", Overlay);
    size = p.getUChar("size", Small);
    pos = p.getUChar("pos", TopRight);
    rotation = p.getUChar("rot", 1);
    showSeconds = p.getBool("sec", false);
    twelveHour = p.getBool("h12", false);
    showDate = p.getBool("date", false);
    blinkColon = p.getBool("blink", false);
    setInkPacked(p.getUInt("ink", 0xF5F5F5));
    setInk2Packed(p.getUInt("ink2", 0xFF5C2E));
    gradient = p.getBool("grad", false);
    dimPct = p.getUChar("dim", 0);
    fade = p.getBool("fade", true);
    p.end();
  }
  if (!haveOwn) {
    // First boot with this feature: inherit the zone the weather page may
    // have set, so a panel that told weather it is in Rome does not wake up
    // in UTC. Read only — that key belongs to weather, and a composition
    // without weather simply finds nothing here.
    Preferences old;
    if (old.begin("patternflow", true)) {
      int32_t wxTz = old.getInt("wx_tz", 0);
      if (wxTz != 0) posixFromOffsetMinutes(wxTz, tz, sizeof(tz));
      old.end();
    }
  }
  if (style > ClipInverse) style = Overlay;
  if (size > Large) size = Small;
  if (pos > Center) pos = TopRight;
  if (dimPct > 100) dimPct = 100;
  rotation &= 3;
  layoutEpoch++;
}

inline void saveConfig() {
  Preferences p;
  if (!p.begin(NVS_NS, false)) return;
  p.putBool("on", enabled);
  p.putString("tz", tz);
  p.putUChar("style", style);
  p.putUChar("size", size);
  p.putUChar("pos", pos);
  p.putUChar("rot", rotation);
  p.putBool("sec", showSeconds);
  p.putBool("h12", twelveHour);
  p.putBool("date", showDate);
  p.putBool("blink", blinkColon);
  p.putUInt("ink", inkPacked());
  p.putUInt("ink2", ink2Packed());
  p.putBool("grad", gradient);
  p.putUChar("dim", dimPct);
  p.putBool("fade", fade);
  p.end();
  layoutEpoch++;
}

// Set the zone, start (or restart) NTP against it.
inline void setTimezone(const char* posix) {
  if (!posix || !posix[0]) return;
  snprintf(tz, sizeof(tz), "%s", posix);
  PatternflowClock::beginSyncTz(tz);
}

// The clock owns the zone. Cheap, once a second from the loop hook: if
// anything else has set TZ (weather's save does), put it back — without
// restarting NTP, which assertTz does not touch.
inline uint32_t lastAssertMs = 0;
inline void assertZone() {
  uint32_t now = millis();
  if (now - lastAssertMs < PF_CLOCK_ASSERT_MS) return;
  lastAssertMs = now;
  PatternflowClock::assertTz(tz);
}

inline bool synced() { return PatternflowClock::synced(); }

// What the loop hook saw this frame; compose runs inside the pattern's
// draw() and has no frame of its own.
inline bool chromeUp = false;
inline bool running = true;
inline void noteFrame(const PFFeatureFrame& f) {
  chromeUp = f.chromeVisible;
  running = f.running;
}

// ── The glyph blob ───────────────────────────────────────────────────────
// Layout in build_clock_glyphs.py. Read straight out of flash: on the
// ESP32-S3 a PROGMEM array is ordinary memory.
struct GlyphSet {
  uint8_t h, w, cw, gap;
  uint16_t off;
};
constexpr int COLON = 10;

inline int setCount() { return CLOCK_GLYPHS[4]; }
inline GlyphSet glyphSet(int i) {
  const uint8_t* p = CLOCK_GLYPHS + 5 + 6 * i;
  return {p[0], p[1], p[2], p[3], (uint16_t)(p[4] | ((uint16_t)p[5] << 8))};
}
inline int cellWidth(const GlyphSet& g, int glyph) { return glyph == COLON ? g.cw : g.w; }
inline uint8_t glyphAlpha4(const GlyphSet& g, int glyph, int x, int y) {
  const int digitBytes = g.h * ((g.w + 1) >> 1);
  const int rb = (cellWidth(g, glyph) + 1) >> 1;
  const uint8_t* cell = CLOCK_GLYPHS + g.off + (glyph < COLON ? glyph * digitBytes : 10 * digitBytes);
  uint8_t v = cell[y * rb + (x >> 1)];
  return (x & 1) ? (v & 15) : (v >> 4);
}

// The sets sorted as the generator emits them: Inter S, M, L, then the two
// condensed sets meant for the clip styles. "The largest that fits" walks
// them all by height.
inline const GlyphSet* setForSize(uint8_t sz) {
  static GlyphSet cache[8];
  static bool cached = false;
  if (!cached) {
    int n = setCount();
    for (int i = 0; i < n && i < 8; i++) cache[i] = glyphSet(i);
    cached = true;
  }
  int i = sz == Small ? 0 : (sz == Medium ? 1 : 2);
  if (i >= setCount()) i = setCount() - 1;
  return &cache[i];
}

// ── Geometry ─────────────────────────────────────────────────────────────
// Everything below lays out in VIRTUAL space - the panel as the viewer sees
// it after `rotation` quarter turns - and maps each pixel to the native
// frame at the last moment. Same convention as Adafruit GFX setRotation, so
// 1 is what the weather clock and the device's own menus call upright.
inline int nativeW = 0, nativeH = 0;
inline int vW = 0, vH = 0;

inline int nativeIndex(int vx, int vy) {
  int x, y;
  switch (rotation & 3) {
    case 0: x = vx; y = vy; break;
    case 1: x = nativeW - 1 - vy; y = vx; break;
    case 2: x = nativeW - 1 - vx; y = nativeH - 1 - vy; break;
    default: x = vy; y = nativeH - 1 - vx; break;
  }
  if (x < 0 || y < 0 || x >= nativeW || y >= nativeH) return -1;
  return y * nativeW + x;
}

inline void setGeometry(int w, int h) {
  nativeW = w;
  nativeH = h;
  if (rotation & 1) {
    vW = h;
    vH = w;
  } else {
    vW = w;
    vH = h;
  }
}

inline void placeBlock(int bw, int bh, int* x, int* y) {
  const int m = 2;
  switch (pos) {
    case TopLeft: *x = m; *y = m; break;
    case TopRight: *x = vW - bw - m; *y = m; break;
    case BottomLeft: *x = m; *y = vH - bh - m; break;
    case BottomRight: *x = vW - bw - m; *y = vH - bh - m; break;
    default: *x = (vW - bw) / 2; *y = (vH - bh) / 2; break;
  }
  if (*x < 0) *x = 0;
  if (*y < 0) *y = 0;
}

// ── Painting into the scratch frame ──────────────────────────────────────
inline uint8_t* scratch = nullptr;

inline void blendPx(int vx, int vy, uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
  if (!a) return;
  int i = nativeIndex(vx, vy);
  if (i < 0) return;
  uint8_t* p = scratch + i * 3;
  if (a == 255) {
    p[0] = r;
    p[1] = g;
    p[2] = b;
    return;
  }
  const uint16_t ia = 255 - a;
  p[0] = (uint8_t)((p[0] * ia + r * a + 127) / 255);
  p[1] = (uint8_t)((p[1] * ia + g * a + 127) / 255);
  p[2] = (uint8_t)((p[2] * ia + b * a + 127) / 255);
}

// The ink at a virtual row: flat, or a top-to-bottom gradient across the
// block being drawn.
inline int gradTop = 0, gradH = 1;
inline void inkAt(int vy, uint8_t* r, uint8_t* g, uint8_t* b) {
  if (!gradient || gradH <= 1) {
    *r = inkR; *g = inkG; *b = inkB;
    return;
  }
  int t = (vy - gradTop) * 255 / (gradH - 1);
  if (t < 0) t = 0;
  if (t > 255) t = 255;
  *r = (uint8_t)((inkR * (255 - t) + ink2R * t) / 255);
  *g = (uint8_t)((inkG * (255 - t) + ink2G * t) / 255);
  *b = (uint8_t)((inkB * (255 - t) + ink2B * t) / 255);
}

// One glyph cell. Pass 0 lays the shadow (black, offset, softened), pass 1
// the ink - two passes over the whole string so a neighbour's shadow never
// darkens a digit already inked.
inline void paintGlyph(const GlyphSet& g, int glyph, int x, int y, int pass) {
  const int w = cellWidth(g, glyph);
  for (int yy = 0; yy < g.h; yy++) {
    for (int xx = 0; xx < w; xx++) {
      uint8_t a4 = glyphAlpha4(g, glyph, xx, yy);
      if (!a4) continue;
      uint8_t a = (uint8_t)(a4 * 17);
      if (pass == 0) {
        blendPx(x + xx + 1, y + yy + 1, 0, 0, 0, (uint8_t)((a * 3) / 4));
        blendPx(x + xx, y + yy + 1, 0, 0, 0, (uint8_t)(a / 3));
        blendPx(x + xx + 1, y + yy, 0, 0, 0, (uint8_t)(a / 3));
      } else {
        uint8_t r, gg, b;
        inkAt(y + yy, &r, &gg, &b);
        blendPx(x + xx, y + yy, r, gg, b, a);
      }
    }
  }
}

// A line of the chrome font (TomThumb) for the date - the same glyph walk
// core_ui_text.h does, plotted through the blend so it lands in the scratch
// frame under the same rotation as the digits.
inline int gfxAdvance(const GFXfont* f, const char* s) {
  const uint8_t first = pgm_read_byte(&f->first), last = pgm_read_byte(&f->last);
  const GFXglyph* glyphs = (const GFXglyph*)pgm_read_ptr(&f->glyph);
  int adv = 0;
  for (const uint8_t* p = (const uint8_t*)s; *p; ++p) {
    if (*p < first || *p > last) continue;
    adv += (int)pgm_read_byte(&glyphs[*p - first].xAdvance);
  }
  return adv;
}
inline int gfxHeight(const GFXfont* f) { return (int)pgm_read_byte(&f->yAdvance) - 1; }

inline void paintGfxText(const GFXfont* f, const char* s, int x, int yTop, int pass) {
  const uint8_t first = pgm_read_byte(&f->first), last = pgm_read_byte(&f->last);
  const GFXglyph* glyphs = (const GFXglyph*)pgm_read_ptr(&f->glyph);
  const uint8_t* bitmap = (const uint8_t*)pgm_read_ptr(&f->bitmap);
  const int baseline = yTop + (int)pgm_read_byte(&f->yAdvance) - 1;
  int cx = x;
  for (const uint8_t* p = (const uint8_t*)s; *p; ++p) {
    if (*p < first || *p > last) continue;
    const GFXglyph* gl = &glyphs[*p - first];
    uint16_t bo = pgm_read_word(&gl->bitmapOffset);
    uint8_t w = pgm_read_byte(&gl->width), h = pgm_read_byte(&gl->height);
    int8_t xo = (int8_t)pgm_read_byte(&gl->xOffset), yo = (int8_t)pgm_read_byte(&gl->yOffset);
    uint8_t bits = 0, bit = 0;
    for (uint8_t yy = 0; yy < h; yy++) {
      for (uint8_t xx = 0; xx < w; xx++) {
        if (!(bit++ & 7)) bits = pgm_read_byte(&bitmap[bo++]);
        if (bits & 0x80) {
          const int px = cx + xo + xx, py = baseline + yo + yy;
          if (pass == 0) blendPx(px + 1, py + 1, 0, 0, 0, 190);
          else {
            uint8_t r, g, b;
            inkAt(py, &r, &g, &b);
            blendPx(px, py, r, g, b, 255);
          }
        }
        bits <<= 1;
      }
    }
    cx += (int)pgm_read_byte(&gl->xAdvance);
  }
}

// ── Text ─────────────────────────────────────────────────────────────────
inline int displayHour(const struct tm& t) {
  int h = t.tm_hour;
  if (twelveHour) {
    h %= 12;
    if (h == 0) h = 12;
  }
  return h;
}

inline void formatTime(const struct tm& t, char* out, size_t n) {
  if (showSeconds) snprintf(out, n, "%02d:%02d:%02d", displayHour(t), t.tm_min, t.tm_sec);
  else snprintf(out, n, "%02d:%02d", displayHour(t), t.tm_min);
}

inline void formatDate(const struct tm& t, char* out, size_t n) {
  // "Thu Sep 04" - C locale, ten characters, 40 px in the chrome font.
  strftime(out, n, "%a %b %d", &t);
}

// Width of a digits-and-colons string in a set, gaps included.
inline int glyphLineWidth(const GlyphSet& g, const char* s) {
  int w = 0, n = 0;
  for (const char* p = s; *p; ++p) {
    if (*p == ':') w += g.cw;
    else if (*p >= '0' && *p <= '9') w += g.w;
    else continue;
    n++;
  }
  if (n > 1) w += (n - 1) * g.gap;
  return w;
}

inline void paintGlyphLine(const GlyphSet& g, const char* s, int x, int y, int pass) {
  int cx = x;
  for (const char* p = s; *p; ++p) {
    int glyph;
    if (*p == ':') glyph = COLON;
    else if (*p >= '0' && *p <= '9') glyph = *p - '0';
    else continue;
    paintGlyph(g, glyph, cx, y, pass);
    cx += cellWidth(g, glyph) + g.gap;
  }
}

// ── Style: overlay ───────────────────────────────────────────────────────
inline void composeOverlay(const struct tm& t) {
  char line[12];
  formatTime(t, line, sizeof(line));
  char date[16] = {};
  if (showDate) formatDate(t, date, sizeof(date));

  // The chosen size, or the next one down until the line fits the panel.
  const GlyphSet* g = setForSize(size);
  int tw = glyphLineWidth(*g, line);
  for (uint8_t s = size; tw > vW - 4 && s > Small; s--) {
    g = setForSize((uint8_t)(s - 1));
    tw = glyphLineWidth(*g, line);
  }
  const int th = g->h;

  const GFXfont* df = PF_UI_FONT_CHROME;
  const int dw = showDate && df ? gfxAdvance(df, date) : 0;
  const int dh = showDate && df ? gfxHeight(df) : 0;
  const int bw = tw > dw ? tw : dw;
  const int bh = th + (showDate ? dh + 2 : 0);
  int x, y;
  placeBlock(bw, bh, &x, &y);
  gradTop = y;
  gradH = bh;

  for (int pass = 0; pass < 2; pass++) {
    paintGlyphLine(*g, line, x + (bw - tw) / 2, y, pass);
    if (showDate && df) paintGfxText(df, date, x + (bw - dw) / 2, y + th + 2, pass);
  }
}

// ── Style: digital (seven-segment) ───────────────────────────────────────
struct SegGeom {
  int dw, dh, t, gap, colon;
};

inline SegGeom segGeomFor(int digits, int colons, int maxW, int maxH) {
  int best = 3;
  for (int dw = 3; dw < 64; dw++) {
    int t = (dw + 2) / 5;
    if (t < 1) t = 1;
    int gap = dw / 6;
    if (gap < 1) gap = 1;
    int width = digits * dw + colons * t + (digits + colons - 1) * gap;
    int dh = 2 * dw - t;
    if (width > maxW || dh > maxH) break;
    best = dw;
  }
  SegGeom g{};
  g.dw = best;
  g.t = (best + 2) / 5;
  if (g.t < 1) g.t = 1;
  g.gap = best / 6;
  if (g.gap < 1) g.gap = 1;
  g.dh = 2 * best - g.t;
  g.colon = g.t;
  return g;
}

inline int segTextWidth(const SegGeom& g, const char* s) {
  int w = 0, n = 0;
  for (const char* p = s; *p; ++p) {
    if (*p == ':') w += g.colon;
    else if (*p >= '0' && *p <= '9') w += g.dw;
    else continue;
    n++;
  }
  if (n > 1) w += (n - 1) * g.gap;
  return w;
}

inline uint8_t segBits(char c) {
  static const uint8_t T[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
  return (c >= '0' && c <= '9') ? T[c - '0'] : 0;
}

inline void segRect(int x, int y, int w, int h, int pass) {
  if (pass == 0) {
    for (int yy = y - 1; yy < y + h + 1; yy++)
      for (int xx = x - 1; xx < x + w + 1; xx++) blendPx(xx, yy, 0, 0, 0, 170);
  } else {
    for (int yy = y; yy < y + h; yy++) {
      uint8_t r, g, b;
      inkAt(yy, &r, &g, &b);
      for (int xx = x; xx < x + w; xx++) blendPx(xx, yy, r, g, b, 255);
    }
  }
}

inline void segDigit(const SegGeom& g, int x, int y, uint8_t bits, int pass) {
  const int dw = g.dw, dh = g.dh, t = g.t;
  const int half = (dh + t) / 2;
  const int mid = (dh - t) / 2;
  if (bits & 0x01) segRect(x, y, dw, t, pass);
  if (bits & 0x02) segRect(x + dw - t, y, t, half, pass);
  if (bits & 0x04) segRect(x + dw - t, y + mid, t, half, pass);
  if (bits & 0x08) segRect(x, y + dh - t, dw, t, pass);
  if (bits & 0x10) segRect(x, y + mid, t, half, pass);
  if (bits & 0x20) segRect(x, y, t, half, pass);
  if (bits & 0x40) segRect(x, y + mid, dw, t, pass);
}

inline void segColon(const SegGeom& g, int x, int y, int pass, bool lit) {
  if (!lit) return;
  const int t = g.t;
  segRect(x, y + g.dh / 4 - t / 2, t, t, pass);
  segRect(x, y + (3 * g.dh) / 4 - t / 2, t, t, pass);
}

inline void composeDigital(const struct tm& t) {
  char line[12];
  formatTime(t, line, sizeof(line));
  int digits = 0, colons = 0;
  for (const char* p = line; *p; ++p) {
    if (*p == ':') colons++;
    else if (*p >= '0' && *p <= '9') digits++;
  }
  // Small / medium / large as fractions of the panel's shorter side.
  const int shorter = vW < vH ? vW : vH;
  const int maxH = size == Small ? shorter / 5 : (size == Medium ? shorter / 3 : shorter * 45 / 100);
  SegGeom g = segGeomFor(digits, colons, vW - 4, maxH < 5 ? 5 : maxH);
  const int tw = segTextWidth(g, line);
  const int th = g.dh;

  char date[16] = {};
  const GFXfont* df = PF_UI_FONT_CHROME;
  int dw = 0, dh = 0;
  if (showDate && df) {
    formatDate(t, date, sizeof(date));
    dw = gfxAdvance(df, date);
    dh = gfxHeight(df);
  }
  const int bw = tw > dw ? tw : dw;
  const int bh = th + (showDate ? dh + 2 : 0);
  int x, y;
  placeBlock(bw, bh, &x, &y);
  gradTop = y;
  gradH = bh;
  const bool lit = !blinkColon || (t.tm_sec & 1) == 0;

  for (int pass = 0; pass < 2; pass++) {
    int cx = x + (bw - tw) / 2;
    for (const char* p = line; *p; ++p) {
      if (*p == ':') {
        segColon(g, cx, y, pass, lit);
        cx += g.colon + g.gap;
      } else if (*p >= '0' && *p <= '9') {
        segDigit(g, cx, y, segBits(*p), pass);
        cx += g.dw + g.gap;
      }
    }
    if (showDate && df) paintGfxText(df, date, x + (bw - dw) / 2, y + th + 2, pass);
  }
}

// ── Style: clip ──────────────────────────────────────────────────────────
//
// A mask over the native frame, one byte of coverage per pixel, rebuilt
// when the minute (or a setting) changes and blended per frame. Two of them,
// so the minute change can crossfade from the old digits to the new.
inline uint8_t* maskA = nullptr;
inline uint8_t* maskB = nullptr;
inline bool maskIsA = true;
inline uint32_t maskKey = 0xFFFFFFFFu;
inline uint32_t fadeStartMs = 0;
inline bool fading = false;
constexpr uint32_t FADE_MS = 400;

inline uint8_t* maskCur() { return maskIsA ? maskA : maskB; }
inline uint8_t* maskOld() { return maskIsA ? maskB : maskA; }

// The digits' placement for the clip style: hours over minutes when the
// panel is upright or square, four in a row when it is wide. The largest
// set that fits, walking every set by height.
struct ClipLayout {
  const GlyphSet* g;
  bool rows;            // two rows (HH over MM) rather than one line
  int x0, y0;           // hours cell origin
  int x1, y1;           // minutes cell origin
};

inline bool clipLayout(ClipLayout* out) {
  static GlyphSet sets[8];
  static int n = 0;
  if (!n) {
    n = setCount();
    if (n > 8) n = 8;
    for (int i = 0; i < n; i++) sets[i] = glyphSet(i);
  }
  const bool rows = vH >= vW;
  const GlyphSet* best = nullptr;
  for (int i = 0; i < n; i++) {
    const GlyphSet& g = sets[i];
    if (rows) {
      const int rowGap = g.h / 6 < 2 ? 2 : g.h / 6;
      if (2 * g.w + g.gap <= vW - 2 && 2 * g.h + rowGap <= vH - 2 && (!best || g.h > best->h)) best = &g;
    } else {
      const int mid = g.w / 2 + g.gap;
      if (4 * g.w + 2 * g.gap + mid <= vW - 2 && g.h <= vH - 2 && (!best || g.h > best->h)) best = &g;
    }
  }
  if (!best) return false;
  out->g = best;
  out->rows = rows;
  const GlyphSet& g = *best;
  if (rows) {
    const int rowGap = g.h / 6 < 2 ? 2 : g.h / 6;
    const int pairW = 2 * g.w + g.gap;
    const int totalH = 2 * g.h + rowGap;
    out->x0 = out->x1 = (vW - pairW) / 2;
    out->y0 = (vH - totalH) / 2;
    out->y1 = out->y0 + g.h + rowGap;
  } else {
    const int mid = g.w / 2 + g.gap;
    const int pairW = 2 * g.w + g.gap;
    const int totalW = 2 * pairW + mid;
    out->x0 = (vW - totalW) / 2;
    out->x1 = out->x0 + pairW + mid;
    out->y0 = out->y1 = (vH - g.h) / 2;
  }
  return true;
}

inline void maskGlyph(uint8_t* m, const GlyphSet& g, int glyph, int x, int y) {
  const int w = cellWidth(g, glyph);
  for (int yy = 0; yy < g.h; yy++) {
    for (int xx = 0; xx < w; xx++) {
      uint8_t a4 = glyphAlpha4(g, glyph, xx, yy);
      if (!a4) continue;
      int i = nativeIndex(x + xx, y + yy);
      if (i >= 0) m[i] = (uint8_t)(a4 * 17);
    }
  }
}

inline void buildMask(uint8_t* m, const struct tm& t) {
  memset(m, 0, (size_t)nativeW * nativeH);
  ClipLayout L;
  if (!clipLayout(&L)) return;
  const int hh = displayHour(t), mm = t.tm_min;
  const GlyphSet& g = *L.g;
  maskGlyph(m, g, hh / 10, L.x0, L.y0);
  maskGlyph(m, g, hh % 10, L.x0 + g.w + g.gap, L.y0);
  maskGlyph(m, g, mm / 10, L.x1, L.y1);
  maskGlyph(m, g, mm % 10, L.x1 + g.w + g.gap, L.y1);
}

inline const uint8_t* composeClip(const uint8_t* canvas, const struct tm& t) {
  const size_t n = (size_t)nativeW * nativeH;
  if (!maskA) maskA = (uint8_t*)PFMem::alloc(n);
  if (!maskB) maskB = (uint8_t*)PFMem::alloc(n);
  if (!maskA || !maskB) return nullptr;

  const uint32_t key = ((uint32_t)displayHour(t) * 60u + (uint32_t)t.tm_min) ^ (layoutEpoch << 12);
  const uint32_t now = millis();
  if (key != maskKey) {
    const uint32_t prev = maskKey;
    const bool first = (prev == 0xFFFFFFFFu);
    maskIsA = !maskIsA;
    buildMask(maskCur(), t);
    maskKey = key;
    // Only a minute change fades - a settings change should land at once.
    // The minute lives in the low 12 bits, the settings epoch above them.
    fading = fade && !first && (((key ^ prev) >> 12) == 0);
    fadeStartMs = now;
  }
  const uint8_t* cur = maskCur();
  const uint8_t* old = maskOld();
  const bool inverse = (style == ClipInverse);
  const uint16_t dim = (uint16_t)dimPct * 255 / 100;
  uint16_t ft = 255;
  if (fading) {
    uint32_t el = now - fadeStartMs;
    if (el >= FADE_MS) fading = false;
    else ft = (uint16_t)(el * 255 / FADE_MS);
  }

  const uint8_t* src = canvas;
  uint8_t* dst = scratch;
  for (size_t i = 0; i < n; i++, src += 3, dst += 3) {
    uint16_t a = cur[i];
    if (fading) a = (uint16_t)((old[i] * (255 - ft) + cur[i] * ft) / 255);
    if (inverse) a = 255 - a;
    const uint16_t f = dim + ((255 - dim) * a) / 255;  // 0..255
    if (f >= 255) {
      dst[0] = src[0];
      dst[1] = src[1];
      dst[2] = src[2];
    } else if (f == 0) {
      dst[0] = dst[1] = dst[2] = 0;
    } else {
      dst[0] = (uint8_t)((src[0] * f) / 255);
      dst[1] = (uint8_t)((src[1] * f) / 255);
      dst[2] = (uint8_t)((src[2] * f) / 255);
    }
  }
  return scratch;
}

// ── The hook ─────────────────────────────────────────────────────────────
inline const uint8_t* compose(const uint8_t* canvas, int w, int h) {
  if (!enabled || chromeUp || !running) return nullptr;
  if (CalibPattern::overrideOn) return nullptr;
  struct tm t;
  if (!PatternflowClock::localTime(&t)) return nullptr;  // unsynced: nothing, not 12:00
  if (!scratch) scratch = (uint8_t*)PFMem::alloc((size_t)w * h * 3);
  if (!scratch) return nullptr;
  setGeometry(w, h);

  if (style == Clip || style == ClipInverse) return composeClip(canvas, t);

  memcpy(scratch, canvas, (size_t)w * h * 3);
  if (style == Digital) composeDigital(t);
  else composeOverlay(t);
  return scratch;
}

#else  // !PF_CLOCK_ENABLED

inline void loadConfig() {}
inline void saveConfig() {}
inline void setTimezone(const char*) {}
inline void assertZone() {}
inline bool synced() { return false; }
inline void noteFrame(const PFFeatureFrame&) {}
inline const uint8_t* compose(const uint8_t*, int, int) { return nullptr; }

#endif

}  // namespace PatternflowClockFace
