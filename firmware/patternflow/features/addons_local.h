// An out-of-tree bundle written against the PRE-RENAME vocabulary, verbatim:
// old filename (addons_local.h), old descriptor headers, old namespaces, old
// macro. If this stops building, the legacy shim broke.
#pragma once
#include "osc/addon_osc.h"
#include "audio/addon_audio.h"
#define PF_ADDON_LIST            \
    &PFAddonOsc::descriptor,     \
    &PFAddonAudio::descriptor
