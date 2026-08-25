// SPDX-License-Identifier: MIT
// Pattern: Black
// Full-black framebuffer (panel stays powered). Night / alarm-clock face;
// the schedule may overlay a dim or large clock after present().
#pragma once

#include "../src/core_canvas.h"
#include "../src/core_encoders.h"

namespace Black {
  const char* NAME = "Black";
  const char* KNOB_LABELS[4] = {"-", "-", "-", "-"};
  constexpr bool ABSOLUTE_READY = false;

  enum Face : uint8_t { Off = 0, Dim = 1, Big = 2 };
  inline Face face = Off;

  void setup() {}
  void update(float /*dt*/, const InputFrame& /*input*/) {}

  void draw() {
    PFCanvas::resetFrame();
    PFCanvas::clear();
    PFCanvas::present();
  }
}
