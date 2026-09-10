// Runs the production blit against synthetic DMA rows, comparing every word
// with the original scalar colour/bitplane definition. License: MIT.
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <random>
#include <stdexcept>
#include <vector>

#define IRAM_ATTR
#define ESP32_I2S_DMA_STORAGE_TYPE uint16_t
#define BITMASK_RGB12_CLEAR 0xffc0u
#define PIXEL_COLOR_MASK_BIT(d, offset) (1u << ((d) + (offset)))
#if PF_TEST_SWAP
#define ESP32_TX_FIFO_POSITION_ADJUST(x) ((x) ^ 1u)
#else
#define ESP32_TX_FIFO_POSITION_ADJUST(x) (x)
#endif
#ifdef _MSC_VER
#define __builtin_assume_aligned(p, n) (p)
#endif

// The driver refuses a colour depth its plane encoding cannot hold and says so.
// There is no IDF here; swallow it, the refusal is asserted by behaviour below.
#define ESP_LOGE(tag, ...) ((void)0)

class MatrixPanel_I2S_DMA {
public:
  bool initialized = true;
  uint16_t PIXELS_PER_ROW;
  uint8_t ROWS_PER_FRAME;
  struct Config {
    uint8_t depth;
    uint8_t getPixelColorDepthBits() const { return depth; }
  } m_cfg;
  std::vector<uint16_t> data;
  uint64_t _lastFrameOnTime = 0, _maxFrameOnTime = 0;
  MatrixPanel_I2S_DMA(uint16_t w, uint8_t rows, uint8_t depth)
      : PIXELS_PER_ROW(w), ROWS_PER_FRAME(rows), m_cfg{depth}, data(w * rows * depth) {}
  uint16_t* getRowDataPtr(uint8_t row, uint8_t depth) {
    return data.data() + (row * m_cfg.depth + depth) * PIXELS_PER_ROW;
  }
  void blitRGB888(const uint8_t*, const uint8_t*, const uint8_t*, const uint8_t*, int);
};

// Generated from the tracked driver .cpp and its CIE table, without editing
// their implementation. Hardware allocation is the only mocked boundary.
#include "blit_under_test.h"

int main() {
  // A depth the encoding cannot represent must leave the buffer alone. Before the
  // guard, depth 11 silently lost the top four bits of every plane field above 9,
  // and depth 12 shifted a uint32 by 36 - undefined in the table builder and in
  // the reader. Both are reachable: HUB75_I2S_CFG clamps to
  // PIXEL_COLOR_DEPTH_BITS_MAX, which is 12.
  for (int depth : {11, 12}) {
    MatrixPanel_I2S_DMA panel(64, 32, static_cast<uint8_t>(depth));
    for (size_t i = 0; i < panel.data.size(); ++i) panel.data[i] = uint16_t(i * 2654435761u);
    const auto untouched = panel.data;
    std::vector<uint8_t> rgb(64 * 64 * 3, 200);
    uint8_t lut[256];
    for (int i = 0; i < 256; ++i) lut[i] = uint8_t(i);
    panel.blitRGB888(rgb.data(), lut, lut, lut, 256);
    if (panel.data != untouched)
      throw std::runtime_error("blit wrote planes at a depth its encoding cannot hold");
  }
  std::cout << "depths 11 and 12 refused, buffer untouched" << std::endl;
  std::mt19937 rng(20260906);
  uint64_t checked = 0;
  for (int width : {32, 64, 128, 256, 127}) {
    if constexpr (PF_TEST_SWAP) {
      if (width & 1) continue;  // FIFO swaps require even rows
    }
    // 2..10, not 2..8. Ten is what the two-uint32 plane encoding actually holds
    // (planes 0-4 at 6*d in lo, 5-9 at 6*(d-5) in hi, plane 9 ending at bit 29),
    // and the shipped depth of 8 left the top two untested. Depths above it are
    // checked separately below, where the answer is that nothing is written.
    for (int depth = 2; depth <= 10; ++depth) {

      for (int sat : {0, 128, 256, 320, 512}) {
        for (int trial = 0; trial < 5; ++trial) {
          MatrixPanel_I2S_DMA panel(static_cast<uint16_t>(width), 32, static_cast<uint8_t>(depth));
          for (auto& v : panel.data) v = static_cast<uint16_t>(rng());
          auto expected = panel.data;
          std::vector<uint8_t> rgb(width * 64 * 3);
          for (auto& v : rgb) v = trial < 2 ? static_cast<uint8_t>(trial * 255) : static_cast<uint8_t>(rng());
          uint8_t lut[3][256];
          for (int c = 0; c < 3; ++c)
            for (int v = 0; v < 256; ++v)
              lut[c][v] = trial == 4 ? static_cast<uint8_t>(rng()) : static_cast<uint8_t>(v);
          uint64_t onTime = 0;
          for (int y = 0; y < 64; ++y) {
            for (int x = 0; x < width; ++x) {
              const uint8_t* p = rgb.data() + (y * width + x) * 3;
              int luma = (p[0] * 77 + p[1] * 150 + p[2] * 29) >> 8;
              for (int c = 0; c < 3; ++c) {
                int value = std::clamp(luma + (((int(p[c]) - luma) * sat) >> 8), 0, 255);
                uint16_t cie = lumConvTab[lut[c][value]];
                onTime += cie;
                // Rounded, matching pfBuildSpread. Written out here rather than
                // shared with it on purpose: this is the independent definition the
                // production blit is checked against, so it has to be derived from
                // the same intent and not from the same code.
                unsigned rounded = unsigned(cie) + (1u << (16 - depth - 1));
                if (rounded > 0xFFFFu) rounded = 0xFFFFu;

                for (int d = 0; d < depth; ++d) {
                  size_t index = ((y % 32) * depth + d) * width + ESP32_TX_FIFO_POSITION_ADJUST(x);
                  unsigned mask = 1u << (c + (y >= 32 ? 3 : 0));
                  expected[index] = static_cast<uint16_t>((expected[index] & ~mask) |
                      ((rounded & (1u << (d + 16 - depth))) ? mask : 0));
                }
              }
            }
          }
          panel.blitRGB888(rgb.data(), lut[0], lut[1], lut[2], sat);
          if (panel.data != expected || panel._lastFrameOnTime != onTime ||
              panel._maxFrameOnTime != uint64_t(width) * 64 * 3 * lumConvTab[255])
            throw std::runtime_error("blit changed pixels, control bits, or power measurement");
          checked += panel.data.size();
        }
      }
    }
  }
  std::cout << "blit exact: " << checked << " DMA words, FIFO swap=" << PF_TEST_SWAP << '\n';
}
