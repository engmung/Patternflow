// Patternflow - Video Pattern (PFV1 playback from FATFS)
//
// Reads baked .pfv files from the ESP32 FATFS partition and plays them back
// on the 128x64 LED matrix as RGB565 frames.
//
// PFV1 is authored by the web Video Baker:
//   64-byte little-endian header
//   RGB565_LE frame payload, row-major, 128x64
//   fpsMilli means frames-per-second * 1000, not milliseconds per frame
//
// Serial upload:
//   Host sends "PFV:<filename>:<size>\n" followed by raw PFV bytes.
//
// License: MIT
#pragma once

#include <Arduino.h>
#include <FFat.h>
#include "src/core_display.h"
#include "src/core_encoders.h"

namespace VideoPattern {

  const char* NAME = "Video";
  const char* KNOB_LABELS[4] = {"bright", "speed", "file", "---"};

  static const uint16_t PFV1_HEADER_SIZE = 64;
  static const uint8_t PFV1_FORMAT_RGB565_LE = 0x01;
  static const uint8_t PFV1_FLAG_LOOP = 0x01;
  static const size_t MAX_UPLOAD_BYTES = 8UL * 1024UL * 1024UL;

  struct __attribute__((packed)) PFV1Header {
    char magic[4];          // "PFV1"
    uint16_t headerSize;    // 64
    uint16_t width;         // 128
    uint16_t height;        // 64
    uint16_t fpsMilli;      // fps * 1000
    uint32_t frameCount;
    uint8_t format;         // 0x01 = RGB565_LE
    uint8_t flags;          // bit0 = loop
    uint32_t loopStart;     // frame index
    uint8_t reserved0[30];
    uint32_t dataCrc32;
    uint32_t headerCrc32;   // currently 0
    uint8_t reserved1[4];
  };

  static_assert(sizeof(PFV1Header) == PFV1_HEADER_SIZE, "PFV1 header must be 64 bytes");

  static const size_t FRAME_PIXELS = PANEL_RES_W * PANEL_RES_H;
  static const size_t FRAME_BYTES = FRAME_PIXELS * 2;
  static const int MAX_FILES = 16;
  static const int MAX_PATH_LEN = 48;

  uint16_t* frameBuf = nullptr;
  uint32_t frameCount = 0;
  uint32_t currentFrame = 0;
  uint32_t loopStartFrame = 0;
  bool loopEnabled = true;

  float frameTimer = 0.0f;
  float msPerFrame = 83.33f;
  float speedMul = 1.0f;
  uint8_t brightness = DEFAULT_BRIGHTNESS;
  bool paused = false;

  float infoTimer = 0.0f;
  static const float INFO_DURATION = 2.5f;

  char fileList[MAX_FILES][MAX_PATH_LEN];
  int fileCount = 0;
  int currentFile = 0;
  bool loaded = false;
  bool fatReady = false;
  bool initialLoadAttempted = false;

  bool hasPfvExtension(const char* name) {
    size_t len = strlen(name);
    if (len <= 4) return false;
    const char* ext = name + len - 4;
    return ext[0] == '.'
      && (ext[1] == 'p' || ext[1] == 'P')
      && (ext[2] == 'f' || ext[2] == 'F')
      && (ext[3] == 'v' || ext[3] == 'V');
  }

  bool isSafeFilename(const String& filename) {
    if (filename.length() == 0 || filename.length() >= MAX_PATH_LEN - 1) return false;
    for (size_t i = 0; i < filename.length(); i++) {
      char c = filename.charAt(i);
      if (c == '/' || c == '\\' || c == ':' || c == '\r' || c == '\n') return false;
    }
    return true;
  }

  String toRootPath(String filename) {
    filename.trim();
    while (filename.startsWith("/")) filename.remove(0, 1);
    return "/" + filename;
  }

