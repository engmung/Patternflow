// ═══════════════════════════════════════════════════════════
// PatternFlow - presets contributed by features
//
// Most features need no pattern of their own. Some do: the show scheduler's
// night face is a pattern, because "what is on the panel" is how the rest
// of the firmware talks about that state.
//
// Same rule as features.h — a variant adds a line here and nothing else in
// the tree changes. An empty list is valid and is what the bare core has.
//
// The registry includes this file; nothing in src/ does. A preset listed
// here appears in the pattern list exactly like a core one.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

// The default is EMPTY. It used to be the other way round: this file
// included the show player's Black pattern unless a composition opted out,
// so the bare core - a build with no show player at all - carried one
// feature's pattern, and the audio edition needed an empty define to be rid
// of it. This file's own comment called that "exactly the kind of thing
// nobody can explain later" and then recreated it as the default.
//
// Now a composition that carries a preset says so in overrides.h, twice:
//
//   #define PF_FEATURE_PRESET_INCLUDE "show/preset_black.h"
//   #define PF_FEATURE_PRESETS PATTERN_ENTRY_HIDDEN(Black),
//
// The include is taken HERE, not in features_local.h, and the placement is
// load-bearing: pattern_registry.h reaches this file immediately before it
// expands PF_FEATURE_PRESETS, and the registry's first parse happens wherever
// some core header pulls it in - which is before the composition's own
// includes run. An include anywhere else declares the namespace after the
// one expansion that needed it (that build failure is how this comment got
// written). One include; a composition with several presets points this at
// a wrapper header of its own.
//
// Entries expand inside presetPatterns[] in pattern_registry.h; keep the
// trailing comma on every entry.
// Legacy macro names (pre-rename), mapped before they are read.
#if defined(PF_ADDON_PRESET_INCLUDE) && !defined(PF_FEATURE_PRESET_INCLUDE)
#define PF_FEATURE_PRESET_INCLUDE PF_ADDON_PRESET_INCLUDE
#endif
#if defined(PF_ADDON_PRESETS) && !defined(PF_FEATURE_PRESETS)
#define PF_FEATURE_PRESETS PF_ADDON_PRESETS
#endif

#ifdef PF_FEATURE_PRESET_INCLUDE
#include PF_FEATURE_PRESET_INCLUDE
#endif

#ifndef PF_FEATURE_PRESETS
#define PF_FEATURE_PRESETS
#endif
