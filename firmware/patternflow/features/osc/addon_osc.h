// ── Legacy name shim (2026-08-30) ───────────────────────────────────────
// This feature's descriptor lives in feature_osc.h; the tree was addons/ and
// the file was addon_osc.h until the vocabulary settled on "feature". An
// out-of-tree features_local.h (or addons_local.h) written against the old
// names includes this and gets the real thing plus the old namespace as an
// alias. Delete once every out-of-tree bundle has migrated.
#pragma once
#include "feature_osc.h"
namespace PFAddonOsc = PFFeatureOsc;