  uint32_t crc32Update(uint32_t crc, const uint8_t* data, size_t len) {
    for (size_t i = 0; i < len; i++) {
      crc ^= data[i];
      for (uint8_t bit = 0; bit < 8; bit++) {
        crc = (crc & 1) ? (0xedb88320UL ^ (crc >> 1)) : (crc >> 1);
      }
    }
    return crc;
  }

  void clearLoadedFrame() {
    if (frameBuf) {
      free(frameBuf);
      frameBuf = nullptr;
    }
    loaded = false;
    frameCount = 0;
    currentFrame = 0;
    loopStartFrame = 0;
  }

  bool validateHeader(const PFV1Header& hdr, size_t fileSize, size_t& payloadBytes) {
    if (memcmp(hdr.magic, "PFV1", 4) != 0) {
      Serial.println("[Video] Invalid magic");
      return false;
    }
    if (hdr.headerSize != PFV1_HEADER_SIZE) {
      Serial.printf("[Video] Unsupported header size: %u\n", hdr.headerSize);
      return false;
    }
    if (hdr.width != PANEL_RES_W || hdr.height != PANEL_RES_H) {
      Serial.printf("[Video] Wrong resolution: %ux%u\n", hdr.width, hdr.height);
      return false;
    }
    if (hdr.format != PFV1_FORMAT_RGB565_LE) {
      Serial.printf("[Video] Unsupported format: 0x%02x\n", hdr.format);
      return false;
    }
    if (hdr.frameCount == 0) {
      Serial.println("[Video] Empty video");
      return false;
    }
    if (hdr.fpsMilli == 0 || hdr.fpsMilli > 60000) {
      Serial.printf("[Video] Unsupported fpsMilli: %u\n", hdr.fpsMilli);
      return false;
    }

    uint64_t expectedPayload = (uint64_t)hdr.frameCount * FRAME_BYTES;
    uint64_t expectedSize = (uint64_t)hdr.headerSize + expectedPayload;
    if (expectedSize != (uint64_t)fileSize || expectedSize > MAX_UPLOAD_BYTES) {
      Serial.printf(
        "[Video] Size mismatch: expected %lu, file %lu\n",
        (unsigned long)expectedSize,
        (unsigned long)fileSize
      );
      return false;
    }

    payloadBytes = (size_t)expectedPayload;
    return true;
  }

  void scanFiles() {
    fileCount = 0;

    File root = FFat.open("/");
    if (!root || !root.isDirectory()) return;

    while (fileCount < MAX_FILES) {
      File entry = root.openNextFile();
      if (!entry) break;

      const char* name = entry.name();
      if (hasPfvExtension(name)) {
        const char* prefix = name[0] == '/' ? "" : "/";
        snprintf(fileList[fileCount], MAX_PATH_LEN, "%s%s", prefix, name);
        Serial.printf(
          "[Video] Found: %s (%lu bytes)\n",
          fileList[fileCount],
          (unsigned long)entry.size()
        );
        fileCount++;
      }
      entry.close();
    }
    root.close();

    if (currentFile >= fileCount) currentFile = 0;
    Serial.printf("[Video] %d PFV file(s) found\n", fileCount);
  }

