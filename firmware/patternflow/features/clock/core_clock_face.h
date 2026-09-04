// ═══════════════════════════════════════════════════════════
// PatternFlow - the clock face: a wall clock drawn over the running pattern
//
// What time it is comes from the core (src/core_clock.h: NTP, one cached
// reading per 500 ms). This file is everything a person decides about
// showing it: whether, where, how large, in what zone, with seconds or a
// date or a blinking colon, in what colour. All of it lives in NVS under
// this feature's own namespace and is edited on /clock.
//
// Three sizes, three renderers:
//   small   the chrome font (TomThumb), 1 px black outline — the corner
//           clock the weather feature used to draw
//   medium  the title font (Org_01), same outline — the face the show
//           scheduler puts on Black at wake time
//   large   seven-segment digits drawn as rectangles, sized to the panel —
//           no font table, so it scales to any panel and any orientation
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
#include "../../src/core_display.h"
#include "../../src/core_ui_text.h"
#include "../pf_feature.h"

namespace PatternflowClockFace {

constexpr size_t TZ_BYTES = 48;
constexpr const char* NVS_NS = "pfclock";

enum Pos : uint8_t { TopLeft = 0, TopRight = 1, BottomLeft = 2, BottomRight = 3, Center = 4 };
enum Size : uint8_t { Small = 0, Medium = 1, Large = 2 };

// ── Settings ─────────────────────────────────────────────────────────────
inline bool enabled = false;
inline char tz[TZ_BYTES] = PF_CLOCK_DEFAULT_TZ;
inline uint8_t pos = TopRight;
inline uint8_t size = Small;
inline uint8_t rotation = 1;  // 0..3 quarter turns; 1 = panel stood on end, like the device's own menus
inline bool showSeconds = false;
inline bool twelveHour = false;
inline bool showDate = false;
inline bool blinkColon = false;
inline uint8_t inkR = 245, inkG = 245, inkB = 245;

inline uint32_t inkPacked() { return ((uint32_t)inkR << 16) | ((uint32_t)inkG << 8) | inkB; }
inline void setInkPacked(uint32_t v) {
  inkR = (uint8_t)(v >> 16);
  inkG = (uint8_t)(v >> 8);
  inkB = (uint8_t)v;
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
    pos = p.getUChar("pos", TopRight);
    size = p.getUChar("size", Small);
    rotation = p.getUChar("rot", 1);
    showSeconds = p.getBool("sec", false);
    twelveHour = p.getBool("h12", false);
    showDate = p.getBool("date", false);
    blinkColon = p.getBool("blink", false);
    setInkPacked(p.getUInt("ink", 0xF5F5F5));
    p.end();
  }
  if (haveOwn) return;
  // First boot with this feature: inherit the zone the weather page may have
  // set, so a panel that told weather it is in Rome does not wake up in UTC.
  // Read only — that key belongs to weather, and a composition without
  // weather simply finds nothing here.
  Preferences old;
  if (old.begin("patternflow", true)) {
    int32_t wxTz = old.getInt("wx_tz", 0);
    if (wxTz != 0) posixFromOffsetMinutes(wxTz, tz, sizeof(tz));
    old.end();
  }
  if (pos > Center) pos = TopRight;
  if (size > Large) size = Small;
  rotation &= 3;
}

inline void saveConfig() {
  Preferences p;
  if (!p.begin(NVS_NS, false)) return;
  p.putBool("on", enabled);
  p.putString("tz", tz);
  p.putUChar("pos", pos);
  p.putUChar("size", size);
  p.putUChar("rot", rotation);
  p.putBool("sec", showSeconds);
  p.putBool("h12", twelveHour);
  p.putBool("date", showDate);
  p.putBool("blink", blinkColon);
  p.putUInt("ink", inkPacked());
  p.end();
}

// Set the zone, start (or restart) NTP against it, persist.
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

// ── Text ─────────────────────────────────────────────────────────────────
inline void formatTime(const struct tm& t, char* out, size_t n, bool withSuffix) {
  int h = t.tm_hour;
  bool pm = h >= 12;
  if (twelveHour) {
    h %= 12;
    if (h == 0) h = 12;
  }
  int used;
  if (showSeconds) used = snprintf(out, n, "%02d:%02d:%02d", h, t.tm_min, t.tm_sec);
  else used = snprintf(out, n, "%02d:%02d", h, t.tm_min);
  if (twelveHour && withSuffix && used > 0 && (size_t)used + 3 < n) {
    snprintf(out + used, n - used, " %s", pm ? "PM" : "AM");
  }
}

