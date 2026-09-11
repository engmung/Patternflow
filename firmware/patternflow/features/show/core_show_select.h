// ═══════════════════════════════════════════════════════════
// PatternFlow - SELECT chrome for the Sequences feature
//
// The sketch must not name this feature. These helpers implement the
// SELECT hooks so Performance can toggle Normal ↔ Sequence playlist
// from K3 without putting PatternflowShow:: into patternflow.ino.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include "core_show.h"
#include "../../src/core_ui_text.h"

// dma_display is declared in the sketch / core_display; same pattern as
// the weather clock overlay — features draw without including the HUB75 init.

namespace PatternflowShowSelect {

inline uint16_t ledC() { return dma_display->color565(232, 85, 46); }
inline uint16_t dimC() { return dma_display->color565(80, 80, 80); }
inline uint16_t greyC() { return dma_display->color565(160, 160, 160); }
inline uint16_t softC() { return dma_display->color565(200, 200, 200); }

inline bool handleSelectInput(InputFrame& input) {
  if (input.knobDeltas[2] != 0) {
    bool nowSeq = PatternflowShow::toggleSequenceMode();
    Serial.printf(">>> SELECT mode → %s\n", nowSeq ? "SEQUENCE" : "NORMAL");
    input.knobDeltas[2] = 0;
  }
  // In Sequence mode the playlist owns the panel — suppress K4 browse.
  return PatternflowShow::isSequenceMode();
}

inline bool drawSelect() {
  if (!PatternflowShow::isSequenceMode()) return false;
  if (!dma_display) return true;

  uint16_t screenH = dma_display->height();
  PatternflowUiText::drawChromeLine("SEQUENCE", 10,
                                    dma_display->color565(190, 190, 190));

  char name[64];
  if (PatternflowShow::isPlaying() && PatternflowShow::title()[0]) {
    snprintf(name, sizeof(name), "%s", PatternflowShow::title());
  } else if (PatternflowShow::storedSize() > 0) {
    snprintf(name, sizeof(name), "%u SHOWS",
             (unsigned)PatternflowShow::storedSize());
  } else {
    snprintf(name, sizeof(name), "NO PLAYLIST");
  }
  PatternflowUiText::drawWrappedName(name, screenH / 2,
                                     dma_display->color565(255, 255, 255));
  PatternflowUiText::drawChromeLine("HOLD TO SELECT", screenH - 22, softC());
  PatternflowUiText::drawChromeLine("K3=NORMAL", screenH - 12, greyC());
  PatternflowUiText::useDefaultFont();
  return true;
}

inline void decorateSelect() {
  if (PatternflowShow::isSequenceMode()) return;
  if (!dma_display) return;
  uint16_t screenH = dma_display->height();
  PatternflowUiText::drawChromeLine("K3=SEQUENCE", screenH - 12, greyC());
  PatternflowUiText::useDefaultFont();
}

}  // namespace PatternflowShowSelect
