// SPDX-License-Identifier: MIT
// Pattern: Weather
// Compact (128×64) or Extended (64×128 portrait via setFrame) weather clock.
// Sky gradient + transparent Meteo icons + MatrixLight text all on PFCanvas
// so present() is last and the sky stays visible under the glyphs.
#pragma once

#include <stdio.h>
#include <string.h>
#include <math.h>
#include "../../src/core_display.h"
#include "../../src/core_canvas.h"
#include "core_weather.h"
#include "../../src/core_color.h"
#include "weather_icons_32.h"
#include "../../src/fonts/MatrixLight6.h"
#include "../../src/fonts/MatrixLight8X.h"

namespace Weather {
  const char* NAME = "Weather";
  const char* KNOB_LABELS[4] = {"cond", "temp", "humid", "feels"};
  constexpr bool ABSOLUTE_READY = false;

  void setup() {}

  void update(float /*dt*/, const InputFrame& /*input*/) {}

  // Diurnal keyframes (time 0..1 over 24h): zenith / mid / horizon RGB.
  // Same idea as the HTML canvas sketch; zen/mid filled where the paste was empty.
  struct SkyKey {
    float t;
    uint8_t zen[3];
    uint8_t mid[3];
    uint8_t hor[3];
  };

  static const SkyKey SKY_KEYS[] = {
      {0.00f, {8, 12, 35}, {12, 18, 40}, {20, 25, 45}},          // midnight
      {0.22f, {25, 30, 70}, {80, 50, 90}, {220, 110, 65}},       // early dawn
      {0.28f, {70, 100, 160}, {180, 140, 120}, {235, 195, 130}}, // sunrise
      {0.50f, {30, 90, 180}, {90, 160, 220}, {180, 210, 230}},  // noon
      {0.72f, {60, 50, 110}, {180, 90, 70}, {235, 165, 85}},    // sunset
      {0.78f, {20, 20, 55}, {70, 35, 80}, {170, 55, 85}},       // dusk
      {1.00f, {8, 12, 35}, {12, 18, 40}, {20, 25, 45}},          // loop
  };
  static constexpr int SKY_KEY_COUNT = 7;

  float dayFraction() {
    if (!PatternflowWeather::timeSynced()) return 0.50f;
    int m = PatternflowWeather::localHour() * 60 + PatternflowWeather::localMinute();
    float t = (float)m / (24.0f * 60.0f);
    if (t < 0.0f) t = 0.0f;
    if (t > 1.0f) t = 1.0f;
    return t;
  }

  float cloudCoverFactor() {
    float c = PatternflowWeather::cloudCoverPct() / 100.0f;
    if (c < 0.0f) c = 0.0f;
    if (c > 1.0f) c = 1.0f;
    int id = PatternflowWeather::conditionId();
    if (id >= 200 && id < 300) c = fmaxf(c, 0.85f);
    else if (id >= 300 && id < 600) c = fmaxf(c, 0.65f);
    else if (id >= 600 && id < 700) c = fmaxf(c, 0.55f);
    else if (id >= 700 && id < 800) c = fmaxf(c, 0.70f);
    else if (id == 804) c = fmaxf(c, 0.75f);
    return c;
  }

  void mixRgb(const uint8_t a[3], const uint8_t b[3], float f, float cloud,
              uint8_t& r, uint8_t& g, uint8_t& bOut) {
    float rf = a[0] + f * (b[0] - a[0]);
    float gf = a[1] + f * (b[1] - a[1]);
    float bf = a[2] + f * (b[2] - a[2]);
    float lum = 0.299f * rf + 0.587f * gf + 0.114f * bf;
    float shade = 1.0f - 0.35f * cloud;
    rf = (rf + (lum - rf) * cloud) * shade;
    gf = (gf + (lum - gf) * cloud) * shade;
    bf = (bf + (lum - bf) * cloud) * shade;
    // Leave headroom under 255 so LED_SAT_BOOST can't clip a whole band to white.
    if (rf > 240.0f) rf = 240.0f;
    if (gf > 240.0f) gf = 240.0f;
    if (bf > 240.0f) bf = 240.0f;
    r = (uint8_t)constrain((int)(rf + 0.5f), 0, 255);
    g = (uint8_t)constrain((int)(gf + 0.5f), 0, 255);
    bOut = (uint8_t)constrain((int)(bf + 0.5f), 0, 255);
  }

