// ═══════════════════════════════════════════════════════════
// PatternFlow - which font each piece of on-panel text uses
//
// The panel's own UI (SELECT, NETWORK, banners) draws with three fonts, and
// which three is a taste question, not an engineering one. A 6-row matrix
// font fits more on a line; the stock 5×7 is easier to read at a glance.
// Reasonable people disagree, and this file is where they disagree without
// editing each other's code.
//
// Three roles, each an #ifndef so a build can rebind it before this header
// is reached — from patternflow_secrets.h, a -D flag, or a variant's own
// overrides header:
//
//   PF_UI_FONT_CHROME   small print: NETWORK rows, hints, status lines
//   PF_UI_FONT_SELECT   pattern names on the SELECT screen
//   PF_UI_FONT_TITLE    banner messages and titles
//
// nullptr means the Adafruit GFX built-in 5×7. Anything else is a pointer
// to a GFXfont — include its header first (see PF_UI_FONT_INCLUDE).
//
// The defaults are the project's own: the built-in 5×7 for names because
// legibility beats density on a 64 px line, TomThumb for chrome where the
// text is small anyway, Org_01 for banners where a long message has to fit.
// The MatrixLight pair from trip5/Matrix-Fonts ships alongside for anyone
// who prefers them — see the block at the bottom.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <Fonts/Org_01.h>
#include <Fonts/TomThumb.h>

// A variant or a local build can name one extra header to pull in before the
// bindings below, so a font that is not one of the built-ins is reachable:
//   -DPF_UI_FONT_INCLUDE='"fonts/MatrixLight8X.h"'
#ifdef PF_UI_FONT_INCLUDE
#include PF_UI_FONT_INCLUDE
#endif
#ifdef PF_UI_FONT_INCLUDE2
#include PF_UI_FONT_INCLUDE2
#endif

// ── The three roles ─────────────────────────────────────────
#ifndef PF_UI_FONT_CHROME
#define PF_UI_FONT_CHROME (&TomThumb)
#endif

#ifndef PF_UI_FONT_SELECT
#define PF_UI_FONT_SELECT nullptr   // the stock 5x7
#endif

#ifndef PF_UI_FONT_TITLE
#define PF_UI_FONT_TITLE (&Org_01)
#endif

// Line pitch per role. A font swap changes how tall a line is, and the
// layout code asks here rather than assuming — get these wrong and text
// overlaps rather than failing to compile.
#ifndef PF_UI_PITCH_CHROME
#define PF_UI_PITCH_CHROME 7
#endif
#ifndef PF_UI_PITCH_SELECT
#define PF_UI_PITCH_SELECT 9
#endif
#ifndef PF_UI_PITCH_TITLE
#define PF_UI_PITCH_TITLE 9
#endif

// ── Using the MatrixLight pair instead ──────────────────────
// The fonts Simone Majocchi's tree uses, kept in src/fonts/. To take them,
// put this in patternflow_secrets.h (or a variant's overrides header):
//
//   #define PF_UI_FONT_INCLUDE  "fonts/MatrixLight6.h"
//   #define PF_UI_FONT_INCLUDE2 "fonts/MatrixLight8X.h"
//   #define PF_UI_FONT_CHROME   (&MatrixLight6)
//   #define PF_UI_FONT_SELECT   (&MatrixLight8X)
//   #define PF_UI_FONT_TITLE    (&MatrixLight8X)
//   #define PF_UI_PITCH_CHROME  7
//   #define PF_UI_PITCH_SELECT  9
//   #define PF_UI_PITCH_TITLE   9
//
// Nothing else in the tree changes, which is the point: a font is a
// preference, and a preference should not be a fork.
