#pragma once

// Compact on-panel UI text for OS overlays (NETWORK / KNOB MAP / SELECT / …).
//
// Portrait OS screens lay out inside a virtual 64×64 tile at the top of the
// rotated framebuffer (same density on 64×64 and 64×128).
//
// WHICH fonts is not decided here — core_ui_fonts.h binds the three roles
// and can be overridden per build, because a font is a preference and a
// preference should not require editing this file.

#include "core_display.h"
#include "core_ui_fonts.h"
#include <string.h>

constexpr int UI_PORTRAIT_TILE = 64;

// Small print: NETWORK rows, hints, status lines.
inline void uiUseCompactFont() {
  dma_display->setFont(PF_UI_FONT_CHROME);
  dma_display->setTextSize(1);
}

// Pattern names on the SELECT screen.
inline void uiUseSelectFont() {
  dma_display->setFont(PF_UI_FONT_SELECT);
  dma_display->setTextSize(1);
}

// Banner messages and titles.
inline void uiUseTitleFont() {
  dma_display->setFont(PF_UI_FONT_TITLE);
  dma_display->setTextSize(1);
}

inline void uiUseDefaultFont() {
  dma_display->setFont();
  dma_display->setTextSize(1);
}

// Line heights travel with the font choice (see core_ui_fonts.h): swap a
// font without swapping these and text overlaps rather than failing to build.
inline int uiLinePitch() { return PF_UI_PITCH_CHROME; }
inline int uiSelectLinePitch() { return PF_UI_PITCH_SELECT; }
inline int uiTitleLinePitch() { return PF_UI_PITCH_TITLE; }

// Layout width for wrapping (sum of xAdvance) — ink bounds from getTextBounds
// can under-count and let a line spill past the tile edge.
inline int uiTitleAdvanceWidth(const char* text) {
  const GFXfont* font = PF_UI_FONT_TITLE;
  // The built-in 5x7 has no GFXfont to walk; it is a fixed 6 px advance.
  if (!font) {
    int n = 0;
    for (const char* p = text; *p; ++p) n++;
    return n * 6;
  }
  const uint8_t first = pgm_read_byte(&font->first);
  const uint8_t last = pgm_read_byte(&font->last);
  const GFXglyph* glyphs = (const GFXglyph*)pgm_read_ptr(&font->glyph);
  int adv = 0;
  for (const uint8_t* p = (const uint8_t*)text; *p; ++p) {
    uint8_t c = *p;
    if (c < first || c > last) continue;
    adv += (int)pgm_read_byte(&glyphs[c - first].xAdvance);
  }
  return adv;
}

inline void uiPortraitTile(int* ox, int* oy, int* tw, int* th) {
  const int W = dma_display->width();
  const int H = dma_display->height();
  *tw = (W < UI_PORTRAIT_TILE) ? W : UI_PORTRAIT_TILE;
  *th = (H < UI_PORTRAIT_TILE) ? H : UI_PORTRAIT_TILE;
  *ox = (W - *tw) / 2;
  *oy = 0;
}

inline void uiTextBounds(const char* text, int16_t* x1, int16_t* y1, uint16_t* w, uint16_t* h) {
  uiUseCompactFont();
  dma_display->getTextBounds(text, 0, 0, x1, y1, w, h);
}

inline void uiTitleTextBounds(const char* text, int16_t* x1, int16_t* y1, uint16_t* w, uint16_t* h) {
  uiUseTitleFont();
  dma_display->getTextBounds(text, 0, 0, x1, y1, w, h);
}

inline void uiDrawCentered(const char* text, int yTop, uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  uiTextBounds(text, &x1, &y1, &w, &h);
  int x = (dma_display->width() - (int)w) / 2;
  dma_display->setTextColor(color);
  dma_display->setCursor(x - x1, yTop - y1);
  dma_display->print(text);
}

inline void uiDrawCenteredTile(int ox, int /*oy*/, int tw, int yTop,
                               const char* text, uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  uiTextBounds(text, &x1, &y1, &w, &h);
  int x = ox + (tw - (int)w) / 2;
  dma_display->setTextColor(color);
  dma_display->setCursor(x - x1, yTop - y1);
  dma_display->print(text);
}

