// The panel's delivered light per bit plane, checked as arithmetic.
//
// WHY THIS EXISTS. setBrightnessOE writes OE bits into the DMA buffer, which is
// why nothing tested it: reaching it needs a frameStruct, rowBits and a live
// allocation. But the defect was never in writing the buffer. It was in deciding
// how wide each buffer's window should be, and that is pfOEWindowPixels(), which
// is pure and needs nothing.
//
// WHAT THIS FILE GOT WRONG, TWICE, AND WHY IT IS BUILT DIFFERENTLY NOW. The first
// two versions modelled delivered light as "plane p's window times how often
// plane p is sent". That is not how the panel works: a plane's bits are latched
// at the end of its buffer and are on the LEDs while the NEXT buffer clocks in,
// gated by that next buffer's OE bits. The driver under test made the same
// assumption, so the two agreed through 30,000 assertions while the panel showed
// purple and sky-blue fringes round every edge that faded from a near-white. A
// reference that shares the assumption under test proves nothing, however many
// cases it runs.
//
// So the model here is not a formula. It WALKS THE CHAIN: the sequence of buffers
// begin() links, then the next row's buffer 0, crediting each buffer's window to
// the plane that was latched before it. The driver states its windows in closed
// form; if the closed form is wrong, the walk disagrees. (The chain itself is no
// longer upstream's: solved exactly, that one kept 42% of the row lit and was too
// dark. See pfChainExtraPasses in the driver.)
//
// WHAT IT ASSERTS.
//   1. Everywhere: no plane delivers less than everything below it.
//   2. On the configuration that ships (depth 8, scheme 0, 128 wide): planes
//      binary within 10% at every brightness.
//   3. The response over all 256 input codes is monotone there, per channel.
//   4. Full scale on that configuration, so a change that moves it has to say so.
//
// License: MIT
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

// Generated from the tracked driver .cpp and its CIE table by check_oe.py.
#include "oe_under_test.h"

namespace {

void require(bool ok, const std::string& what) {
  if (!ok) throw std::runtime_error(what);
}

// The buffers one row sends, in order, as begin() links them: every plane once,
// then the extra passes in ascending plane order. Stated here independently of
// the driver's pfChainExtraPasses - scheme 0 sends the plane below the top once
// more and the top three more times, scheme 1 the top once more, scheme 2 nothing.
std::vector<int> chainOf(int depth, int scheme) {
  std::vector<int> seq;
  for (int b = 0; b < depth; ++b) seq.push_back(b);
  if (scheme == 0 && depth >= 3) {
    seq.push_back(depth - 2);
    for (int k = 0; k < 3; ++k) seq.push_back(depth - 1);
  } else if (scheme <= 1 && depth >= 2) {
    seq.push_back(depth - 1);
  }
  return seq;
}

// Light per plane: plane seq[k] is on the LEDs while seq[k+1] clocks in, and the
// last one while the next row's buffer 0 does.
std::vector<long> deliveredLight(int depth, int scheme, int width, int blank, int brt) {
  std::vector<int> window(depth);
  for (int b = 0; b < depth; ++b) {
    window[b] = pfOEWindowPixels(b, depth, scheme, width, blank, brt);
    require(window[b] >= 0 && window[b] <= width, "OE window outside the row");
  }
  const std::vector<int> seq = chainOf(depth, scheme);
  std::vector<long> light(depth, 0);
  for (size_t k = 0; k < seq.size(); ++k) {
    const int next = (k + 1 < seq.size()) ? seq[k + 1] : 0;
    light[seq[k]] += window[next];
  }
  return light;
}

// The panel's own path from an input code to a set of planes: the gamma/white
// balance byte, the CIE table, then the rounded threshold on the top `depth`
// bits. Written out rather than shared with the driver.
long lightFor(int code, double wb, const std::vector<long>& light, int depth) {
  double scaled = (code / 255.0) * 255.0 * wb + 0.5;
  int byte = (int)std::max(0.0, std::min(255.0, scaled));   // C truncation, as the LUT does
  unsigned cie = lumConvTab[byte];
  unsigned rounded = std::min(0xFFFFu, cie + (1u << (16 - depth - 1)));
  long total = 0;
  for (int d = 0; d < depth; ++d)
    if (rounded & (1u << (d + 16 - depth))) total += light[d];
  return total;
}

}  // namespace