  void skyStops(uint8_t zen[3], uint8_t mid[3], uint8_t hor[3]) {
    float t = dayFraction();
    float cloud = cloudCoverFactor();
    int i = 0;
    while (i < SKY_KEY_COUNT - 1 && t >= SKY_KEYS[i + 1].t) i++;
    const SkyKey& k1 = SKY_KEYS[i];
    const SkyKey& k2 = SKY_KEYS[i + 1];
    float span = k2.t - k1.t;
    float f = (span > 1e-6f) ? (t - k1.t) / span : 0.0f;
    mixRgb(k1.zen, k2.zen, f, cloud, zen[0], zen[1], zen[2]);
    mixRgb(k1.mid, k2.mid, f, cloud, mid[0], mid[1], mid[2]);
    mixRgb(k1.hor, k2.hor, f, cloud, hor[0], hor[1], hor[2]);
  }

  void sampleSkyY(float yNorm, const uint8_t zen[3], const uint8_t mid[3],
                  const uint8_t hor[3], uint8_t& r, uint8_t& g, uint8_t& b) {
    // Classic sky: zenith at TOP (icon), mid transition, horizon haze at BOTTOM.
    if (yNorm < 0.4f) {
      float f = yNorm / 0.4f;
      f = f * f * (3.0f - 2.0f * f);
      r = (uint8_t)(zen[0] + (int)((mid[0] - zen[0]) * f));
      g = (uint8_t)(zen[1] + (int)((mid[1] - zen[1]) * f));
      b = (uint8_t)(zen[2] + (int)((mid[2] - zen[2]) * f));
    } else {
      float f = (yNorm - 0.4f) / 0.6f;
      f = f * f * (3.0f - 2.0f * f);
      r = (uint8_t)(mid[0] + (int)((hor[0] - mid[0]) * f));
      g = (uint8_t)(mid[1] + (int)((hor[1] - mid[1]) * f));
      b = (uint8_t)(mid[2] + (int)((hor[2] - mid[2]) * f));
    }
  }

  void fillSky(int w, int h) {
    uint8_t zen[3], mid[3], hor[3];
    skyStops(zen, mid, hor);
    for (int y = 0; y < h; y++) {
      float yNorm = (h <= 1) ? 0.0f : (float)y / (float)(h - 1);
      uint8_t r, g, b;
      sampleSkyY(yNorm, zen, mid, hor, r, g, b);
      for (int x = 0; x < w; x++) {
        PFCanvas::setPixel(x, y, r, g, b);
      }
    }
  }

  // 0x0000 in the icon atlas is transparent — leave sky pixels alone.
  void blitIcon(int ox, int oy, const uint16_t* src, int frameW, int frameH) {
    if (!src) return;
    for (int y = 0; y < MeteoIcons32::SIZE; y++) {
      for (int x = 0; x < MeteoIcons32::SIZE; x++) {
        uint16_t c = pgm_read_word(&src[y * MeteoIcons32::SIZE + x]);
        if (c == 0) continue;
        uint8_t r = (uint8_t)(((c >> 11) & 0x1F) << 3);
        uint8_t g = (uint8_t)(((c >> 5) & 0x3F) << 2);
        uint8_t b = (uint8_t)((c & 0x1F) << 3);
        // Restore low bits lost in RGB565 so soft edges don't look muddy.
        r |= r >> 5;
        g |= g >> 6;
        b |= b >> 5;
        int dx = ox + x, dy = oy + y;
        if (dx >= 0 && dy >= 0 && dx < frameW && dy < frameH) {
          PFCanvas::setPixel(dx, dy, r, g, b);
        }
      }
    }
  }

