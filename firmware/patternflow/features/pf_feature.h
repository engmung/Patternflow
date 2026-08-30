// ═══════════════════════════════════════════════════════════
// PatternFlow - the feature interface
//
// How a feature attaches to the core without the core knowing it exists.
//
// The sketch used to call every feature by name: PatternflowShow::tick(),
// PatternflowMqtt::handle(), and 65 more. That is why two people could not
// add features without colliding — both had to edit the same file, in the
// same places. Here the sketch announces moments instead ("boot", "a frame",
// "somebody touched a knob") and whoever cares listens.
//
// A variant therefore never edits a core file. It adds its own directory
// under features/ and one line to features/features.h, so its whole diff against
// the core is additions and `git merge upstream` stays clean.
//
// Every hook is optional: leave a field null and that moment passes the
// feature by.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "../src/core_encoders.h"  // InputFrame

// What a feature can see about the frame being drawn. Passed to the hooks
// that run inside the render loop, so a feature never has to reach into the
// sketch's globals for it.
struct PFFeatureFrame {
  float dt;                  // seconds since the previous frame
  const char* patternName;   // display name of the running pattern, may be null
  bool running;              // false while a menu/overlay owns the panel
  // The sketch has its own chrome on screen (info screen, knob map,
  // update screen, brightness bar). Decorative overlays must stay off
  // while this is true or they draw over the device's own UI. Learned
  // from the weather clock, which checked four sketch globals to work
  // this out for itself.
  bool chromeVisible;
  // Registry index of the running pattern, or -1. Names are what an
  // feature usually wants, but a published wire protocol can be pinned to
  // the index — OSC's /patternflow/pattern/index is, and hosts are built
  // against it, so the index cannot be swapped for the name after the
  // fact.
  int patternIndex;
  // The sketch's own mode enum, as an int. `running` is the same fact
  // reduced to a bool and is what most features should use; this is for
  // the one case that has to report the raw value outward.
  int appMode;
};

// ── Widening this struct ────────────────────────────────────────────────
//
// New hooks and fields go AT THE TAIL, never inserted or reordered. Every
// descriptor is a positional aggregate initializer, and adjacent fields of
// the same type (the nav triple, the three runtime-toggle entries) reorder
// without a compiler diagnostic - the build stays green and every feature
// quietly wires the wrong function to the wrong hook. Out-of-tree features
// recompile against the checkout they are copied onto, so a tail-append is
// always safe for them: their shorter initializer list value-initializes the
// new tail to null, which every dispatch site treats as "not implemented".
//
// After widening, `./firmware/bundles/build.sh all` is the test - a hook
// change that compiles against one composition is not tested.
struct PFFeature {
  // Identity. `cap` is the string this feature contributes to /api/status
  // caps (null = contributes nothing) — what the site and the lab probe
  // instead of assuming a feature exists.
  const char* name;
  const char* cap;

  // Boot, before Wi-Fi. Load settings, allocate, register nothing that
  // needs a network.
  void (*setup)();

  // The Wi-Fi connect edge, and every reconnect. Register HTTP routes
  // (PatternflowHttp::server()) and start network services here.
  void (*onNetwork)();

  // Every frame. MUST NOT block: no delay(), no long loops, no waiting on
  // a socket. The panel is not being drawn while this runs.
  void (*loop)(const PFFeatureFrame&);

  // The finished input frame, after every source has been merged and the
  // absolute bus applied — what the pattern is about to see. For features
  // that mirror or publish state rather than produce it. Read-only by
  // convention: writing here is what fillInput is for.
  // Takes the feature frame rather than a bare name: the fifth port (OSC)
  // needed two more facts about the same moment, and widening the struct
  // once beats adding a parameter every time that happens.
  void (*observeFrame)(const InputFrame&, const PFFeatureFrame&);

  // Contribute to the input frame before the pattern sees it — drive a
  // knob lane from a sensor, a reading, a stream. Runs before the
  // absolute bus is applied, so a pinned channel still outranks this.
  void (*fillInput)(InputFrame&);

  // A human turned a knob or pressed a button. Schedulers use this to know
  // the device is attended; anything with an idle timer wants it.
  void (*onUserInput)();

  // "I am driving the pattern right now." While any feature says true, the
  // sketch ignores pattern-change requests from OSC, MQTT and HTTP — a
  // running show must not have the pattern yanked out from under it.
  bool (*claimsPattern)();

  // "Switch to this pattern index, please." Return true and set idx to
  // request it; the sketch performs the switch, because loading a module
  // is its job and not a feature's.
  bool (*takePattern)(int* idx);

  // The panel went to sleep, or woke. Anything mirroring device state
  // wants to know; anything with a timer may want to stand down.
  void (*onSleep)(bool sleeping);

  // "Put the device to sleep / wake it, please." Return true and set
  // `sleeping` to request it. Like takePattern this is a request: the
  // sketch owns stopping DMA and reclocking the CPU, which is not
  // something to do from inside a feature's loop.
  bool (*requestSleep)(bool* sleeping);

  // A feature the user can switch off at the device, without reflashing.
  // Expose both and the NETWORK screen lists it as a row with a state,
  // and a knob turn there toggles it — so the device's own menu can
  // offer features it knows nothing about. `shortName` is what that row
  // shows: three or four characters, the panel is 64 px wide.
  const char* shortName;
  bool (*isRuntimeEnabled)();
  void (*setRuntimeEnabled)(bool);

  // Append fields to /api/status. Write `,"key":value` pairs — leading
  // comma, no trailing one — into the string. The core used to report
  // MQTT's role and connection itself, which is a core file knowing an
  // optional feature's state; this is how a feature says its own.
  void (*appendStatus)(String&);

  // After the pattern has drawn, before the frame is presented. Clocks,
  // banners, subtitles. Keep it cheap — this is per frame.
  void (*drawOverlay)(const PFFeatureFrame&);

  // The console header's nav, the same idea one screen out. A feature that
  // serves a page says where it is and what to call it, and the core lists
  // it without knowing what it is.
  //
  // This exists because the alternative was already happening: theme_index.h
  // - a core file - had /show, /mqtt and /weather written into it by name,
  // gated on caps so they degraded correctly but named all the same. Adding a
  // fourth was the moment to stop. Null on both means no nav entry.
  const char* navPath;
  const char* navLabel;

  // One plain-text line for the console home page's row under that label.
  // This is the last thing the core used to know about features by name: the
  // home page carried a hand-written row for /show, /mqtt and /weather -
  // gated on caps so it degraded, but written into a core page all the same,
  // which is how the Audio edition's Mic page ended up with a header link
  // and no home row. Now the row travels with the feature.
  //
  // Plain text, no quotes - it rides inside /api/status JSON unescaped.
  const char* navDesc;
};

// ── Legacy name shim (2026-08-30) ───────────────────────────────────────
//
// The tree was addons/ and the vocabulary was "addon" until docs/EDITIONS.md
// settled on "feature". An out-of-tree composition written against the old
// names — two files copied over a checkout, the recipe Simone's bundle uses —
// must keep building, so the old spellings are accepted here and mapped.
// Delete this block once every out-of-tree bundle has migrated.
using PFAddon = PFFeature;
using PFAddonFrame = PFFeatureFrame;