inline void formatDate(const struct tm& t, char* out, size_t n) {
  // "Thu Sep 04" — C locale, ten characters, 40 px in the chrome font.
  strftime(out, n, "%a %b %d", &t);
}

// ── Seven-segment digits ─────────────────────────────────────────────────
//
// Geometry from one number, the digit width dw: thickness t = (dw+2)/5,
// height 2*dw - t, gap dw/6, colon t wide. Sized to fit the panel's width
// for the string at hand, then capped so a corner clock does not eat half
// the panel.
struct SegGeom {
  int dw, dh, t, gap, colon;
};

inline SegGeom segGeomFor(int W, int H, int digits, int colons) {
  SegGeom g{};
  int best = 3;
  for (int dw = 3; dw < 64; dw++) {
    int t = (dw + 2) / 5;
    if (t < 1) t = 1;
    int gap = dw / 6;
    if (gap < 1) gap = 1;
    int width = digits * dw + colons * t + (digits + colons - 1) * gap;
    int dh = 2 * dw - t;
    if (width > W - 4 || dh > H * 45 / 100) break;
    best = dw;
  }
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

// a b c d e f g → bits 0..6
inline uint8_t segBits(char c) {
  static const uint8_t T[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
  return (c >= '0' && c <= '9') ? T[c - '0'] : 0;
}

inline void segRect(int x, int y, int w, int h, uint16_t color, bool outline) {
  if (outline) dma_display->fillRect(x - 1, y - 1, w + 2, h + 2, 0);
  else dma_display->fillRect(x, y, w, h, color);
}

inline void segDigit(const SegGeom& g, int x, int y, uint8_t bits, uint16_t ink, bool outline) {
  const int dw = g.dw, dh = g.dh, t = g.t;
  const int half = (dh + t) / 2;   // a vertical segment's length
  const int mid = (dh - t) / 2;    // y of the middle bar
  if (bits & 0x01) segRect(x, y, dw, t, ink, outline);                    // a
  if (bits & 0x02) segRect(x + dw - t, y, t, half, ink, outline);         // b
  if (bits & 0x04) segRect(x + dw - t, y + mid, t, half, ink, outline);   // c
  if (bits & 0x08) segRect(x, y + dh - t, dw, t, ink, outline);           // d
  if (bits & 0x10) segRect(x, y + mid, t, half, ink, outline);            // e
  if (bits & 0x20) segRect(x, y, t, half, ink, outline);                  // f
  if (bits & 0x40) segRect(x, y + mid, dw, t, ink, outline);              // g
}

inline void segColon(const SegGeom& g, int x, int y, uint16_t ink, bool outline, bool lit) {
  const int t = g.t;
  const int y1 = y + g.dh / 4 - t / 2;
  const int y2 = y + (3 * g.dh) / 4 - t / 2;
  if (outline || lit) {
    segRect(x, y1, t, t, ink, outline);
    segRect(x, y2, t, t, ink, outline);
  }
}

inline void segDraw(const SegGeom& g, const char* s, int x, int y, uint16_t ink, bool colonLit) {
  // Two passes: every lit rectangle grown by one in black, then the ink.
  // Same idea as the glyph outline in core_ui_text.h — the pattern shows
  // through around the digits, and the digits read on any background.
  for (int pass = 0; pass < 2; pass++) {
    bool outline = (pass == 0);
    int cx = x;
    for (const char* p = s; *p; ++p) {
      if (*p == ':') {
        segColon(g, cx, y, ink, outline, colonLit);
        cx += g.colon + g.gap;
      } else if (*p >= '0' && *p <= '9') {
        segDigit(g, cx, y, segBits(*p), ink, outline);
        cx += g.dw + g.gap;
      }
    }
  }
}

// ── Layout and draw ──────────────────────────────────────────────────────
inline void placeBlock(int W, int H, int bw, int bh, int* x, int* y) {
  const int m = 2;
  switch (pos) {
    case TopLeft: *x = m; *y = m; break;
    case TopRight: *x = W - bw - m; *y = m; break;
    case BottomLeft: *x = m; *y = H - bh - m; break;
    case BottomRight: *x = W - bw - m; *y = H - bh - m; break;
    default: *x = (W - bw) / 2; *y = (H - bh) / 2; break;
  }
  if (*x < 0) *x = 0;
  if (*y < 0) *y = 0;
}

// Chrome-font line (TomThumb): bounds and an outlined draw at a top-left.
inline void chromeBounds(const char* s, int16_t* x1, int16_t* y1, uint16_t* w, uint16_t* h) {
  uiTextBounds(s, x1, y1, w, h);
}
inline void chromeDraw(const char* s, int x, int y, int16_t x1, int16_t y1, uint16_t ink) {
  uiDrawOutlinedAtBaseline(s, x - x1, y - y1, ink);
}

inline void draw(const PFFeatureFrame& frame) {
  if (!enabled) return;
  if (frame.chromeVisible) return;  // the device's own UI is up
  if (!dma_display) return;
  struct tm t;
  if (!PatternflowClock::localTime(&t)) return;  // unsynced: draw nothing, not 12:00

  char line[20];
  char date[20] = {};
  formatTime(t, line, sizeof(line), size != Large);
  if (showDate) formatDate(t, date, sizeof(date));

  const uint16_t ink = dma_display->color565(inkR, inkG, inkB);
  const uint8_t prevRot = dma_display->getRotation();
  dma_display->setRotation(rotation & 3);
  const int W = dma_display->width();
  const int H = dma_display->height();

  // Measure the time line in its renderer, the date line in the chrome font.
  int tw = 0, th = 0;
  int16_t tx1 = 0, ty1 = 0;
  SegGeom g{};
  int digits = 0, colons = 0;
  if (size == Large) {
    for (const char* p = line; *p; ++p) {
      if (*p == ':') colons++;
      else if (*p >= '0' && *p <= '9') digits++;
    }
    g = segGeomFor(W, H, digits, colons);
    tw = segTextWidth(g, line);
    th = g.dh;
  } else {
    uint16_t w, h;
    if (size == Medium) uiTitleTextBounds(line, &tx1, &ty1, &w, &h);
    else uiTextBounds(line, &tx1, &ty1, &w, &h);
    tw = w;
    th = h;
  }
  // A large 12-hour clock carries its AM/PM in the chrome font beside the digits.
  char suffix[4] = {};
  int sw = 0, sh = 0;
  int16_t sx1 = 0, sy1 = 0;
  if (size == Large && twelveHour) {
    snprintf(suffix, sizeof(suffix), "%s", t.tm_hour >= 12 ? "PM" : "AM");
    uint16_t w, h;
    chromeBounds(suffix, &sx1, &sy1, &w, &h);
    sw = w + 2;
    sh = h;
  }
  int dw = 0, dh = 0;
  int16_t dx1 = 0, dy1 = 0;
  if (showDate) {
    uint16_t w, h;
    chromeBounds(date, &dx1, &dy1, &w, &h);
    dw = w;
    dh = h;
  }

  const int rowW = tw + sw;
  const int bw = rowW > dw ? rowW : dw;
  const int bh = th + (showDate ? dh + 2 : 0);
  int x, y;
  placeBlock(W, H, bw, bh, &x, &y);

  const int rowX = x + (bw - rowW) / 2;
  if (size == Large) {
    bool lit = !blinkColon || (t.tm_sec & 1) == 0;
    segDraw(g, line, rowX, y, ink, lit);
    if (suffix[0]) chromeDraw(suffix, rowX + tw + 2, y + th - sh, sx1, sy1, ink);
  } else if (size == Medium) {
    uiDrawOutlinedTitleAtBaseline(line, rowX - tx1, y - ty1, ink);
  } else {
    chromeDraw(line, rowX, y, tx1, ty1, ink);
  }
  if (showDate) chromeDraw(date, x + (bw - dw) / 2, y + th + 2, dx1, dy1, ink);

  uiUseDefaultFont();
  dma_display->setRotation(prevRot);
}

#else  // !PF_CLOCK_ENABLED

inline void loadConfig() {}
inline void saveConfig() {}
inline void setTimezone(const char*) {}
inline void assertZone() {}
inline bool synced() { return false; }
inline void draw(const PFFeatureFrame&) {}

#endif

}  // namespace PatternflowClockFace