  int canvasTextWidth(const GFXfont* font, const char* text) {
    if (!text || !font) return 0;
    uint8_t first = pgm_read_byte(&font->first);
    uint8_t last = pgm_read_byte(&font->last);
    int w = 0;
    for (const char* p = text; *p; ++p) {
      uint8_t c = (uint8_t)*p;
      if (c < first || c > last) {
        w += 3;
        continue;
      }
      GFXglyph* glyph = &(((GFXglyph*)pgm_read_ptr(&font->glyph))[c - first]);
      w += (int)pgm_read_byte(&glyph->xAdvance);
    }
    return w;
  }

  void canvasDrawChar(const GFXfont* font, char ch, int& cursorX, int baselineY,
                      uint8_t r, uint8_t g, uint8_t b) {
    uint8_t first = pgm_read_byte(&font->first);
    uint8_t last = pgm_read_byte(&font->last);
    uint8_t c = (uint8_t)ch;
    if (c < first || c > last) {
      cursorX += 3;
      return;
    }
    GFXglyph* glyph = &(((GFXglyph*)pgm_read_ptr(&font->glyph))[c - first]);
    uint8_t* bitmap = (uint8_t*)pgm_read_ptr(&font->bitmap);
    uint16_t bo = pgm_read_word(&glyph->bitmapOffset);
    uint8_t w = pgm_read_byte(&glyph->width);
    uint8_t h = pgm_read_byte(&glyph->height);
    int8_t xo = pgm_read_byte(&glyph->xOffset);
    int8_t yo = pgm_read_byte(&glyph->yOffset);
    uint8_t bits = 0, bit = 0;
    for (uint8_t yy = 0; yy < h; yy++) {
      for (uint8_t xx = 0; xx < w; xx++) {
        if (!(bit++ & 7)) bits = pgm_read_byte(&bitmap[bo++]);
        if (bits & 0x80) {
          PFCanvas::setPixel(cursorX + xo + xx, baselineY + yo + yy, r, g, b);
        }
        bits <<= 1;
      }
    }
    cursorX += (int)pgm_read_byte(&glyph->xAdvance);
  }

  void canvasTextAt(const GFXfont* font, const char* text, int x, int yTop,
                    uint8_t r, uint8_t g, uint8_t b) {
    if (!text || !font) return;
    int baseline = yTop + (int)pgm_read_byte(&font->yAdvance);
    int cx = x;
    for (const char* p = text; *p; ++p) {
      canvasDrawChar(font, *p, cx, baseline, r, g, b);
    }
  }

