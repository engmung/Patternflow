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
#include <Fonts/Org_01.h>

// Owned by the sketch.
extern MatrixPanel_I2S_DMA* dma_display;

namespace PatternflowUiText {

// Line advance for each font, including the gap that keeps stacked lines
// from touching. The built-in font is 7 px tall; TomThumb is 6.
constexpr int NAME_PITCH = 9;
constexpr int CHROME_PITCH = 7;
// Org_01 is 8 px tall and sits tight; 9 keeps stacked lines apart.
constexpr int MESSAGE_PITCH = 9;
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

// Org_01 — about twice the characters per line. Only the message banner
// uses it; see drawWrappedMessage for why that is not a contradiction of the
// note at the top of this file.
inline void useMessageFont() {
  dma_display->setFont(&Org_01);
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

    // Grow the line one character at a time until it stops fitting. The
    // terminator is moved rather than copied — measuring a substring is the
    // only way to ask this font how wide it renders.
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

/** Pattern names and OS text: the stock 5x7, chosen for legibility. */
inline int drawWrappedName(const char* name, int yMiddle, uint16_t color) {
  return drawWrapped(useNameFont, NAME_PITCH, name, yMiddle, color);
}

/**
 * A banner from <prefix>/message, in Org_01.
 *
 * The denser font, deliberately, and only here. A pattern name is one or two
 * words you glance at and must recognise, which is why the SELECT screen
 * stayed on the stock 5x7 after Org_01 was tried and found to blur at this
 * pixel pitch. A message is a sentence somebody wrote to be read, so fitting
 * it wins over per-character crispness — "Dinner is ready" at ~20 characters
 * a line is one line here and three in the stock font.
 *
 * @SimonePDA asked for this font for exactly that reason.
 */
inline int drawWrappedMessage(const char* text, int yMiddle, uint16_t color) {
  return drawWrapped(useMessageFont, MESSAGE_PITCH, text, yMiddle, color);
}

}  // namespace PatternflowUiText
