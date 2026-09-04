// ═══════════════════════════════════════════════════════════
// PatternFlow - the clock face: the time, cut out of the running pattern
//
// What time it is comes from the core (src/core_clock.h: NTP, one cached
// reading per 500 ms). This file is everything a person decides about
// showing it, and the drawing itself.
//
// One idea, adjustable: huge digits - hours over minutes on an upright
// panel, four across on a wide one - and the pattern shows through them.
// Inside the digits, the pattern or a solid colour; outside them, the
// pattern dimmed to taste or a solid colour; between the two rows a bar
// (or, across, the face's own colon) that is either cut from the pattern
// too or drawn in colour. So the same layout is a clip, a stencil, a solid
// clock on a coloured ground, or digits over the pattern - whichever fills
// are chosen. The minute change crossfades.
//
// The digits come from clock_glyphs.h: typefaces rasterised offline into
// 4-bit alpha cells by toolchain/build_clock_glyphs.py, several faces, two
// sizes each. The layout picks the tallest set of the chosen face that fits
// the panel, so a new face is a generator line and nothing here changes.
//
// It draws on the frame's way to the panel (the composeFrame hook), not on
// the panel after the fact: the pattern's finished canvas is read, the
// result is written to a scratch buffer, and the scratch is what gets
// blitted. The canvas is never written - patterns that accumulate across
// frames own it.
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
#include "../../presets/preset_calib.h" // the test card owns the panel while it is up
#include "../pf_feature.h"
#include "clock_glyphs.h"