inline void uiDrawCenteredScrim(const char* text, int yTop, uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  uiTextBounds(text, &x1, &y1, &w, &h);
  int x = (dma_display->width() - (int)w) / 2;
  dma_display->fillRect(x - 1, yTop - 1, (int)w + 2, (int)h + 2, 0);
  dma_display->setTextColor(color);
  dma_display->setCursor(x - x1, yTop - y1);
  dma_display->print(text);
}

// 1px black outline via two glyph passes + drawPixel (not 8× print).
// Multi-print outlines on the DMA buffer tore / flickered the corner clock.
inline void uiDrawCharPass(const GFXfont* font, char ch, int& cursorX, int baselineY,
                           uint16_t color, bool outlinePass) {
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
              dma_display->drawPixel(px + dx, py + dy, 0);
            }
          }
        } else {
          dma_display->drawPixel(px, py, color);
        }
      }
      bits <<= 1;
    }
  }
  cursorX += (int)pgm_read_byte(&glyph->xAdvance);
}

inline void uiDrawOutlined(const char* text, int x, int yTop, uint16_t ink) {
  if (!text) return;
  const GFXfont* font = PF_UI_FONT_CHROME;
  if (!font) return;  // outlining walks glyphs; the built-in 5x7 has none
  int baseline = yTop + (int)pgm_read_byte(&font->yAdvance);
  int cx = x;
  for (const char* p = text; *p; ++p) {
    uiDrawCharPass(font, *p, cx, baseline, ink, true);
  }
  cx = x;
  for (const char* p = text; *p; ++p) {
    uiDrawCharPass(font, *p, cx, baseline, ink, false);
  }
}

// Same outline, but `baselineY` is an Adafruit-GFX cursor Y (as from y - y1).
inline void uiDrawOutlinedAtBaseline(const char* text, int cursorX, int baselineY,
                                     uint16_t ink) {
  if (!text) return;
  const GFXfont* font = PF_UI_FONT_CHROME;
  if (!font) return;
  int cx = cursorX;
  for (const char* p = text; *p; ++p) {
    uiDrawCharPass(font, *p, cx, baselineY, ink, true);
  }
  cx = cursorX;
  for (const char* p = text; *p; ++p) {
    uiDrawCharPass(font, *p, cx, baselineY, ink, false);
  }
}

inline void uiDrawOutlinedTitleAtBaseline(const char* text, int cursorX,
                                          int baselineY, uint16_t ink) {
  if (!text) return;
  const GFXfont* font = PF_UI_FONT_TITLE;
  if (!font) return;
  int cx = cursorX;
  for (const char* p = text; *p; ++p) {
    uiDrawCharPass(font, *p, cx, baselineY, ink, true);
  }
  cx = cursorX;
  for (const char* p = text; *p; ++p) {
    uiDrawCharPass(font, *p, cx, baselineY, ink, false);
  }
}

inline void uiDrawCenteredTileScrim(int ox, int /*oy*/, int tw, int yTop,
                                    const char* text, uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  uiTextBounds(text, &x1, &y1, &w, &h);
  int x = ox + (tw - (int)w) / 2;
  dma_display->fillRect(x - 1, yTop - 1, (int)w + 2, (int)h + 2, 0);
  dma_display->setTextColor(color);
  dma_display->setCursor(x - x1, yTop - y1);
  dma_display->print(text);
}

// One title line, centered in the tile with a dark scrim.
inline void uiDrawTitleLineTile(int ox, int tw, int yTop, const char* text, uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  uiTitleTextBounds(text, &x1, &y1, &w, &h);
  int x = ox + (tw - (int)w) / 2;
  dma_display->fillRect(x - 1, yTop - 1, (int)w + 2, (int)h + 2, 0);
  dma_display->setTextColor(color);
  dma_display->setCursor(x - x1, yTop - y1);
  dma_display->print(text);
}

