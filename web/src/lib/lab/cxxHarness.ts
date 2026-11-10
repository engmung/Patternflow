// The host C++ compiler and the stand-ins the Lab's header tests build
// against: textExport.test.ts runs the header it builds, hExport.test.ts asks
// the compiler whether the scaffold builds at all. The scaffold includes the
// firmware's own math, colour, memory and param headers from FIRMWARE; only
// the panel, the encoders and Arduino.h are stood in for, and the stand-in
// canvas keeps the frame in logical coordinates, the ones the pattern writes.
// Tests import this file. The app does not.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FIRMWARE = path.resolve(__dirname, "../../../../firmware/patternflow");

/** The first compiler on the PATH. Each test file throws when CI has none. */
export const CXX = ["c++", "g++", "clang++"].find((compiler) => {
  try {
    execFileSync(compiler, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});

const STUBS: Record<string, string> = {
  "Arduino.h": `#pragma once
#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#define PI 3.1415926535897932384626433832795
#define TWO_PI 6.283185307179586476925286766559
#define HALF_PI 1.5707963267948966192313216916398
`,
  "config.h": `#pragma once
#define PANEL_RES_W 128
#define PANEL_RES_H 64
`,
  "src/core_display.h": `#pragma once
`,
  // Field for field as firmware/patternflow/src/core_encoders.h has it.
  "src/core_encoders.h": `#pragma once
#include <Arduino.h>
struct InputFrame {
  long knobs[4];
  int knobDeltas[4];
  bool btnPressed[4];
  bool btnHeld[4];
  uint32_t now;
  bool knobAudioActive[4];
  float knobAudioValue[4];
  bool paramAbsoluteActive[4];
  uint16_t paramAbsolute[4];
  bool timeValid;
  uint8_t hour;
  uint8_t minute;
  uint8_t second;
};
`,
  "src/core_canvas.h": `#pragma once
#include <Arduino.h>
#include "config.h"
namespace PFCanvas {
inline uint8_t frame[PANEL_RES_W * PANEL_RES_H * 3];
inline int frameW = PANEL_RES_W, frameH = PANEL_RES_H;
inline int presents = 0;
inline void setFrame(int w, int h) { frameW = w; frameH = h; }
inline void setPixel(int x, int y, uint8_t r, uint8_t g, uint8_t b) {
  if ((unsigned)x >= (unsigned)frameW || (unsigned)y >= (unsigned)frameH) return;
  uint8_t* p = frame + ((size_t)y * frameW + x) * 3;
  p[0] = r; p[1] = g; p[2] = b;
}
inline void present() { presents++; }
}
`,
};

/** Write the stand-ins under dir/stub. */
export function writeStubs(dir: string) {
  for (const [file, text] of Object.entries(STUBS)) {
    fs.mkdirSync(path.dirname(path.join(dir, "stub", file)), { recursive: true });
    fs.writeFileSync(path.join(dir, "stub", file), text);
  }
}

/** Flags for a build in dir: warnings are errors, and the stand-ins come before the firmware. */
export function cxxFlags(dir: string): string[] {
  return ["-std=c++17", "-O0", "-Wall", "-Werror", "-Wno-unused-function", "-Wno-unused-variable", "-I", path.join(dir, "stub"), "-I", FIRMWARE, "-I", dir];
}
