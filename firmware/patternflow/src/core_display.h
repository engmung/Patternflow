#pragma once
// Vendored HUB75 driver (src/hub75/), not the Library Manager copy: it
// carries one addition, blitRGB888(), that upstream has no equivalent for.
// See src/hub75/VENDORED.md.
#include "hub75/ESP32-HUB75-MatrixPanel-I2S-DMA.h"
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

  // The refresh floor. What a phone actually needs is not "fast" but "exact":
  // each row is a short pulse once per refresh, a rolling shutter collects a
  // whole number of them per sensor line, and only an exposure that is an
  // exact multiple of the period gives every line the same number. The
  // vendored driver therefore pads each frame to exactly 300 Hz - the lowest
  // rate 1/50, 1/100, 1/25, 1/60 and 1/30 all divide (PF_TARGET_REFRESH_HZ
  // in src/hub75). This floor only says how low it may go. I2S/DMA refresh runs on
  // hardware peripherals in parallel with the CPU, so this costs zero
  // rendering FPS. The trade is brightness, not colour depth: the vendored
  // driver picks the brightest bit-plane chain that clears this floor
  // (pfChainExtraPasses in src/hub75), and every chain it can pick is
  // exactly binary. At 16 MHz and 128 wide the brightest one runs at 325 Hz
  // before padding, so this floor is not what limits the shipped panel.
  //
  // ⚠️ If an EMC radiated-emissions test fails: this clock and its harmonics,
  // streamed continuously down the HUB75 ribbon, are the loudest thing in the
  // product — far louder than Wi-Fi, which is a separate test entirely.
  //
  // Mind the enum names, they lie: HZ_15M is 16000000, and HZ_10M is 8000000
  // (identical to HZ_8M — there is no step between 8 and 16 MHz). So the
  // fundamental to hunt for is 16 MHz, not 15, and "drop to HZ_10M" means
  // halving the clock. It drops the fundamental and every harmonic with it.
  // It is NOT free: at a lower clock the driver either falls back to a
  // shorter, dimmer chain to hold 240 Hz (a quarter of each row lit instead of
  // two thirds) or keeps the light and lets refresh fall (camera banding
  // returns on video).
  // Try the cheap fixes first — ferrite on the ribbon, shorter ribbon,
  // routing, grounding — and come here only if a pre-scan says to.
  //
  // The trade has been measured, including on Wi-Fi, which the clock also
  // desensitises on some boards: see
  // docs/investigations/2026-08-the-panel-clock-and-the-wifi-radio.md.
  // Short version: 8 MHz is a real improvement and still is not shipped,
  // because every min_refresh_rate that keeps the panel bright bands on
  // video. If you lower i2sspeed, lower min_refresh_rate with it.
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