  // White (or tinted) glyphs with a 1px black outline — no scrim block.
  // Two passes are required: painting outline+fill per ink pixel lets a
  // neighbour's outline stomp the previous pixel's white (sparse white dots
  // inside black letter silhouettes). Outline the whole string first, then fill.
  void canvasDrawCharPass(const GFXfont* font, char ch, int& cursorX, int baselineY,
                          uint8_t r, uint8_t g, uint8_t b, bool outlinePass) {
    uint8_t first = pgm_read_byte(&font->first);
    uint8_t last = pgm_read_byte(&font->last);
    uint8_t c = (uint8_t)ch;
    if (c < first || c > last) {
      cursorX += 3;
      return;
    }
    GFXglyph* glyph = &(((GFXglyph*)pgm_read_ptr(&font->glyph))[c - first]);
    uint8_t* bitmap = (uint8_t*)pgm_read_ptr(&font->bitmap);
    uint16_t bo = pgm_read_word(&glyph->bitmapOffset);
    uint8_t w = pgm_read_byte(&glyph->width);
    uint8_t h = pgm_read_byte(&glyph->height);
    int8_t xo = pgm_read_byte(&glyph->xOffset);
    int8_t yo = pgm_read_byte(&glyph->yOffset);
    uint8_t bits = 0, bit = 0;
    for (uint8_t yy = 0; yy < h; yy++) {
      for (uint8_t xx = 0; xx < w; xx++) {
        if (!(bit++ & 7)) bits = pgm_read_byte(&bitmap[bo++]);
        if (bits & 0x80) {
          const int px = cursorX + xo + xx;
          const int py = baselineY + yo + yy;
          if (outlinePass) {
            for (int dy = -1; dy <= 1; dy++) {
              for (int dx = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0) continue;
                PFCanvas::setPixel(px + dx, py + dy, 0, 0, 0);
              }
            }
          } else {
            PFCanvas::setPixel(px, py, r, g, b);
          }
        }
        bits <<= 1;
      }
    }
    cursorX += (int)pgm_read_byte(&glyph->xAdvance);
  }

  void canvasTextOutlined(const GFXfont* font, const char* text, int x, int yTop,
                          uint8_t r, uint8_t g, uint8_t b) {
    if (!text || !font) return;
    int baseline = yTop + (int)pgm_read_byte(&font->yAdvance);
    int cx = x;
    for (const char* p = text; *p; ++p) {
      canvasDrawCharPass(font, *p, cx, baseline, r, g, b, true);
    }
    cx = x;
    for (const char* p = text; *p; ++p) {
      canvasDrawCharPass(font, *p, cx, baseline, r, g, b, false);
    }
  }

  void canvasTextCentered(const GFXfont* font, const char* text, int frameW,
                          int yTop, uint8_t r, uint8_t g, uint8_t b) {
    if (!text || !font) return;
    int x = (frameW - canvasTextWidth(font, text)) / 2;
    canvasTextOutlined(font, text, x, yTop, r, g, b);
  }

  void formatTemp(char* out, size_t n, float celsius, bool withUnit) {
    if (PatternflowWeather::unitsMetric) {
      if (withUnit) snprintf(out, n, "%.1fC", celsius);
      else snprintf(out, n, "%.1f", celsius);
    } else {
      float f = celsius * 9.0f / 5.0f + 32.0f;
      if (withUnit) snprintf(out, n, "%.1fF", f);
      else snprintf(out, n, "%.1f", f);
    }
  }

  void formatClock(char* out, size_t n) {
    snprintf(out, n, "%02d:%02d:%02d",
             PatternflowWeather::localHour(), PatternflowWeather::localMinute(),
             PatternflowWeather::localSecond());
  }

  void drawCompact(int fw, int fh) {
    const uint8_t wr = 245, wg = 245, wb = 245;
    const uint8_t dr = 210, dg = 214, db = 224;
    const uint8_t er = 255, eg = 92, eb = 46;
    char line[48];
    const int textX = 38;

    int iconId = MeteoIcons32::fromOpenWeatherIcon(
        PatternflowWeather::owmIcon(), PatternflowWeather::conditionId());
    const uint16_t* icon = MeteoIcons32::byId(iconId);
    if (PatternflowWeather::hasData()) {
      blitIcon(2, (fh - MeteoIcons32::SIZE) / 2, icon, fw, fh);
    }

    if (!PatternflowWeather::isEnabled()) {
      canvasTextOutlined(&MatrixLight8X, "WEATHER OFF", 20, 22, wr, wg, wb);
      canvasTextOutlined(&MatrixLight6, "/weather", 36, 40, dr, dg, db);
      return;
    }
    if (!PatternflowWeather::configured()) {
      canvasTextOutlined(&MatrixLight8X, "SET API KEY", 20, 22, wr, wg, wb);
      canvasTextOutlined(&MatrixLight6, "ON /weather", 30, 40, dr, dg, db);
      return;
    }

    if (PatternflowWeather::timeSynced()) {
      formatClock(line, sizeof(line));
      canvasTextOutlined(&MatrixLight8X, line, textX, 2, wr, wg, wb);
    } else {
      canvasTextOutlined(&MatrixLight6, "SYNC...", textX, 4, dr, dg, db);
    }

    if (!PatternflowWeather::hasData()) {
      canvasTextOutlined(&MatrixLight6,
                         PatternflowWeather::error()[0] ? PatternflowWeather::error() : "FETCHING",
                         textX, 28, er, eg, eb);
      return;
    }

    formatTemp(line, sizeof(line), PatternflowWeather::temperatureC(), true);
    canvasTextOutlined(&MatrixLight8X, line, textX, 16, wr, wg, wb);

    const int page = (int)((millis() / 3500UL) % 4UL);
    if (page == 0) {
      char feel[24];
      formatTemp(feel, sizeof(feel), PatternflowWeather::feelsLikeC(), true);
      snprintf(line, sizeof(line), "feels %s", feel);
      canvasTextOutlined(&MatrixLight6, line, textX, 36, dr, dg, db);
      snprintf(line, sizeof(line), "humid %.0f%%", PatternflowWeather::humidityPct());
      canvasTextOutlined(&MatrixLight6, line, textX, 48, dr, dg, db);
    } else if (page == 1) {
      if (PatternflowWeather::unitsMetric) {
        snprintf(line, sizeof(line), "wind %.1fkm/h", PatternflowWeather::windKmh());
      } else {
        snprintf(line, sizeof(line), "wind %.1fmph", PatternflowWeather::windMph());
      }
      canvasTextOutlined(&MatrixLight6, line, textX, 36, dr, dg, db);
      snprintf(line, sizeof(line), "dir %s %.0f",
               PatternflowWeather::windCompass(),
               PatternflowWeather::windDirectionDeg());
      canvasTextOutlined(&MatrixLight6, line, textX, 48, dr, dg, db);
    } else if (page == 2) {
      snprintf(line, sizeof(line), "press %.0fhPa", PatternflowWeather::pressure());
      canvasTextOutlined(&MatrixLight6, line, textX, 36, dr, dg, db);
      if (PatternflowWeather::hasUv()) {
        snprintf(line, sizeof(line), "UV index %.2f", PatternflowWeather::uv());
      } else {
        snprintf(line, sizeof(line), "UV index -");
      }
      canvasTextOutlined(&MatrixLight6, line, textX, 48, dr, dg, db);
    } else {
      snprintf(line, sizeof(line), "clouds %.0f%%", PatternflowWeather::cloudCoverPct());
      canvasTextOutlined(&MatrixLight6, line, textX, 36, dr, dg, db);
      const char* cond = PatternflowWeather::conditionMain();
      canvasTextOutlined(&MatrixLight6, cond && cond[0] ? cond : "-", textX, 48, dr, dg, db);
    }
  }

  void drawExtended(int fw, int fh) {
    const uint8_t wr = 245, wg = 245, wb = 245;
    const uint8_t dr = 220, dg = 224, db = 232;
    const uint8_t er = 255, eg = 92, eb = 46;
    char line[56];
    char t1[16], t2[16];

    if (!PatternflowWeather::isEnabled()) {
      canvasTextCentered(&MatrixLight8X, "WEATHER", fw, 40, wr, wg, wb);
      canvasTextCentered(&MatrixLight6, "OFF", fw, 56, dr, dg, db);
      canvasTextCentered(&MatrixLight6, "/weather", fw, 72, dr, dg, db);
      return;
    }
    if (!PatternflowWeather::configured()) {
      canvasTextCentered(&MatrixLight8X, "SET KEY", fw, 40, wr, wg, wb);
      canvasTextCentered(&MatrixLight6, "ON /weather", fw, 58, dr, dg, db);
      return;
    }

    // Clock stays fixed (not part of the forecast rotation).
    if (PatternflowWeather::timeSynced()) {
      formatClock(line, sizeof(line));
      canvasTextCentered(&MatrixLight8X, line, fw, 2, wr, wg, wb);
    } else {
      canvasTextCentered(&MatrixLight6, "SYNC...", fw, 4, dr, dg, db);
    }

    if (!PatternflowWeather::hasData()) {
      canvasTextCentered(&MatrixLight6,
                         PatternflowWeather::error()[0] ? PatternflowWeather::error() : "FETCHING",
                         fw, 52, er, eg, eb);
      return;
    }

    // Upper half rotation: Now 30s, +3h/+6h/+24h 10s each → 60s cycle.
    const uint32_t phase = millis() % 60000UL;
    int slotIdx = 0;
    const char* slotLabel = "Now";
    if (phase < 30000UL) {
      slotIdx = 0; slotLabel = "Now";
    } else if (phase < 40000UL) {
      slotIdx = 1; slotLabel = "+3h";
    } else if (phase < 50000UL) {
      slotIdx = 2; slotLabel = "+6h";
    } else {
      slotIdx = 3; slotLabel = "+24h";
    }

    const PatternflowWeather::ForecastSlot& slot =
        PatternflowWeather::forecastSlot(slotIdx);
    const PatternflowWeather::ForecastSlot& show =
        slot.valid ? slot : PatternflowWeather::forecastSlot(0);

    int iconId = MeteoIcons32::fromOpenWeatherIcon(
        show.icon, show.weatherId);
    const uint16_t* icon = MeteoIcons32::byId(iconId);
    blitIcon((fw - MeteoIcons32::SIZE) / 2, 12, icon, fw, fh);

    canvasTextCentered(&MatrixLight6, slotLabel, fw, 45, wr, wg, wb);

    formatTemp(t1, sizeof(t1), show.tempA, true);
    formatTemp(t2, sizeof(t2), show.tempB, true);
    if (show.isMinMax) {
      snprintf(line, sizeof(line), "Min %s", t1);
      canvasTextCentered(&MatrixLight6, line, fw, 54, wr, wg, wb);
      snprintf(line, sizeof(line), "Max %s", t2);
      canvasTextCentered(&MatrixLight6, line, fw, 63, wr, wg, wb);
    } else {
      snprintf(line, sizeof(line), "Real %s", t1);
      canvasTextCentered(&MatrixLight6, line, fw, 54, wr, wg, wb);
      snprintf(line, sizeof(line), "Feel %s", t2);
      canvasTextCentered(&MatrixLight6, line, fw, 63, wr, wg, wb);
    }

    // Lower half: current conditions only (stable).
    int y = 74;
    const int pitch = 9;

    const char* cond = PatternflowWeather::conditionMain();
    canvasTextCentered(&MatrixLight6, cond && cond[0] ? cond : "-", fw, y, wr, wg, wb);
    y += pitch;

    snprintf(line, sizeof(line), "Humidity %.0f%%", PatternflowWeather::humidityPct());
    canvasTextCentered(&MatrixLight6, line, fw, y, dr, dg, db); y += pitch;

    {
      const float p = PatternflowWeather::pressure();
      const int8_t tr = PatternflowWeather::pressureTrendArrow();
      const char* arrow = (tr > 0) ? " ^" : (tr < 0) ? " v" : " -";
      if (p >= 1000.0f) {
        snprintf(line, sizeof(line), "Press. %.0f%s", p, arrow);
      } else {
        snprintf(line, sizeof(line), "Pressure %.0f%s", p, arrow);
      }
    }
    canvasTextCentered(&MatrixLight6, line, fw, y, dr, dg, db); y += pitch;

    if (PatternflowWeather::unitsMetric) {
      snprintf(line, sizeof(line), "Wind %.0f km/h %s",
               PatternflowWeather::windKmh(), PatternflowWeather::windCompass());
    } else {
      snprintf(line, sizeof(line), "Wind %.0f mph %s",
               PatternflowWeather::windMph(), PatternflowWeather::windCompass());
    }
    canvasTextCentered(&MatrixLight6, line, fw, y, dr, dg, db); y += pitch;

    snprintf(line, sizeof(line), "Clouds %.0f%%", PatternflowWeather::cloudCoverPct());
    canvasTextCentered(&MatrixLight6, line, fw, y, dr, dg, db); y += pitch;

    if (PatternflowWeather::hasUv()) {
      snprintf(line, sizeof(line), "UV index %.2f", PatternflowWeather::uv());
    } else {
      snprintf(line, sizeof(line), "UV index -");
    }
    canvasTextCentered(&MatrixLight6, line, fw, y, dr, dg, db);
  }

  void draw() {
    const bool extended = PatternflowWeather::isLayoutExtended();
    constexpr int EXT_W = 64, EXT_H = 128;
    const int fw = extended ? EXT_W : PANEL_RES_W;
    const int fh = extended ? EXT_H : PANEL_RES_H;

    if (extended) {
      PFCanvas::setFrame(EXT_W, EXT_H);
    }

    fillSky(fw, fh);
    if (extended) drawExtended(fw, fh);
    else drawCompact(fw, fh);

    PFCanvas::present();
  }
}  // namespace Weather
