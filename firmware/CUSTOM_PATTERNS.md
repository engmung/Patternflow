# Custom Patterns

Patternflow patterns are small C++ modules. Each pattern lives in one `pattern_*.h` file and exposes the same five things:

- `NAME`
- `KNOB_LABELS`
- `setup()`
- `update(float dt, const InputFrame& input)`
- `draw()`

You do not need GLSL, a rendering pipeline, or firmware architecture knowledge to start. Copy the prompt below into an AI coding assistant, describe the look you want, then add the generated file to the firmware folder.

## Quick workflow

1. Copy the prompt template below.
2. Replace the visual brief with your own idea.
3. Save the generated output as `firmware/patternflow_v1/pattern_your_name.h`.
4. Include it in `firmware/patternflow_v1/pattern_registry.h`.
5. Add `PATTERN_ENTRY(YourNamespace)` to the `patterns[]` list.
6. Flash from [patternflow.work](https://patternflow.work) or from Arduino IDE.

## Naming convention

Use meaning-based names, not serial numbers.

- File: `pattern_wave_saw.h`
- Namespace: `WaveSaw`
- Display name: `Wave Saw`

Good future names: `Drift`, `Mesh Pulse`, `Aurora`, `Wave Triangle`.

## Prompt template

Copy this into Claude, ChatGPT, Cursor, Antigravity, or another coding assistant:

```text
You are writing a new Patternflow firmware pattern.

Patternflow is an ESP32-S3 + HUB75 LED matrix instrument with:
- Resolution: 128x64
- Four rotary encoders with push buttons
- Arduino C++ firmware
- Existing display pointer: dma_display
- Pixel draw API: dma_display->drawPixelRGB888(x, y, r, g, b)
- Input type: InputFrame from core_encoders.h

Create one self-contained header file named:
pattern_[short_slug].h

Rules:
- Use #pragma once.
- Include <math.h>, "core_display.h", and "core_encoders.h" if needed.
- Use a namespace named in PascalCase.
- Expose:
  const char* NAME
  const char* KNOB_LABELS[4]
  void setup()
  void update(float dt, const InputFrame& input)
  void draw()
- Do not use dynamic allocation.
- Keep per-frame work reasonable for 128x64.
- Use encoder deltas to change meaningful visual parameters.
- Use button presses to reset the corresponding parameter.
- Keep brightness safe; avoid full-white flashing.
- Prefer smooth motion and readable parameter ranges.

Visual brief:
[Describe the pattern here. Example: slow rain-like vertical streaks, Tokyo neon colors, soft pulse, not too bright.]

Knob mapping:
1. [Parameter 1]
2. [Parameter 2]
3. [Parameter 3]
4. [Parameter 4]

Return only the complete .h file contents.
```

## Register the pattern

In `firmware/patternflow_v1/pattern_registry.h`:

```cpp
#include "pattern_your_name.h"
```

Then add it to the list:

```cpp
PatternEntry patterns[] = {
  PATTERN_ENTRY(Origin),
  PATTERN_ENTRY(WaveSaw),
  PATTERN_ENTRY(YourNamespace),
};
```

Restart Arduino IDE after adding new files if it does not notice them.

## Safety notes

Avoid rapid full-screen flashing, especially high-contrast white flashes. Patternflow is bright, and photosensitive viewers can be affected by aggressive strobing.

Use gradual brightness curves, moving gradients, waves, noise, and spatial motion before resorting to hard on/off flicker.