  bool loadFile(int idx) {
    if (idx < 0 || idx >= fileCount) return false;

    File f = FFat.open(fileList[idx], "r");
    if (!f) {
      Serial.printf("[Video] Failed to open %s\n", fileList[idx]);
      return false;
    }

    PFV1Header hdr;
    if (f.read((uint8_t*)&hdr, sizeof(hdr)) != sizeof(hdr)) {
      Serial.println("[Video] Header read failed");
      f.close();
      return false;
    }

    size_t payloadBytes = 0;
    if (!validateHeader(hdr, f.size(), payloadBytes)) {
      f.close();
      return false;
    }

    clearLoadedFrame();

    frameBuf = (uint16_t*)ps_malloc(payloadBytes);
    if (!frameBuf) frameBuf = (uint16_t*)malloc(payloadBytes);
    if (!frameBuf) {
      Serial.printf("[Video] Alloc failed: %lu bytes\n", (unsigned long)payloadBytes);
      f.close();
      return false;
    }

    if (!f.seek(hdr.headerSize, SeekSet)) {
      Serial.println("[Video] Seek failed");
      f.close();
      clearLoadedFrame();
      return false;
    }

    uint8_t* dst = (uint8_t*)frameBuf;
    size_t received = 0;
    uint32_t crc = 0xffffffffUL;

    while (received < payloadBytes) {
      size_t toRead = min((size_t)4096, payloadBytes - received);
      size_t got = f.read(dst + received, toRead);
      if (got == 0) break;
      crc = crc32Update(crc, dst + received, got);
      received += got;
    }
    f.close();

    if (received != payloadBytes) {
      Serial.printf(
        "[Video] Incomplete read: %lu/%lu\n",
        (unsigned long)received,
        (unsigned long)payloadBytes
      );
      clearLoadedFrame();
      return false;
    }

    crc ^= 0xffffffffUL;
    if (hdr.dataCrc32 != 0 && crc != hdr.dataCrc32) {
      Serial.printf(
        "[Video] CRC mismatch: expected 0x%08lx, got 0x%08lx\n",
        (unsigned long)hdr.dataCrc32,
        (unsigned long)crc
      );
      clearLoadedFrame();
      return false;
    }

    float fps = (float)hdr.fpsMilli / 1000.0f;
    frameCount = hdr.frameCount;
    loopEnabled = (hdr.flags & PFV1_FLAG_LOOP) != 0;
    loopStartFrame = hdr.loopStart < hdr.frameCount ? hdr.loopStart : 0;
    msPerFrame = 1000.0f / fps;
    currentFrame = 0;
    frameTimer = 0.0f;
    loaded = true;
    paused = false;
    infoTimer = INFO_DURATION;

    Serial.printf(
      "[Video] Loaded %s: %lu frames, %.1f fps, %lu KB\n",
      fileList[idx],
      (unsigned long)frameCount,
      fps,
      (unsigned long)(payloadBytes / 1024)
    );
    return true;
  }

  void ensureInitialLoad() {
    if (!fatReady || initialLoadAttempted) return;
    initialLoadAttempted = true;
    scanFiles();
    if (fileCount > 0) {
      loadFile(currentFile);
    } else {
      Serial.println("[Video] No .pfv files on FATFS");
    }
  }