// Word-wrap `name` into the tile with the title font (advance-width fit).
// reserveBottom: pixels kept free at the tile bottom (SELECT footer, etc.).
// maxLines: hard cap; banner uses more of the 64×64 tile than SELECT.
inline int uiDrawWrappedTitleTile(int ox, int oy, int tw, int th, int yTop,
                                  const char* name, uint16_t color,
                                  int reserveBottom = -1, int maxLines = 0) {
  const int maxW = tw - 4;
  const int pitch = uiTitleLinePitch();
  if (reserveBottom < 0) reserveBottom = uiLinePitch() + 4;
  if (maxLines <= 0) {
    // How many title rows fit between yTop and the reserved footer.
    int fit = (oy + th - reserveBottom - yTop) / pitch;
    maxLines = fit < 1 ? 1 : (fit > 6 ? 6 : fit);
  }
  const int bottomLimit = oy + th - reserveBottom;

  // Fast path: whole string fits one line (no embedded breaks).
  // Vertically center like the wrap path — otherwise a short MQTT banner
  // sits at yTop while a wrapping one lands in the middle of the tile.
  if (!strchr(name, '\n') && uiTitleAdvanceWidth(name) <= maxW) {
    int avail = bottomLimit - yTop;
    int startY = yTop;
    if (pitch < avail) startY = yTop + (avail - pitch) / 2;
    uiDrawTitleLineTile(ox, tw, startY, name, color);
    return startY + pitch;
  }

  char buf[80];
  strncpy(buf, name, sizeof(buf) - 1);
  buf[sizeof(buf) - 1] = '\0';

  char lines[6][48];
  if (maxLines > 6) maxLines = 6;
  int nLines = 0;
  char* cursor = buf;

  while (*cursor && nLines < maxLines) {
    while (*cursor == ' ') cursor++;
    if (!*cursor) break;
    if (*cursor == '\n') {
      cursor++;
      continue;
    }

    char* lineStart = cursor;
    char* lastSpace = nullptr;
    char* p = cursor;

    while (*p && *p != '\n') {
      if (*p == ' ') lastSpace = p;
      // Measure [lineStart .. p] inclusive via temporary NUL after p.
      char saved1 = p[1];
      p[1] = '\0';
      int adv = uiTitleAdvanceWidth(lineStart);
      p[1] = saved1;
      if (adv > maxW) break;
      p++;
    }

    if (p == lineStart) {
      // First glyph alone is wider than the tile — draw what we can.
      char one[2] = {lineStart[0], '\0'};
      uiDrawTitleLineTile(ox, tw, yTop, one, color);
      return yTop + pitch;
    }

    // Prefer word boundary on width overflow; keep hard breaks at \n / EOS.
    char* cut = p;
    if (*p && *p != '\n' && lastSpace && lastSpace > lineStart) {
      cut = lastSpace;
    }

    char keep = *cut;
    *cut = '\0';
    strncpy(lines[nLines], lineStart, sizeof(lines[0]) - 1);
    lines[nLines][sizeof(lines[0]) - 1] = '\0';
    nLines++;
    *cut = keep;
    if (keep == ' ' || keep == '\n') cursor = cut + 1;
    else cursor = cut;

    if (yTop + nLines * pitch > bottomLimit) break;
  }

  int blockH = nLines * pitch;
  int avail = bottomLimit - yTop;
  int startY = yTop;
  if (blockH < avail) startY = yTop + (avail - blockH) / 2;

  for (int i = 0; i < nLines; i++) {
    uiDrawTitleLineTile(ox, tw, startY + i * pitch, lines[i], color);
  }
  return startY + nLines * pitch;
}

inline void uiDrawAt(const char* text, int x, int yTop, uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  uiTextBounds(text, &x1, &y1, &w, &h);
  dma_display->setTextColor(color);
  dma_display->setCursor(x - x1, yTop - y1);
  dma_display->print(text);
}

inline void uiDrawAtTitle(const char* text, int x, int yTop, uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  uiTitleTextBounds(text, &x1, &y1, &w, &h);
  dma_display->setTextColor(color);
  dma_display->setCursor(x - x1, yTop - y1);
  dma_display->print(text);
}