int main() {
  try {
    int cases = 0;

    // 1. everywhere: no plane loses to the ones below it. Every window is the
    // full one shifted right, and floors keep that ordering exact - the sum of
    // floor(n / 2^j) over j >= 1 is n - popcount(n), always under n - so this is
    // strict, at every depth, scheme, width and brightness. Both earlier drivers
    // fail it by an order of magnitude once light is credited to the right plane.
    for (int depth = 2; depth <= 12; ++depth) {
      for (int scheme = 0; scheme <= 2; ++scheme) {
        for (int width : {32, 64, 128, 256}) {
          for (int brt : {5, 8, 60, 90, 130, 200, 255}) {
            const std::vector<long> light = deliveredLight(depth, scheme, width, 2, brt);
            long below = 0;
            for (int d = 0; d < depth; ++d) {
              require(light[d] >= below,
                      "plane " + std::to_string(d) + " delivers " + std::to_string(light[d]) +
                          " against " + std::to_string(below) + " below it: depth " +
                          std::to_string(depth) + " scheme " + std::to_string(scheme) +
                          " width " + std::to_string(width) + " brt " + std::to_string(brt));
              below += light[d];
              ++cases;
            }
          }
        }
      }
    }

    // 2. on the panel that ships: strictly ordered at EVERY brightness, and binary
    //
    // Depth 8, chain scheme 0, 128 wide - twelve buffers a row, 325 Hz at 16 MHz.
    // Ordered is the floor, not the goal: weights can be very
    // nearly monotone and still tint every edge, because each channel crosses a
    // heavy plane at a different input level. Planes narrower than eight
    // pixel-passes are left to the ordering check: one pixel is most of them.
    for (int brt = 5; brt <= 255; ++brt) {
      const std::vector<long> light = deliveredLight(8, 0, 128, 2, brt);
      long below = 0;
      for (int d = 0; d < 8; ++d) {
        require(light[d] >= below,
                "shipped panel: plane " + std::to_string(d) + " delivers " +
                    std::to_string(light[d]) + " against " + std::to_string(below) +
                    " below it at brt " + std::to_string(brt));
        below += light[d];
        const double ideal = (double)light[7] / (double)(1 << (7 - d));
        if (ideal >= 8.0) {
          require((double)light[d] > ideal * 0.90 && (double)light[d] < ideal * 1.10,
                  "shipped panel: plane " + std::to_string(d) + " delivers " +
                      std::to_string(light[d]) + " where binary wants " +
                      std::to_string((long)ideal) + " at brt " + std::to_string(brt));
        }
        ++cases;
      }
    }

    // 3. and therefore the response over all 256 codes never goes backwards there.
    // Three different gains, so the channels cross each plane at different codes.
    const double wb[3] = {0.93, 1.00, 0.975};
    for (int brt : {20, 60, 90, 155, 200, 255}) {
      const std::vector<long> light = deliveredLight(8, 0, 128, 2, brt);
      for (int c = 0; c < 3; ++c) {
        long prev = -1;
        for (int code = 0; code < 256; ++code) {
          const long now = lightFor(code, wb[c], light, 8);
          require(now >= prev,
                  "raising the code lowered the light: brt " + std::to_string(brt) +
                      " channel " + std::to_string(c) + " code " + std::to_string(code) +
                      " went " + std::to_string(prev) + " -> " + std::to_string(now));
          prev = now;
          ++cases;
        }
      }
    }

    // 4. full scale on that panel: 993 pixel-passes over twelve buffers, 66% of
    // the row lit (upstream, not binary: 1491 over fifteen, 80%). A change that
    // moves it has to show up here.
    long full = 0;
    for (long l : deliveredLight(8, 0, 128, 2, 255)) full += l;
    require(full > 950 && full < 1040,
            "full-scale luminance moved out of band: " + std::to_string(full));

    std::cout << "OE windows binary and response monotone; " << cases
              << " assertions, full scale " << full << std::endl;
    return 0;
  } catch (const std::exception& e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