  void checkSerialUpload() {
    if (!fatReady || !Serial.available()) return;
    if (Serial.peek() != 'P') return;

    String line = Serial.readStringUntil('\n');
    line.trim();
    if (!line.startsWith("PFV:")) return;

    String cmd = line.substring(4);

    if (cmd == "LIST") {
      scanFiles();
      Serial.printf("FILES:%d\n", fileCount);
      for (int i = 0; i < fileCount; i++) {
        File f = FFat.open(fileList[i], "r");
        Serial.printf("FILE:%s:%lu\n", fileList[i], (unsigned long)(f ? f.size() : 0));
        if (f) f.close();
      }
      Serial.printf("FREE:%lu\n", (unsigned long)FFat.freeBytes());
      return;
    }

    if (cmd == "FREE") {
      Serial.printf("FREE:%lu\n", (unsigned long)FFat.freeBytes());
      return;
    }

    if (cmd == "CLEAR") {
      for (int i = 0; i < fileCount; i++) {
        FFat.remove(fileList[i]);
        Serial.printf("DELETED:%s\n", fileList[i]);
      }
      clearLoadedFrame();
      scanFiles();
      initialLoadAttempted = true;
      currentFile = 0;
      Serial.printf("OK:CLEARED\nFREE:%lu\n", (unsigned long)FFat.freeBytes());
      return;
    }

    if (cmd.startsWith("DELETE:")) {
      String rawName = cmd.substring(7);
      while (rawName.startsWith("/")) rawName.remove(0, 1);
      if (!isSafeFilename(rawName)) {
        Serial.println("ERR:BAD_NAME");
        return;
      }

      String fname = toRootPath(rawName);
      if (FFat.remove(fname)) {
        Serial.printf("DELETED:%s\n", fname.c_str());
        clearLoadedFrame();
        scanFiles();
        currentFile = 0;
        if (fileCount > 0) loadFile(currentFile);
      } else {
        Serial.printf("ERR:NOT_FOUND:%s\n", fname.c_str());
      }
      Serial.printf("FREE:%lu\n", (unsigned long)FFat.freeBytes());
      return;
    }

    int sep1 = cmd.indexOf(':');
    if (sep1 < 0) {
      Serial.println("ERR:BAD_FORMAT");
      return;
    }

    String rawName = cmd.substring(0, sep1);
    size_t fsize = (size_t)cmd.substring(sep1 + 1).toInt();
    while (rawName.startsWith("/")) rawName.remove(0, 1);

    if (!isSafeFilename(rawName) || !hasPfvExtension(rawName.c_str())) {
      Serial.println("ERR:BAD_NAME");
      return;
    }
    if (fsize < PFV1_HEADER_SIZE || fsize > MAX_UPLOAD_BYTES) {
      Serial.println("ERR:BAD_SIZE");
      return;
    }

    String fname = toRootPath(rawName);
    size_t availableBytes = FFat.freeBytes();
    File existing = FFat.open(fname, "r");
    if (existing) {
      availableBytes += existing.size();
      existing.close();
    }
    if (fsize > availableBytes) {
      Serial.println("ERR:NO_SPACE");
      return;
    }

    Serial.printf("READY:%lu\n", (unsigned long)fsize);

    File f = FFat.open(fname, "w");
    if (!f) {
      Serial.println("ERR:OPEN_FAIL");
      return;
    }

    dma_display->fillScreen(0);
    dma_display->setTextSize(1);
    dma_display->setTextColor(dma_display->color565(100, 100, 100));
    dma_display->setCursor(20, 20);
    dma_display->print("UPLOADING...");
    dma_display->flipDMABuffer();

    size_t received = 0;
    uint8_t buf[4096];
    unsigned long lastActivity = millis();

    while (received < fsize) {
      if (Serial.available()) {
        size_t toRead = min((size_t)Serial.available(), sizeof(buf));
        toRead = min(toRead, fsize - received);
        size_t got = Serial.readBytes(buf, toRead);
        size_t written = f.write(buf, got);
        if (written != got) {
          Serial.println("ERR:WRITE_FAIL");
          f.close();
          FFat.remove(fname);
          return;
        }

        received += got;
        lastActivity = millis();

        int pct = (int)(received * 100 / fsize);
        int barW = (int)(received * 88 / fsize);
        dma_display->fillRect(20, 38, 88, 6, 0);
        dma_display->fillRect(20, 38, barW, 6, dma_display->color565(255, 255, 255));
        dma_display->fillRect(20, 48, 88, 8, 0);
        dma_display->setCursor(20, 48);
        dma_display->printf("%d%%  %luK", pct, (unsigned long)(received / 1024));
        dma_display->flipDMABuffer();
      }

      if (millis() - lastActivity > 10000) {
        Serial.println("ERR:TIMEOUT");
        f.close();
        FFat.remove(fname);
        return;
      }
      yield();
    }

    f.close();
    Serial.printf("OK:%lu\n", (unsigned long)received);

    scanFiles();
    for (int i = 0; i < fileCount; i++) {
      if (strcmp(fileList[i], fname.c_str()) == 0) {
        currentFile = i;
        initialLoadAttempted = true;
        loadFile(i);
        break;
      }
    }
  }

  void setup() {
    if (!FFat.begin(false)) {
      fatReady = false;
      Serial.println("[Video] FFat mount failed. Select a FATFS partition and upload data.");
      return;
    }

    fatReady = true;
    Serial.printf("[Video] FFat: %lu KB free\n", (unsigned long)(FFat.freeBytes() / 1024));
    scanFiles();
  }

