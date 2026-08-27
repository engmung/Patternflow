// ═══════════════════════════════════════════════════════════
// PatternFlow - presets contributed by addons
//
// Most addons need no pattern of their own. Some do: the show scheduler's
// night face is a pattern, because "what is on the panel" is how the rest
// of the firmware talks about that state.
//
// Same rule as addons.h — a variant adds a line here and nothing else in
// the tree changes. An empty list is valid and is what the bare core has.
//
// The registry includes this file; nothing in src/ does. A preset listed
// here appears in the pattern list exactly like a core one.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

// A variant may define PF_ADDON_PRESETS in its overrides.h — including as
// nothing at all — and the defaults below then do not apply. Without that
// escape a build with no show player still carried the show player's
// pattern, which is exactly the kind of thing nobody can explain later.
#ifndef PF_ADDON_PRESETS

#include "show/preset_black.h"

// Expanded inside presetPatterns[] in pattern_registry.h. Keep the trailing
// comma on every entry; an empty definition is fine.
// Black is hidden: the scheduler switches to it by name, and it is the
// panel going dark rather than something anyone wants to land on while
// turning K4 through the pattern list.
#define PF_ADDON_PRESETS \
  PATTERN_ENTRY_HIDDEN(Black),

#endif
