// Module slug → the JavaScript of the preset it was built from.
//
// A device stores compiled `.pfm` modules and a metadata sidecar. Neither
// carries source, so a card cannot ask a panel for the code of the pattern it
// is running. What it can do is recognise the modules from the Basics pack:
// the pack manifest maps each slug to the pattern number of the JS preset it
// was built from, and those presets are in this repo.
//
// The map is substituted at bundle time by scripts/build-ha-card.ts rather
// than generated into a file, so there is nothing to commit, nothing to keep
// in step by hand, and a fresh clone still typechecks and builds.
//
// Empty in any other context — importing this from the Next app would compile
// and simply find no patterns, which is the honest answer there.

declare const __PF_PRESET_CODE__: Record<string, string> | undefined;

export const PRESET_CODE: Record<string, string> =
  typeof __PF_PRESET_CODE__ === "undefined" ? {} : __PF_PRESET_CODE__;
