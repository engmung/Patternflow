#pragma once

#include <Arduino.h>
#include "config.h"
#include "src/core_display.h"
#include "src/core_encoders.h"
#include "src/core_canvas.h"
#include "src/core_math.h"
#include "color_palettes.h"

namespace Cube3DPattern {

const char* NAME = "3D Cube";
const char* const KNOB_LABELS[4] = {"DIRECTION", "SPEED", "TAIL MODE", "PALETTE"};

const float CUBE_SIZE = 20.0f;
const float KNOB2_MIN_VALUE = 0.1f;
const float KNOB2_MAX_VALUE = 10.0f;
const float MIN_SPD = 2.0f;
const float MAX_SPD = 8.0f;
const float MIN_MOVE_SPEED = 10.0f;
const float MAX_MOVE_SPEED = 52.0f;
const int MOVE_VECTOR_STEPS = 10;
const int TRAIL_LENGTH = 12;
const float TRAIL_BRIGHTNESS = 0.5f;
const bool enable_antialiasing = true;
const int TAIL_NONE = 0;
const int TAIL_FACE_COLORS = 1;
const int TAIL_LAVA = 2;
const int TAIL_RAINBOW = 3;

const int8_t VX[8] = {-1, 1, 1, -1, -1, 1, 1, -1};
const int8_t VY[8] = {-1, -1, 1, 1, -1, -1, 1, 1};
const int8_t VZ[8] = {-1, -1, -1, -1, 1, 1, 1, 1};
const uint8_t FACE_A[6] = {0, 4, 1, 0, 0, 3};
const uint8_t FACE_B[6] = {1, 5, 5, 3, 4, 2};
const uint8_t FACE_C[6] = {2, 6, 6, 7, 5, 6};
const uint8_t FACE_D[6] = {3, 7, 2, 4, 1, 7};
const int8_t FACE_NX[6] = {0, 0, 1, -1, 0, 0};
const int8_t FACE_NY[6] = {0, 0, 0, 0, -1, 1};
const int8_t FACE_NZ[6] = {-1, 1, 0, 0, 0, 0};

struct Params {
  float timeAcc;
  float knob1Value;
  float knob2Value;
  float rotationSpeed;
  int moveStep;
  int paletteIndex;
  int tailMode;
  float axisX;
  float axisY;
  float axisZ;
  float spinSign;
  float moveSignX;
  float moveSignY;
  float moveVXAmount;
  float moveVYAmount;
  float moveVX;
  float moveVY;
  float startAngle;
  float cubeX;
  float cubeY;
  bool hasPosition;
  float boundLeft;
  float boundRight;
  float boundTop;
  float boundBottom;
  float px[8];
  float py[8];
  float pz[8];
  bool faceVisible[6];
  uint8_t faceR[6];
  uint8_t faceG[6];
  uint8_t faceB[6];
  uint8_t faceSlot[6];
  float trailX[8 * TRAIL_LENGTH];
  float trailY[8 * TRAIL_LENGTH];
  bool trailReady;
  bool enableAntialiasing;
};

Params params;

inline float frand01() {
  return (float)random(0, 10000) * 0.0001f;
}

inline float mapKnob2ToSpeed(float v) {
  float n = (constrain(v, KNOB2_MIN_VALUE, KNOB2_MAX_VALUE) - KNOB2_MIN_VALUE) / (KNOB2_MAX_VALUE - KNOB2_MIN_VALUE);
  return MIN_SPD + n * (MAX_SPD - MIN_SPD);
}

inline float speedToMoveSpeed(float speed) {
  float n = (constrain(speed, MIN_SPD, MAX_SPD) - MIN_SPD) / (MAX_SPD - MIN_SPD);
  return MIN_MOVE_SPEED + n * (MAX_MOVE_SPEED - MIN_MOVE_SPEED);
}

inline float randomRotationSpeed() {
  return MIN_SPD + frand01() * (MAX_SPD - MIN_SPD);
}

inline void sendCurrentPaletteName() {
  Serial0.printf(
    "3DCUBE_PALETTE:%d:%s\n",
    params.paletteIndex,
    Cube3DPalettes::PALETTE_NAMES[params.paletteIndex]
  );
}

inline void wrapIndex(int& value, int count) {
  while (value < 0) value += count;
  while (value >= count) value -= count;
}

inline uint8_t scaleByte(float v) {
  return (uint8_t)constrain((int)floorf(v), 0, 255);
}

inline float paletteBrightness(int paletteIndex) {
  return Cube3DPalettes::PALETTE_BRIGHTNESS[paletteIndex];
}

inline void paletteColor(int paletteIndex, int slot, uint8_t& r, uint8_t& g, uint8_t& b) {
  paletteIndex = constrain(paletteIndex, 0, Cube3DPalettes::PALETTE_COUNT - 1);
  slot = constrain(slot, 0, Cube3DPalettes::PALETTE_SIZE - 1);
  const uint8_t* palette = Cube3DPalettes::PALETTES[paletteIndex];
  float brightness = paletteBrightness(paletteIndex);
  int p = slot * 3;
  r = scaleByte(palette[p] * brightness);
  g = scaleByte(palette[p + 1] * brightness);
  b = scaleByte(palette[p + 2] * brightness);
}

inline void randomizeFacePaletteSlots() {
  for (int f = 0; f < 6; f++) {
    int slot = random(0, Cube3DPalettes::PALETTE_SIZE);
    bool unique = false;
    for (int attempt = 0; attempt < Cube3DPalettes::PALETTE_SIZE && !unique; attempt++) {
      unique = true;
      for (int prev = 0; prev < f; prev++) {
        if (params.faceSlot[prev] == slot) {
          unique = false;
          slot = (slot + 1) % Cube3DPalettes::PALETTE_SIZE;
          break;
        }
      }
    }
    params.faceSlot[f] = slot;
  }
}

inline void randomizeRotation() {
  float ax = frand01() * 2.0f - 1.0f;
  float ay = frand01() * 2.0f - 1.0f;
  float az = frand01() * 2.0f - 1.0f;
  float len = sqrtf(ax * ax + ay * ay + az * az);
  if (len < 0.001f) {
    ax = 0.31f;
    ay = 0.73f;
    az = 0.61f;
    len = 1.0f;
  }
  params.axisX = ax / len;
  params.axisY = ay / len;
  params.axisZ = az / len;
  params.spinSign = frand01() < 0.5f ? -1.0f : 1.0f;
}

inline void changeSpinDirection() {
  if (frand01() < 0.5f) {
    params.spinSign = -params.spinSign;
  } else {
    params.spinSign = frand01() < 0.5f ? -1.0f : 1.0f;
  }
}

inline void randomizeMovementSigns() {
  params.moveSignX = frand01() < 0.5f ? -1.0f : 1.0f;
  params.moveSignY = frand01() < 0.5f ? -1.0f : 1.0f;
}

inline void setMoveVectorFromStep(int step) {
  int s = constrain(step, 0, MOVE_VECTOR_STEPS * 2);
  if (s <= MOVE_VECTOR_STEPS) {
    params.moveVXAmount = (float)s / (float)MOVE_VECTOR_STEPS;
    params.moveVYAmount = 1.0f;
  } else {
    params.moveVXAmount = 1.0f;
    params.moveVYAmount = 1.0f - (float)(s - MOVE_VECTOR_STEPS) / (float)MOVE_VECTOR_STEPS;
  }
}

inline void applyMoveDirection() {
  params.moveVX = params.moveVXAmount * params.moveSignX;
  params.moveVY = params.moveVYAmount * params.moveSignY;
}

inline float edgeValue(float ax, float ay, float bx, float by, float px, float py) {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

inline bool pointInTriangle(float x, float y, int a, int b, int c) {
  float e0 = edgeValue(params.px[a], params.py[a], params.px[b], params.py[b], x, y);
  float e1 = edgeValue(params.px[b], params.py[b], params.px[c], params.py[c], x, y);
  float e2 = edgeValue(params.px[c], params.py[c], params.px[a], params.py[a], x, y);
  return (e0 >= 0.0f && e1 >= 0.0f && e2 >= 0.0f) || (e0 <= 0.0f && e1 <= 0.0f && e2 <= 0.0f);
}

inline bool pointInFace(float x, float y, int face) {
  return pointInTriangle(x, y, FACE_A[face], FACE_B[face], FACE_C[face]) ||
         pointInTriangle(x, y, FACE_A[face], FACE_C[face], FACE_D[face]);
}

inline void addPixel(int x, int y, uint8_t r, uint8_t g, uint8_t b, float amount) {
  if ((unsigned)x >= (unsigned)PANEL_RES_W || (unsigned)y >= (unsigned)PANEL_RES_H) return;
  size_t i = ((size_t)y * PANEL_RES_W + x) * 3;
  PFCanvas::buffer[i] = (uint8_t)min(255, (int)PFCanvas::buffer[i] + (int)(r * amount));
  PFCanvas::buffer[i + 1] = (uint8_t)min(255, (int)PFCanvas::buffer[i + 1] + (int)(g * amount));
  PFCanvas::buffer[i + 2] = (uint8_t)min(255, (int)PFCanvas::buffer[i + 2] + (int)(b * amount));
}

inline void stampTailPixel(int x, int y, uint8_t r, uint8_t g, uint8_t b, float amount) {
  addPixel(x, y, r, g, b, amount);
  addPixel(x - 1, y, r, g, b, amount * 0.45f);
  addPixel(x + 1, y, r, g, b, amount * 0.45f);
  addPixel(x, y - 1, r, g, b, amount * 0.45f);
  addPixel(x, y + 1, r, g, b, amount * 0.45f);
}

inline void tailColor(int corner, int age, uint8_t& r, uint8_t& g, uint8_t& b) {
  int slot = (corner * 2 + age) % Cube3DPalettes::PALETTE_SIZE;
  if (params.tailMode == TAIL_LAVA) {
    paletteColor(3, slot, r, g, b);
  } else if (params.tailMode == TAIL_RAINBOW) {
    paletteColor(0, slot, r, g, b);
  } else if (params.tailMode == TAIL_FACE_COLORS) {
    int face = corner % 6;
    r = params.faceR[face];
    g = params.faceG[face];
    b = params.faceB[face];
  } else {
    r = 0;
    g = 0;
    b = 0;
  }
}

inline void drawTailSegment(float ax, float ay, float bx, float by, uint8_t r, uint8_t g, uint8_t b, float amount) {
  float dx = bx - ax;
  float dy = by - ay;
  int ix = abs((int)roundf(dx));
  int iy = abs((int)roundf(dy));
  int steps = (ix > iy ? ix : iy) + 1;
  for (int i = 0; i <= steps; i++) {
    float u = (float)i / (float)steps;
    int x = (int)roundf(ax + dx * u);
    int y = (int)roundf(ay + dy * u);
    stampTailPixel(x, y, r, g, b, amount);
  }
}

inline void drawTails() {
  if (params.tailMode == TAIL_NONE || !params.trailReady) return;
  for (int c = 0; c < 8; c++) {
    int base = c * TRAIL_LENGTH;
    for (int t = 0; t < TRAIL_LENGTH - 1; t++) {
      uint8_t r;
      uint8_t g;
      uint8_t b;
      tailColor(c, t, r, g, b);
      float fade = (float)(TRAIL_LENGTH - 1 - t) / (float)(TRAIL_LENGTH - 1);
      float amount = fade * TRAIL_BRIGHTNESS;
      drawTailSegment(params.trailX[base + t], params.trailY[base + t], params.trailX[base + t + 1], params.trailY[base + t + 1], r, g, b, amount);
    }
  }
}

inline void setFacePixel(int x, int y, int face, float coverage) {
  PFCanvas::setPixel(
    x,
    y,
    scaleByte(params.faceR[face] * coverage),
    scaleByte(params.faceG[face] * coverage),
    scaleByte(params.faceB[face] * coverage)
  );
}

inline void drawFace(int face) {
  float minX = min(min(params.px[FACE_A[face]], params.px[FACE_B[face]]), min(params.px[FACE_C[face]], params.px[FACE_D[face]]));
  float maxX = max(max(params.px[FACE_A[face]], params.px[FACE_B[face]]), max(params.px[FACE_C[face]], params.px[FACE_D[face]]));
  float minY = min(min(params.py[FACE_A[face]], params.py[FACE_B[face]]), min(params.py[FACE_C[face]], params.py[FACE_D[face]]));
  float maxY = max(max(params.py[FACE_A[face]], params.py[FACE_B[face]]), max(params.py[FACE_C[face]], params.py[FACE_D[face]]));
  int x0 = constrain((int)floorf(minX), 0, PANEL_RES_W - 1);
  int x1 = constrain((int)ceilf(maxX), 0, PANEL_RES_W - 1);
  int y0 = constrain((int)floorf(minY), 0, PANEL_RES_H - 1);
  int y1 = constrain((int)ceilf(maxY), 0, PANEL_RES_H - 1);

  for (int y = y0; y <= y1; y++) {
    for (int x = x0; x <= x1; x++) {
      if (params.enableAntialiasing) {
        int covered = 0;
        if (pointInFace(x + 0.25f, y + 0.25f, face)) covered++;
        if (pointInFace(x + 0.75f, y + 0.25f, face)) covered++;
        if (pointInFace(x + 0.25f, y + 0.75f, face)) covered++;
        if (pointInFace(x + 0.75f, y + 0.75f, face)) covered++;
        if (covered > 0) setFacePixel(x, y, face, (float)covered * 0.25f);
      } else if (pointInFace(x + 0.5f, y + 0.5f, face)) {
        setFacePixel(x, y, face, 1.0f);
      }
    }
  }
}

inline float faceDepth(int face) {
  return (params.pz[FACE_A[face]] + params.pz[FACE_B[face]] + params.pz[FACE_C[face]] + params.pz[FACE_D[face]]) * 0.25f;
}

inline void drawVisibleFacesSorted() {
  int order[6];
  int count = 0;
  for (int f = 0; f < 6; f++) {
    if (params.faceVisible[f]) order[count++] = f;
  }
  for (int i = 1; i < count; i++) {
    int value = order[i];
    float depth = faceDepth(value);
    int j = i - 1;
    while (j >= 0 && faceDepth(order[j]) > depth) {
      order[j + 1] = order[j];
      j--;
    }
    order[j + 1] = value;
  }
  for (int i = 0; i < count; i++) {
    drawFace(order[i]);
  }
}

inline void updateCornerTrail() {
  if (!params.trailReady) {
    for (int c = 0; c < 8; c++) {
      int base = c * TRAIL_LENGTH;
      for (int t = 0; t < TRAIL_LENGTH; t++) {
        params.trailX[base + t] = params.px[c];
        params.trailY[base + t] = params.py[c];
      }
    }
    params.trailReady = true;
    return;
  }
  for (int c = 0; c < 8; c++) {
    int base = c * TRAIL_LENGTH;
    for (int t = TRAIL_LENGTH - 1; t > 0; t--) {
      params.trailX[base + t] = params.trailX[base + t - 1];
      params.trailY[base + t] = params.trailY[base + t - 1];
    }
    params.trailX[base] = params.px[c];
    params.trailY[base] = params.py[c];
  }
}

void setup() {
  PFMath::buildSinLUT();
  randomSeed((uint32_t)micros());
  params.timeAcc = 0.0f;
  params.knob1Value = 0.781f;
  params.knob2Value = 8.259f;
  params.rotationSpeed = mapKnob2ToSpeed(params.knob2Value);
  params.moveStep = (int)floorf(constrain(params.knob1Value, 0.0f, 0.999f) * (MOVE_VECTOR_STEPS * 2 + 1));
  params.paletteIndex = constrain((int)floorf(0.806f * Cube3DPalettes::PALETTE_COUNT), 0, Cube3DPalettes::PALETTE_COUNT - 1);
  params.tailMode = (int)floorf(constrain(1.052f, 0.0f, 3.999f));
  params.hasPosition = false;
  params.boundLeft = CUBE_SIZE;
  params.boundRight = CUBE_SIZE;
  params.boundTop = CUBE_SIZE;
  params.boundBottom = CUBE_SIZE;
  params.trailReady = false;
  params.enableAntialiasing = enable_antialiasing;
  randomizeRotation();
  randomizeMovementSigns();
  setMoveVectorFromStep(params.moveStep);
  applyMoveDirection();
  randomizeFacePaletteSlots();
  params.startAngle = frand01() * PFMath::TWO_PI_F;
  sendCurrentPaletteName();
}

void update(float dt, const InputFrame& input) {
  if (input.btnPressed[0]) {
    params.rotationSpeed = randomRotationSpeed();
    Serial0.printf("3DCUBE_ROT_SPEED:%.2f\n", params.rotationSpeed);
  }

  if (input.btnPressed[3]) {
    params.enableAntialiasing = !params.enableAntialiasing;
    Serial0.printf("3DCUBE_AA:%s\n", params.enableAntialiasing ? "ON" : "OFF");
  }

  params.knob1Value = constrain(params.knob1Value + input.knobDeltas[0] * 0.05f, 0.0f, 1.0f);
  params.moveStep = (int)floorf(constrain(params.knob1Value, 0.0f, 0.999f) * (MOVE_VECTOR_STEPS * 2 + 1));
  setMoveVectorFromStep(params.moveStep);

  params.knob2Value = constrain(params.knob2Value + input.knobDeltas[1] * 0.1f, KNOB2_MIN_VALUE, KNOB2_MAX_VALUE);
  if (input.knobDeltas[1] != 0) {
    params.rotationSpeed = mapKnob2ToSpeed(params.knob2Value);
  }

  if (input.knobDeltas[2] != 0) {
    params.tailMode += input.knobDeltas[2];
    wrapIndex(params.tailMode, TAIL_RAINBOW + 1);
  }

  if (input.knobDeltas[3] != 0) {
    params.paletteIndex += input.knobDeltas[3];
    wrapIndex(params.paletteIndex, Cube3DPalettes::PALETTE_COUNT);
    randomizeFacePaletteSlots();
    sendCurrentPaletteName();
  }

  float moveControlSpeed = mapKnob2ToSpeed(params.knob2Value);
  params.timeAcc += dt * params.rotationSpeed * params.spinSign;
  applyMoveDirection();

  if (params.hasPosition) {
    float moveSpeed = speedToMoveSpeed(moveControlSpeed);
    params.cubeX += params.moveVX * moveSpeed * dt;
    params.cubeY += params.moveVY * moveSpeed * dt;

    bool bounced = false;
    float minX = params.boundLeft;
    float maxX = max(minX, (float)PANEL_RES_W - 1.0f - params.boundRight);
    float minY = params.boundTop;
    float maxY = max(minY, (float)PANEL_RES_H - 1.0f - params.boundBottom);

    if (params.cubeX < minX) {
      params.cubeX = minX;
      params.moveSignX = 1.0f;
      bounced = true;
    } else if (params.cubeX > maxX) {
      params.cubeX = maxX;
      params.moveSignX = -1.0f;
      bounced = true;
    }

    if (params.cubeY < minY) {
      params.cubeY = minY;
      params.moveSignY = 1.0f;
      bounced = true;
    } else if (params.cubeY > maxY) {
      params.cubeY = maxY;
      params.moveSignY = -1.0f;
      bounced = true;
    }

    if (bounced) changeSpinDirection();
  }
}

void draw() {
  const int w = PANEL_RES_W;
  const int h = PANEL_RES_H;
  if (!params.hasPosition) {
    params.cubeX = (w - 1) * 0.5f;
    params.cubeY = (h - 1) * 0.5f;
    params.hasPosition = true;
    params.trailReady = false;
  }

  float cx = params.cubeX;
  float cy = params.cubeY;
  float size = min(CUBE_SIZE, min((float)w, (float)h) * 0.72f);
  float t = params.timeAcc + params.startAngle;
  float ct = PFMath::fastCos(t);
  float st = PFMath::fastSin(t);
  float omc = 1.0f - ct;
  float ax = params.axisX;
  float ay = params.axisY;
  float az = params.axisZ;
  float m00 = ct + ax * ax * omc;
  float m01 = ax * ay * omc - az * st;
  float m02 = ax * az * omc + ay * st;
  float m10 = ay * ax * omc + az * st;
  float m11 = ct + ay * ay * omc;
  float m12 = ay * az * omc - ax * st;
  float m20 = az * ax * omc - ay * st;
  float m21 = az * ay * omc + ax * st;
  float m22 = ct + az * az * omc;

  for (int i = 0; i < 8; i++) {
    float x = VX[i] * size * 0.5f;
    float y = VY[i] * size * 0.5f;
    float z = VZ[i] * size * 0.5f;
    float rx = m00 * x + m01 * y + m02 * z;
    float ry = m10 * x + m11 * y + m12 * z;
    float rz = m20 * x + m21 * y + m22 * z;
    params.px[i] = cx + rx * 0.8660254f + ry * -0.8660254f;
    params.py[i] = cy + rx * 0.5f + ry * 0.5f + rz * -0.82f;
    params.pz[i] = rx * 0.7101408f + ry * 0.7101408f + rz * 0.8660254f;
  }

  float minPx = params.px[0];
  float maxPx = params.px[0];
  float minPy = params.py[0];
  float maxPy = params.py[0];
  for (int i = 1; i < 8; i++) {
    minPx = min(minPx, params.px[i]);
    maxPx = max(maxPx, params.px[i]);
    minPy = min(minPy, params.py[i]);
    maxPy = max(maxPy, params.py[i]);
  }

  params.boundLeft = max(0.0f, cx - minPx);
  params.boundRight = max(0.0f, maxPx - cx);
  params.boundTop = max(0.0f, cy - minPy);
  params.boundBottom = max(0.0f, maxPy - cy);

  float safeMinX = params.boundLeft;
  float safeMaxX = max(safeMinX, (float)w - 1.0f - params.boundRight);
  float safeMinY = params.boundTop;
  float safeMaxY = max(safeMinY, (float)h - 1.0f - params.boundBottom);
  float shiftX = 0.0f;
  float shiftY = 0.0f;
  if (cx < safeMinX) shiftX = safeMinX - cx;
  else if (cx > safeMaxX) shiftX = safeMaxX - cx;
  if (cy < safeMinY) shiftY = safeMinY - cy;
  else if (cy > safeMaxY) shiftY = safeMaxY - cy;

  if (shiftX != 0.0f || shiftY != 0.0f) {
    cx += shiftX;
    cy += shiftY;
    params.cubeX = cx;
    params.cubeY = cy;
    for (int i = 0; i < 8; i++) {
      params.px[i] += shiftX;
      params.py[i] += shiftY;
    }
  }

  for (int f = 0; f < 6; f++) {
    float nx = FACE_NX[f];
    float ny = FACE_NY[f];
    float nz = FACE_NZ[f];
    float rnx = m00 * nx + m01 * ny + m02 * nz;
    float rny = m10 * nx + m11 * ny + m12 * nz;
    float rnz = m20 * nx + m21 * ny + m22 * nz;
    params.faceVisible[f] = rnx * 0.7101408f + rny * 0.7101408f + rnz * 0.8660254f > 0.0001f;
  }

  for (int f = 0; f < 6; f++) {
    paletteColor(params.paletteIndex, params.faceSlot[f], params.faceR[f], params.faceG[f], params.faceB[f]);
  }

  updateCornerTrail();

  PFCanvas::clear();
  drawTails();
  drawVisibleFacesSorted();

  PFCanvas::present();
}

} // namespace Cube3DPattern