// ── Compatibility shim ───────────────────────────────────────────────────────
// The sketch's SELECT screen and MQTT banner were written against the older
// TomThumb helper set (PatternflowUiText::drawWrappedName & co). The fonts
// underneath come from core_ui_fonts.h now; this namespace keeps those
// call sites working by mapping the old vocabulary onto the ui* helpers
// above — same word-wrap behaviour, new glyphs.
namespace PatternflowUiText {

inline void useNameFont() { uiUseSelectFont(); }
inline void useMessageFont() { uiUseTitleFont(); }
inline void useChromeFont() { uiUseCompactFont(); }
inline void useDefaultFont() { uiUseDefaultFont(); }

constexpr int CHROME_PITCH = 7;
constexpr int MAX_NAME_LINES = 3;
constexpr size_t NAME_BUF = 64;
constexpr size_t LINE_BUF = 48;

inline void boundsWith(void (*chooseFont)(), const char* text,
                       int16_t* x1, int16_t* y1, uint16_t* w, uint16_t* h) {
  chooseFont();
  dma_display->getTextBounds(text, 0, 0, x1, y1, w, h);
}

inline void drawLine(void (*chooseFont)(), const char* text, int yTop,
                     uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  boundsWith(chooseFont, text, &x1, &y1, &w, &h);
  int x = (dma_display->width() - (int)w) / 2;
  dma_display->fillRect(x - 2, yTop - 2, (int)w + 4, (int)h + 4, 0);
  dma_display->setTextColor(color);
  dma_display->setCursor(x - x1, yTop - y1);
  dma_display->print(text);
}

inline void drawChromeLine(const char* text, int yTop, uint16_t color) {
  drawLine(useChromeFont, text, yTop, color);
}

// Word-wrap to the panel width, centered block, middle at yMiddle. A single
// word too wide for the chosen font falls back to the compact font rather
// than clipping. Returns the height used.
inline int drawWrapped(void (*chooseFont)(), int pitch, const char* name,
                       int yMiddle, uint16_t color) {
  const int maxW = dma_display->width() - 4;
  int16_t x1, y1;
  uint16_t w, h;

  boundsWith(chooseFont, name, &x1, &y1, &w, &h);
  if ((int)w <= maxW) {
    drawLine(chooseFont, name, yMiddle - pitch / 2, color);
    return pitch;
  }

  char buf[NAME_BUF];
  snprintf(buf, sizeof(buf), "%s", name);

  char lines[MAX_NAME_LINES][LINE_BUF];
  int nLines = 0;
  char* cursor = buf;

  while (*cursor && nLines < MAX_NAME_LINES) {
    while (*cursor == ' ') cursor++;
    if (!*cursor) break;

    char* lineStart = cursor;
    char* lastSpace = nullptr;
    char* p = cursor;

    while (*p) {
      if (*p == ' ') lastSpace = p;
      char saved = p[1];
      p[1] = '\0';
      boundsWith(chooseFont, lineStart, &x1, &y1, &w, &h);
      p[1] = saved;
      if ((int)w > maxW) break;
      p++;
    }

    if (p == lineStart) {
      drawChromeLine(lineStart, yMiddle - CHROME_PITCH / 2, color);
      return CHROME_PITCH;
    }

    char* cut = (lastSpace && lastSpace > lineStart && *p) ? lastSpace : p;
    char keep = *cut;
    *cut = '\0';
    snprintf(lines[nLines], LINE_BUF, "%s", lineStart);
    nLines++;
    *cut = keep;
    cursor = (*cut == ' ') ? cut + 1 : cut;
  }

  int blockH = nLines * pitch;
  int startY = yMiddle - blockH / 2;
  for (int i = 0; i < nLines; i++) {
    drawLine(chooseFont, lines[i], startY + i * pitch, color);
  }
  return blockH;
}

inline int drawWrappedName(const char* name, int yMiddle, uint16_t color) {
  return drawWrapped(useNameFont, uiSelectLinePitch(), name, yMiddle, color);
}

inline int drawWrappedMessage(const char* text, int yMiddle, uint16_t color) {
  return drawWrapped(useMessageFont, uiTitleLinePitch(), text, yMiddle, color);
}

}  // namespace PatternflowUiText
