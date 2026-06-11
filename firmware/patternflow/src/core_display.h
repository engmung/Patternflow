#pragma once
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include "config.h"

// 메인 .ino에서 생성할 디스플레이 객체를 모든 패턴에서 접근할 수 있게 열어둠
extern MatrixPanel_I2S_DMA *dma_display;

inline void initDisplay() {
  HUB75_I2S_CFG::i2s_pins _pins = {
    R1_PIN, G1_PIN, B1_PIN, R2_PIN, G2_PIN, B2_PIN,
    PIN_A, PIN_B, PIN_C, PIN_D, PIN_E, LAT_PIN, OE_PIN, CLK_PIN
  };
  HUB75_I2S_CFG mxconfig(PANEL_RES_W, PANEL_RES_H, PANEL_CHAIN, _pins);
  mxconfig.clkphase    = false;
  mxconfig.double_buff = true;

  // Panel driver IC — see PANEL_PROFILE / HUB75_DRIVER in config.h.
  mxconfig.driver = HUB75_DRIVER;

  // Push panel refresh to ~240 Hz so phone-camera rolling shutter
  // averages multiple cycles per exposure and the BCM bit-plane flicker
  // stops showing up as visible bands on video. I2S/DMA refresh runs on
  // hardware peripherals in parallel with the CPU, so this costs zero
  // rendering FPS — the only trade is that the library may reduce
  // effective color depth (8-bit → 6–7 bit) to hit the target rate,
  // which can introduce mild banding in long smooth gradients. Dial
  // min_refresh_rate down to ~180 if banding is noticeable.
  mxconfig.i2sspeed         = HUB75_I2S_CFG::HZ_15M;
  mxconfig.min_refresh_rate = 240;
  mxconfig.latch_blanking   = 2;

  dma_display = new MatrixPanel_I2S_DMA(mxconfig);
  if (!dma_display->begin()) {
    Serial.println("Matrix begin FAILED");
    while (1) delay(1000);
  }
  dma_display->setBrightness8(DEFAULT_BRIGHTNESS);
  dma_display->clearScreen();
}