  void update(float dt, const InputFrame& input) {
    if (!fatReady) return;

    ensureInitialLoad();

    int d0 = input.knobDeltas[0];
    if (d0 != 0) {
      int b = (int)brightness + d0 * 5;
      brightness = (uint8_t)constrain(b, 10, 255);
      dma_display->setBrightness8(brightness);
    }
    if (input.btnPressed[0]) {
      brightness = DEFAULT_BRIGHTNESS;
      dma_display->setBrightness8(brightness);
    }

    int d1 = input.knobDeltas[1];
    if (d1 != 0) {
      speedMul = constrain(speedMul + d1 * 0.1f, 0.1f, 4.0f);
      paused = false;
    }
    if (input.btnPressed[1]) {
      paused = !paused;
      Serial.printf("[Video] %s\n", paused ? "Paused" : "Playing");
    }

    int d2 = input.knobDeltas[2];
    if (d2 != 0 && fileCount > 1) {
      int next = ((currentFile + d2) % fileCount + fileCount) % fileCount;
      if (next != currentFile) {
        currentFile = next;
        loadFile(currentFile);
      }
    }

    if (infoTimer > 0) infoTimer -= dt;

    if (loaded && frameCount > 0 && !paused && speedMul > 0.0f) {
      frameTimer += dt * speedMul * 1000.0f;
      while (frameTimer >= msPerFrame) {
        frameTimer -= msPerFrame;
        if (currentFrame + 1 >= frameCount) {
          currentFrame = loopEnabled ? loopStartFrame : frameCount - 1;
        } else {
          currentFrame++;
        }
      }
    }
  }

  void drawCenteredText(const char* text, int y, uint16_t color, int textSize = 1) {
    int16_t x1, y1;
    uint16_t w, h;
    dma_display->setTextSize(textSize);
    dma_display->setTextColor(color);
    dma_display->getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
    dma_display->setCursor((dma_display->width() - w) / 2, y);
    dma_display->print(text);
  }

  void draw() {
    if (!loaded || !frameBuf || frameCount == 0) {
      dma_display->fillScreen(0);
      uint16_t dim = dma_display->color565(50, 50, 50);
      drawCenteredText(fatReady ? "NO VIDEO" : "NO FATFS", 24, dim);
      if (fatReady) {
        char buf[24];
        snprintf(buf, sizeof(buf), "%luKB FREE", (unsigned long)(FFat.freeBytes() / 1024));
        drawCenteredText(buf, 40, dma_display->color565(30, 30, 30));
      }
      return;
    }

    const uint16_t* frame = frameBuf + (size_t)currentFrame * FRAME_PIXELS;
    for (int y = 0; y < PANEL_RES_H; y++) {
      for (int x = 0; x < PANEL_RES_W; x++) {
        dma_display->drawPixel(x, y, frame[y * PANEL_RES_W + x]);
      }
    }

    if (infoTimer > 0) {
      for (int y = PANEL_RES_H - 20; y < PANEL_RES_H; y++) {
        for (int x = 0; x < PANEL_RES_W; x++) {
          dma_display->drawPixel(x, y, 0);
        }
      }

      char info1[32], info2[32];
      const char* fname = fileList[currentFile];
      if (fname[0] == '/') fname++;
      snprintf(info1, sizeof(info1), "%s", fname);
      snprintf(
        info2,
        sizeof(info2),
        "%luf  %.0ffps  x%.1f",
        (unsigned long)frameCount,
        1000.0f / msPerFrame,
        speedMul
      );

      dma_display->setTextSize(1);
      dma_display->setTextColor(dma_display->color565(200, 200, 200));
      dma_display->setCursor(2, PANEL_RES_H - 18);
      dma_display->print(info1);

      dma_display->setTextColor(dma_display->color565(120, 120, 120));
      dma_display->setCursor(2, PANEL_RES_H - 9);
      dma_display->print(info2);
    }
  }

} // namespace VideoPattern
