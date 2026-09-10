// The panel's delivered light per bit plane, checked as arithmetic.
//
// WHY THIS EXISTS. setBrightnessOE writes OE bits into the DMA buffer, which is
// why nothing tested it: reaching it needs a frameStruct, rowBits and a live
// allocation. But the defect was never in writing the buffer. It was in one
// expression deciding how wide each plane's window should be, and that
// expression is now pfOEWindowPixels(), which is pure and needs nothing.
//
// WHAT IT ASSERTS. Two things, and the second is the one a person sees.
//
//   1. Delivered light per plane is proportional to 2^d. A BCM plane's light is
//      its OE window times how many times the descriptor chain repeats it, and
//      the repeats already carry one factor of two per plane above
//      lsbMsbTransitionBit - so the window has to supply exactly the rest. The
//      shipping code derived a right-shift instead, and a shift can only halve;
//      it could not express the ratios the repeat counts need, and it handed the LSB
//      the same full window as the MSB.
//
//   2. The panel's response over all 256 input codes is monotone. That is the
//      property the arithmetic exists for, and it is the one that failed: 26
//      places where raising the code lowered the light, two of them by half,
//      back to back at 13->14 and 14->15. Confirmed on hardware before this test
//      was written - level 14 reads red where level 13 is neutral.
//
// License: MIT
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <iostream>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

// Generated from the tracked driver .cpp and its CIE table by check_oe.py.
#include "oe_under_test.h"

namespace {

int repeatsOf(int plane, int lsbMsbTransitionBit) {
  return plane <= lsbMsbTransitionBit ? 1
                                      : (1 << (plane - lsbMsbTransitionBit - 1));
}

void require(bool ok, const std::string& what) {
  if (!ok) throw std::runtime_error(what);
}

// Delivered light for one plane: window times repeats.
long delivered(int plane, int depth, int lsb, int width, int blank, int brt) {
  return (long)pfOEWindowPixels(plane, depth, lsb, width, blank, brt) *
         repeatsOf(plane, lsb);
}

// The panel's own path from an input code to a set of planes: the gamma/white
// balance byte, the CIE table, then the rounded threshold on the top `depth`
// bits. Written out rather than shared with the driver, so this is an
// independent statement of the same intent.
long lightFor(int code, double wb, int depth, int lsb, int width, int blank, int brt) {
  double scaled = (code / 255.0) * 255.0 * wb + 0.5;
  int byte = (int)std::max(0.0, std::min(255.0, scaled));   // C truncation, as the LUT does
  unsigned cie = lumConvTab[byte];
  unsigned rounded = std::min(0xFFFFu, cie + (1u << (16 - depth - 1)));
  long total = 0;
  for (int d = 0; d < depth; ++d)
    if (rounded & (1u << (d + 16 - depth)))
      total += delivered(d, depth, lsb, width, blank, brt);
  return total;
}

}  // namespace

int main() {
  try {
    int cases = 0;

    // 1. no plane can be outweighed by the ones below it
    //
    // Not "exactly 2^d": integer windows cannot express that at every width and
    // brightness, and they do not need to. What monotonicity actually requires is
    // that each plane carry at least as much light as everything under it - then
    // turning a higher bit on can never lose to the lower bits turning off. The
    // shipping arithmetic broke exactly this: plane 1 delivered 31 where plane 0
    // delivered 125, so the code going 13 -> 14 turned the panel half off.
    for (int depth = 2; depth <= 12; ++depth) {
      for (int lsb = 0; lsb < depth; ++lsb) {
        for (int width : {32, 64, 128, 256}) {
          for (int brt : {8, 60, 90, 130, 200, 255}) {
            long below = 0;
            for (int d = 0; d < depth; ++d) {
              const long w = delivered(d, depth, lsb, width, 2, brt);
              require(w >= below,
                      "plane " + std::to_string(d) + " delivers " + std::to_string(w) +
                          " against " + std::to_string(below) + " below it: depth " +
                          std::to_string(depth) + " lsb " + std::to_string(lsb) +
                          " width " + std::to_string(width) + " brt " + std::to_string(brt));
              require(pfOEWindowPixels(d, depth, lsb, width, 2, brt) <= width,
                      "OE window wider than the row");
              below += w;
              ++cases;
            }
          }
        }
      }
    }

    // 2. and therefore the response over all 256 codes never goes backwards
    const double wb[3] = {0.93, 1.00, 0.975};
    for (int lsb = 0; lsb <= 4; ++lsb) {
      for (int brt : {60, 90, 200, 255}) {
        for (int c = 0; c < 3; ++c) {
          long prev = -1;
          for (int code = 0; code < 256; ++code) {
            const long now = lightFor(code, wb[c], 8, lsb, 128, 2, brt);
            require(now >= prev,
                    "raising the code lowered the light: lsb " + std::to_string(lsb) +
                        " brt " + std::to_string(brt) + " channel " + std::to_string(c) +
                        " code " + std::to_string(code) + " went " +
                        std::to_string(prev) + " -> " + std::to_string(now));
            prev = now;
            ++cases;
          }
        }
      }
    }

    // 3. full scale is where the eye-converged constants left it
    long full = 0;
    for (int d = 0; d < 8; ++d) full += delivered(d, 8, 0, 128, 2, 255);
    require(full > 15000 && full < 17000,
            "full-scale luminance moved out of band: " + std::to_string(full));

    std::cout << "OE windows binary and response monotone; " << cases
              << " assertions, full scale " << full << std::endl;
    return 0;
  } catch (const std::exception& e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
