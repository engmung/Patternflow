// ═══════════════════════════════════════════════════════════
// PatternFlow - the addon interface
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
// under addons/ and one line to addons/addons.h, so its whole diff against
// the core is additions and `git merge upstream` stays clean.
//
// Every hook is optional: leave a field null and that moment passes the
// addon by.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "../src/core_encoders.h"  // InputFrame

// What an addon can see about the frame being drawn. Passed to the hooks
// that run inside the render loop, so an addon never has to reach into the
// sketch's globals for it.
struct PFAddonFrame {
  float dt;                  // seconds since the previous frame
  const char* patternName;   // display name of the running pattern, may be null
  bool running;              // false while a menu/overlay owns the panel
  // The sketch has its own chrome on screen (info screen, knob map,
  // update screen, brightness bar). Decorative overlays must stay off
  // while this is true or they draw over the device's own UI. Learned
  // from the weather clock, which checked four sketch globals to work
  // this out for itself.
  bool chromeVisible;
};

struct PFAddon {
  // Identity. `cap` is the string this addon contributes to /api/status
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
  void (*loop)(const PFAddonFrame&);

  // Contribute to the input frame before the pattern sees it — drive a
  // knob lane from a sensor, a reading, a stream. Runs before the
  // absolute bus is applied, so a pinned channel still outranks this.
  void (*fillInput)(InputFrame&);

  // A human turned a knob or pressed a button. Schedulers use this to know
  // the device is attended; anything with an idle timer wants it.
  void (*onUserInput)();

  // "I am driving the pattern right now." While any addon says true, the
  // sketch ignores pattern-change requests from OSC, MQTT and HTTP — a
  // running show must not have the pattern yanked out from under it.
  bool (*claimsPattern)();

  // "Switch to this pattern index, please." Return true and set idx to
  // request it; the sketch performs the switch, because loading a module
  // is its job and not an addon's.
  bool (*takePattern)(int* idx);

  // After the pattern has drawn, before the frame is presented. Clocks,
  // banners, subtitles. Keep it cheap — this is per frame.
  void (*drawOverlay)(const PFAddonFrame&);
};