namespace PatternflowClockFace {

constexpr size_t TZ_BYTES = 48;
constexpr const char* NVS_NS = "pfclock";

enum Fill : uint8_t { FillPattern = 0, FillColour = 1 };
enum Sep : uint8_t { SepOff = 0, SepPattern = 1, SepColour = 2 };

// ── Settings ─────────────────────────────────────────────────────────────
inline bool enabled = false;
inline char tz[TZ_BYTES] = PF_CLOCK_DEFAULT_TZ;
inline bool twelveHour = false;
inline uint8_t rotation = 1;   // quarter turns; 1 = upright, the default
inline uint8_t face = 0;       // index into the glyph blob's faces
inline uint8_t gap = 10;       // px between the rows (upright) or the pairs (wide)
inline uint8_t sep = SepOff;   // the bar between the rows / the colon across
inline uint8_t sepW = 2;       // the bar's thickness, px
inline uint8_t inside = FillPattern;
inline uint8_t outside = FillPattern;
inline uint8_t dimPct = 0;     // outside, when it is the pattern: how bright, 0..100
inline uint8_t inkR = 245, inkG = 245, inkB = 245;   // solid digits, the coloured bar
inline uint8_t bgR = 0, bgG = 0, bgB = 0;            // the outside, when it is a colour
inline bool fade = true;       // crossfade the minute change

// Bumped by whoever changes a setting, so a cached mask is rebuilt.
inline uint32_t layoutEpoch = 0;

inline uint32_t packRGB(uint8_t r, uint8_t g, uint8_t b) {
  return ((uint32_t)r << 16) | ((uint32_t)g << 8) | b;
}
inline uint32_t inkPacked() { return packRGB(inkR, inkG, inkB); }
inline uint32_t bgPacked() { return packRGB(bgR, bgG, bgB); }
inline void setInkPacked(uint32_t v) {
  inkR = (uint8_t)(v >> 16);
  inkG = (uint8_t)(v >> 8);
  inkB = (uint8_t)v;
}
inline void setBgPacked(uint32_t v) {
  bgR = (uint8_t)(v >> 16);
  bgG = (uint8_t)(v >> 8);
  bgB = (uint8_t)v;
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

// ── The glyph blob ───────────────────────────────────────────────────────
// Layout in build_clock_glyphs.py (version 2: faces, each with sets). Read
// straight out of flash: on the ESP32-S3 a PROGMEM array is ordinary memory.
// Everything goes through `glyphs`, so a later loader can point it at a
// blob read from FATFS and nothing below changes.
inline const uint8_t* glyphs = CLOCK_GLYPHS;

struct GlyphSet {
  uint8_t h, w, cw, gap;
  uint16_t off;
};
constexpr int COLON = 10;
constexpr int NAME_BYTES = 16;
constexpr int MAX_FACES = 16;

inline int faceTable[MAX_FACES];  // offset of each face record
inline int faceCountCached = -1;

inline int faceCount() {
  if (faceCountCached >= 0) return faceCountCached;
  const uint8_t* b = glyphs;
  if (memcmp(b, "PFG2", 4) != 0) {
    faceCountCached = 0;
    return 0;
  }
  int n = b[4];
  if (n > MAX_FACES) n = MAX_FACES;
  int p = 5;
  for (int i = 0; i < n; i++) {
    faceTable[i] = p;
    p += NAME_BYTES + 1 + 6 * b[p + NAME_BYTES];
  }
  faceCountCached = n;
  return n;
}
inline const char* faceName(int i) {
  if (i < 0 || i >= faceCount()) return "";
  return (const char*)(glyphs + faceTable[i]);
}
inline int faceSets(int i) {
  if (i < 0 || i >= faceCount()) return 0;
  return glyphs[faceTable[i] + NAME_BYTES];
}
inline GlyphSet faceSet(int i, int j) {
  const uint8_t* p = glyphs + faceTable[i] + NAME_BYTES + 1 + 6 * j;
  return {p[0], p[1], p[2], p[3], (uint16_t)(p[4] | ((uint16_t)p[5] << 8))};
}
inline int cellWidth(const GlyphSet& g, int glyph) { return glyph == COLON ? g.cw : g.w; }
inline uint8_t glyphAlpha4(const GlyphSet& g, int glyph, int x, int y) {
  const int digitBytes = g.h * ((g.w + 1) >> 1);
  const int rb = (cellWidth(g, glyph) + 1) >> 1;
  const uint8_t* cell = glyphs + g.off + (glyph < COLON ? glyph * digitBytes : 10 * digitBytes);
  uint8_t v = cell[y * rb + (x >> 1)];
  return (x & 1) ? (v & 15) : (v >> 4);
}

// ── Settings persistence ─────────────────────────────────────────────────
inline void loadConfig() {
  Preferences p;
  bool haveOwn = false;
  if (p.begin(NVS_NS, true)) {
    haveOwn = p.isKey("tz");
    enabled = p.getBool("on", false);
    if (haveOwn) p.getString("tz", tz, sizeof(tz));
    twelveHour = p.getBool("h12", false);
    rotation = p.getUChar("rot", 1);
    face = p.getUChar("face", 0);
    gap = p.getUChar("gap", 10);
    sep = p.getUChar("sep", SepOff);
    sepW = p.getUChar("sepw", 2);
    inside = p.getUChar("in", FillPattern);
    outside = p.getUChar("out", FillPattern);
    dimPct = p.getUChar("dim", 0);
    setInkPacked(p.getUInt("ink", 0xF5F5F5));
    setBgPacked(p.getUInt("bg", 0x000000));
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
  rotation &= 3;
  if (face >= faceCount()) face = 0;
  if (gap > 32) gap = 32;
  if (sep > SepColour) sep = SepOff;
  if (sepW < 1) sepW = 1;
  if (sepW > 8) sepW = 8;
  if (inside > FillColour) inside = FillPattern;
  if (outside > FillColour) outside = FillPattern;
  if (dimPct > 100) dimPct = 100;
  layoutEpoch++;
}

inline void saveConfig() {
  Preferences p;
  if (!p.begin(NVS_NS, false)) return;
  p.putBool("on", enabled);
  p.putString("tz", tz);
  p.putBool("h12", twelveHour);
  p.putUChar("rot", rotation);
  p.putUChar("face", face);
  p.putUChar("gap", gap);
  p.putUChar("sep", sep);
  p.putUChar("sepw", sepW);
  p.putUChar("in", inside);
  p.putUChar("out", outside);
  p.putUChar("dim", dimPct);
  p.putUInt("ink", inkPacked());
  p.putUInt("bg", bgPacked());
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

// ── Geometry ─────────────────────────────────────────────────────────────
// The layout is done in VIRTUAL space - the panel as the viewer sees it
// after `rotation` quarter turns - and each pixel is mapped to the native
// frame when the masks are built. Same convention as Adafruit GFX
// setRotation, so 1 is what the device's own menus call upright.
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

inline int displayHour(const struct tm& t) {
  int h = t.tm_hour;
  if (twelveHour) {
    h %= 12;
    if (h == 0) h = 12;
  }
  return h;
}

// Where the digits go: hours over minutes when the panel is upright or
// square, four across when it is wide. The tallest set of the chosen face
// that fits, with the gap the person asked for.
struct Layout {
  GlyphSet g;
  bool rows;            // two rows (HH over MM) rather than one line
  int x0, y0;           // hours pair origin
  int x1, y1;           // minutes pair origin
  int midW;             // the gap between the pairs (wide) - the colon lives in it
};

inline bool layoutFor(Layout* out) {
  const bool rows = vH >= vW;
  int f = face < faceCount() ? face : 0;
  if (faceCount() == 0) return false;
  bool have = false;
  GlyphSet best{};
  for (int i = 0; i < faceSets(f); i++) {
    GlyphSet g = faceSet(f, i);
    bool fits;
    if (rows) fits = (2 * g.w + g.gap <= vW - 2) && (2 * g.h + gap <= vH - 2);
    else fits = (4 * g.w + 2 * g.gap + gap <= vW - 2) && (g.h <= vH - 2);
    if (fits && (!have || g.h > best.h)) {
      best = g;
      have = true;
    }
  }
  if (!have) return false;
  out->g = best;
  out->rows = rows;
  const GlyphSet& g = best;
  const int pairW = 2 * g.w + g.gap;
  if (rows) {
    const int totalH = 2 * g.h + gap;
    out->x0 = out->x1 = (vW - pairW) / 2;
    out->y0 = (vH - totalH) / 2;
    out->y1 = out->y0 + g.h + gap;
    out->midW = gap;
  } else {
    // Across, the gap has to hold the colon when there is one.
    int mid = gap;
    if (sep != SepOff && mid < g.cw + 2 * g.gap) mid = g.cw + 2 * g.gap;
    const int totalW = 2 * pairW + mid;
    out->x0 = (vW - totalW) / 2;
    out->x1 = out->x0 + pairW + mid;
    out->y0 = out->y1 = (vH - g.h) / 2;
    out->midW = mid;
  }
  return true;
}

// ── Masks ────────────────────────────────────────────────────────────────
//
// Coverage per native pixel, 0..255. `digits` is what the time cuts out
// (plus the separator when it is cut from the pattern too); `bar` is the
// separator when it is drawn in colour. Two digit masks, so the minute
// change can crossfade from the old digits to the new.
inline uint8_t* scratch = nullptr;
inline uint8_t* maskA = nullptr;
inline uint8_t* maskB = nullptr;
inline uint8_t* barMask = nullptr;
inline bool maskIsA = true;
inline uint32_t maskKey = 0xFFFFFFFFu;
inline uint32_t fadeStartMs = 0;
inline bool fading = false;
constexpr uint32_t FADE_MS = 400;

inline uint8_t* maskCur() { return maskIsA ? maskA : maskB; }
inline uint8_t* maskOld() { return maskIsA ? maskB : maskA; }

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

inline void maskRect(uint8_t* m, int x, int y, int w, int h) {
  for (int yy = y; yy < y + h; yy++)
    for (int xx = x; xx < x + w; xx++) {
      int i = nativeIndex(xx, yy);
      if (i >= 0) m[i] = 255;
    }
}

// The separator: a bar between the rows, the face's colon across.
inline void maskSeparator(uint8_t* m, const Layout& L) {
  const GlyphSet& g = L.g;
  if (L.rows) {
    const int pairW = 2 * g.w + g.gap;
    int t = sepW;
    if (t > gap) t = gap;
    if (t < 1) return;
    const int y = L.y0 + g.h + (gap - t) / 2;
    maskRect(m, L.x0, y, pairW, t);
  } else {
    const int pairW = 2 * g.w + g.gap;
    const int x = L.x0 + pairW + (L.midW - g.cw) / 2;
    maskGlyph(m, g, COLON, x, L.y0);
  }
}

inline void buildMasks(uint8_t* digits, const struct tm& t) {
  const size_t n = (size_t)nativeW * nativeH;
  memset(digits, 0, n);
  memset(barMask, 0, n);
  Layout L;
  if (!layoutFor(&L)) return;
  const int hh = displayHour(t), mm = t.tm_min;
  const GlyphSet& g = L.g;
  maskGlyph(digits, g, hh / 10, L.x0, L.y0);
  maskGlyph(digits, g, hh % 10, L.x0 + g.w + g.gap, L.y0);
  maskGlyph(digits, g, mm / 10, L.x1, L.y1);
  maskGlyph(digits, g, mm % 10, L.x1 + g.w + g.gap, L.y1);
  if (sep == SepPattern) maskSeparator(digits, L);
  else if (sep == SepColour) maskSeparator(barMask, L);
}

// ── The hook ─────────────────────────────────────────────────────────────
inline const uint8_t* compose(const uint8_t* canvas, int w, int h) {
  if (!enabled || chromeUp || !running) return nullptr;
  if (CalibPattern::overrideOn) return nullptr;
  struct tm t;
  if (!PatternflowClock::localTime(&t)) return nullptr;  // unsynced: nothing, not 12:00

  const size_t n = (size_t)w * h;
  if (!scratch) scratch = (uint8_t*)PFMem::alloc(n * 3);
  if (!maskA) maskA = (uint8_t*)PFMem::alloc(n);
  if (!maskB) maskB = (uint8_t*)PFMem::alloc(n);
  if (!barMask) barMask = (uint8_t*)PFMem::alloc(n);
  if (!scratch || !maskA || !maskB || !barMask) return nullptr;
  setGeometry(w, h);

  // Rebuild when the minute or a setting changes. The minute lives in the
  // low 12 bits of the key, the settings epoch above them: only a minute
  // change fades, a settings change lands at once.
  const uint32_t key = ((uint32_t)displayHour(t) * 60u + (uint32_t)t.tm_min) ^ (layoutEpoch << 12);
  const uint32_t now = millis();
  if (key != maskKey) {
    const uint32_t prev = maskKey;
    const bool first = (prev == 0xFFFFFFFFu);
    maskIsA = !maskIsA;
    buildMasks(maskCur(), t);
    maskKey = key;
    fading = fade && !first && (((key ^ prev) >> 12) == 0);
    fadeStartMs = now;
  }
  const uint8_t* cur = maskCur();
  const uint8_t* old = maskOld();
  uint16_t ft = 255;
  if (fading) {
    uint32_t el = now - fadeStartMs;
    if (el >= FADE_MS) fading = false;
    else ft = (uint16_t)(el * 255 / FADE_MS);
  }
  const bool inPattern = (inside == FillPattern);
  const bool outPattern = (outside == FillPattern);
  const uint16_t dim = (uint16_t)dimPct * 255 / 100;
  const bool bar = (sep == SepColour);

  const uint8_t* src = canvas;
  uint8_t* dst = scratch;
  for (size_t i = 0; i < n; i++, src += 3, dst += 3) {
    uint16_t a = cur[i];
    if (fading) a = (uint16_t)((old[i] * (255 - ft) + cur[i] * ft) / 255);
    // What is outside, and what is inside, at this pixel.
    uint16_t oR, oG, oB, iR, iG, iB;
    if (outPattern) {
      oR = (src[0] * dim) / 255;
      oG = (src[1] * dim) / 255;
      oB = (src[2] * dim) / 255;
    } else {
      oR = bgR; oG = bgG; oB = bgB;
    }
    if (inPattern) {
      iR = src[0]; iG = src[1]; iB = src[2];
    } else {
      iR = inkR; iG = inkG; iB = inkB;
    }
    uint16_t r, g, b;
    if (a >= 255) { r = iR; g = iG; b = iB; }
    else if (a == 0) { r = oR; g = oG; b = oB; }
    else {
      r = (oR * (255 - a) + iR * a) / 255;
      g = (oG * (255 - a) + iG * a) / 255;
      b = (oB * (255 - a) + iB * a) / 255;
    }
    if (bar) {
      const uint16_t s = barMask[i];
      if (s) {
        r = (r * (255 - s) + inkR * s) / 255;
        g = (g * (255 - s) + inkG * s) / 255;
        b = (b * (255 - s) + inkB * s) / 255;
      }
    }
    dst[0] = (uint8_t)r;
    dst[1] = (uint8_t)g;
    dst[2] = (uint8_t)b;
  }
  return scratch;
}

#else  // !PF_CLOCK_ENABLED

inline int faceCount() { return 0; }
inline const char* faceName(int) { return ""; }
inline void loadConfig() {}
inline void saveConfig() {}
inline void setTimezone(const char*) {}
inline void assertZone() {}
inline bool synced() { return false; }
inline void noteFrame(const PFFeatureFrame&) {}
inline const uint8_t* compose(const uint8_t*, int, int) { return nullptr; }

#endif

}  // namespace PatternflowClockFace
