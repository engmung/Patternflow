// ═══════════════════════════════════════════════════════════
// PatternFlow - on-panel text for the portrait OS overlays
//
// The OS screens (SELECT / NETWORK / KNOB MAP / UPDATE) draw at
// setRotation(1), which makes the usable line **64 px wide**. The stock
// Adafruit 5x7 font puts ~10 characters in that at size 1 and ~5 at size 2,
// so a pattern name longer than a word ran off both edges — and since
// patterns now arrive from a community rather than a curated list, names
// like "Chromatic Aberration Vortex" are the normal case, not the exception.
//
// The fix is word wrap, NOT a smaller font. Org_01 was tried first — it puts
// about twice as many characters on a line — and read badly on the panel:
// at this pixel pitch its thin strokes blur together, and a name you cannot
// read is worse than one that wraps. The stock 5x7 is the most legible
// bitmap available at this size, and three wrapped lines of it hold 30
// characters, which covers every name in the library.
//
// TomThumb survives for chrome only — short, known hint text like
// "HOLD TO SELECT", which is 84 px in the stock font and does not fit at all.
//
// Custom GFX fonts position from the BASELINE, not the top-left like the
// built-in one, so every helper here places text by its bounding box
// (`yTop - y1`) rather than passing yTop to setCursor directly. That is a
// no-op for the built-in font (y1 is 0) and essential for TomThumb.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "core_display.h"   // brings in the panel type
#include <Fonts/TomThumb.h>

// Owned by the sketch.
extern MatrixPanel_I2S_DMA* dma_display;

namespace PatternflowUiText {

// Line advance for each font, including the gap that keeps stacked lines
// from touching. The built-in font is 7 px tall; TomThumb is 6.
constexpr int NAME_PITCH = 9;
constexpr int CHROME_PITCH = 7;
// Three lines is 27 px — about a fifth of the portrait screen, which is as
// much as the SELECT overlay can give up without burying the live preview it
// exists to show. At ~10 characters a line that is 30 characters, more than
// any name in the library needs.
constexpr int MAX_NAME_LINES = 3;
constexpr size_t NAME_BUF = 64;
constexpr size_t LINE_BUF = 48;

// The stock 5x7. Legibility beats density here: see the note at the top.
inline void useNameFont() {
  dma_display->setFont();
  dma_display->setTextSize(1);
}

inline void useChromeFont() {
  dma_display->setFont(&TomThumb);
  dma_display->setTextSize(1);
}

// Back to the built-in 5x7. Anything that draws after an overlay must call
// this, or it inherits the custom font's baseline placement.
inline void useDefaultFont() {
  dma_display->setFont();
  dma_display->setTextSize(1);
}

inline void boundsWith(void (*chooseFont)(), const char* text,
                       int16_t* x1, int16_t* y1, uint16_t* w, uint16_t* h) {
  chooseFont();
  dma_display->getTextBounds(text, 0, 0, x1, y1, w, h);
}

// One centered line on its own tight scrim — the same look every overlay
// already shares, just measured for the chosen font.
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

// Word-wrap `name` to the panel width and draw it as a centered block whose
// vertical middle sits at `yMiddle`. Returns the height actually used.
//
// A single word too wide to fit is drawn in the chrome font instead of being
// clipped: smaller and still readable beats half a word.
inline int drawWrappedName(const char* name, int yMiddle, uint16_t color) {
  const int maxW = dma_display->width() - 4;
  int16_t x1, y1;
  uint16_t w, h;

  boundsWith(useNameFont, name, &x1, &y1, &w, &h);
  if ((int)w <= maxW) {
    drawLine(useNameFont, name, yMiddle - NAME_PITCH / 2, color);
    return NAME_PITCH;
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

    // Grow the line one character at a time until it stops fitting. The
    // terminator is moved rather than copied — measuring a substring is the
    // only way to ask this font how wide it renders.
    while (*p) {
      if (*p == ' ') lastSpace = p;
      char saved = p[1];
      p[1] = '\0';
      boundsWith(useNameFont, lineStart, &x1, &y1, &w, &h);
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

  int blockH = nLines * NAME_PITCH;
  int startY = yMiddle - blockH / 2;
  for (int i = 0; i < nLines; i++) {
    drawLine(useNameFont, lines[i], startY + i * NAME_PITCH, color);
  }
  return blockH;
}

}  // namespace PatternflowUiText
