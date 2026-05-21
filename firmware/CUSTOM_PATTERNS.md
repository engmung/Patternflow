# Custom Patterns

Patternflow includes a workflow for creating patterns without writing low-level rendering code. Two paths converge in the same place — the Live Editor at [patternflow.work](https://patternflow.work) → **Pattern** section → **Live Editor**.

- **AI-assisted** — describe the pattern in plain language, paste the AI's output into the editor, tune knobs, copy to C++, flash. No shader knowledge required.
- **Direct** — write the JavaScript pattern by hand in the editor, then convert to C++. For anyone comfortable with fragment-shader-style code.

The 5-step path below is the AI-assisted route. The direct route reuses the same editor; skip to [Direct coding](#direct-coding-no-ai) if you don't need AI help.

---

## The 5-step path

### 1. Open the Live Editor

Go to [patternflow.work](https://patternflow.work), scroll to the **Pattern** section, and click **Live Editor**. You'll see a 3D preview of the panel on one side and a code editor on the other.

### 2. Copy the creation prompt

Click **Copy creation prompt** above the editor. This copies a prompt that teaches the AI Patternflow's pattern API — the 128×64 grid, the four encoder inputs, the namespace structure, the render call. You don't need to read it. Just paste it.

### 3. Ask an AI for the pattern

Paste the prompt into Claude, ChatGPT, Gemini, or any other code-capable model. At the bottom of the prompt, describe what you want. Examples that have worked well:

- *"A slow vertical aurora — soft greens and purples, gentle wave motion, no hard edges."*
- *"Concentric rings expanding from the center, each ring a slightly different hue."*
- *"Plasma flow that looks like ink in water, deep blues bleeding into magentas."*
- *"A grid of dots pulsing in waves, like a stadium crowd doing the wave."*

The more visual and specific, the better. References to paintings, films, weather, or natural phenomena work well — AI models handle them.

### 4. Paste the JS into the editor

The AI returns JavaScript code. Paste it into the editor pane. The 3D preview updates immediately. The four on-screen knobs and the **ESP32 cost** readout at the top are live.

Turn the knobs to feel how the pattern responds. Adjust constants in the code directly — sensitivity, color ranges, motion speed — until it looks the way you want. This is where you make the pattern yours, not the AI's.

### 5. Convert to C++ and flash

When you're happy with how it looks:

1. Click **Copy C++ prompt**. This bundles your final JS together with a conversion prompt and copies the whole thing to your clipboard.
2. Paste into your AI assistant again. It returns C++ in Patternflow's namespace format.
3. Save that C++ output as `pattern_yourname.h` inside `firmware/patternflow/`.
4. Open `pattern_registry.h` and add two lines (see [Installing your pattern](#installing-your-pattern) below).
5. Open `patternflow.ino` in Arduino IDE, select your ESP32-S3 port, and upload.

Long-press encoder 4 on the device to cycle to your new pattern.

---

## The cost score, explained

At the top of the editor:

```
ESP32 cost: MEDIUM · score 16 · per pixel: trig 4, pow 0, sqrt 0, atan2 0
```

This counts expensive math operations in your pixel loop:

- **trig** — `sin`, `cos`, `tan` calls. Each adds real CPU cost per frame.
- **pow** — exponentiation. Expensive.
- **sqrt** — square root. Expensive.
- **atan2** — angle from x/y. The single most expensive common operation.

**The score is a signal, not a verdict.** It flags patterns that *might* slow down, but the actual frame rate depends on more than this count — loop structure, branching, how the ESP32's cache responds to your access pattern. In practice some patterns with high scores run smoothly, and some with moderate scores stutter unexpectedly.

The rough shape from experience: scores under 20 are reliably smooth. Patterns with truly heavy per-pixel math — stacked `sqrt`, multiple `atan2`, large `pow` — are where slowdowns reliably appear, typically well above score 50. Between those two zones, run it and see. The 3D preview in the browser is a hint, but the only honest test is on the device.

If your score climbs higher than you'd like, the most common fix is moving expensive math *out* of the pixel loop — a `sin` that depends only on time (not on x or y) can be computed once per frame and reused for all 8,192 pixels. You can also tell the AI directly: *"Keep cost score under 30. No `atan2`."* Models follow these constraints if you state them in the prompt.

---

## Installing your pattern

Drop the generated header file into the firmware folder:

```
firmware/patternflow/
├── patternflow.ino
├── config.h
├── pattern_registry.h         ← edit this
├── pattern_origin.h
├── pattern_wave_saw.h
├── pattern_dev1.h
├── pattern_dev2.h
├── pattern_dev3.h
├── pattern_yourname.h         ← drop your file here
└── src/                       ← Arduino IDE doesn't show these as tabs
    ├── core_display.h
    ├── core_encoders.h
    ├── core_canvas.h          ← every new pattern draws through this
    ├── core_math.h            ← shared sin LUT + fast trig
    ├── core_color.h           ← shared HSV/ramp helpers
    ├── core_noise.h           ← shared Perlin/fractal noise
    └── core_osc.h             ← OSC sidechannel
```

The `src/` folder holds the foundation: generated patterns include the ones they need (`#include "src/core_canvas.h"`, etc.) and call helpers like `PFMath::fastSin`, `PFColor::hsvToRgb`, `PFCanvas::setPixel`. The Live Editor's "Copy C++ prompt" already teaches the LLM to use these — you should not need to edit the generated file by hand.

Open `pattern_registry.h` and add two things:

```cpp
#include "core_encoders.h"
#include "pattern_origin.h"
#include "pattern_wave_saw.h"
#include "pattern_yourname.h"        // ← 1. include your header

// ...

PatternEntry patterns[] = {
  PATTERN_ENTRY(Origin),
  PATTERN_ENTRY(WaveSaw),
  PATTERN_ENTRY(YourNamespace),      // ← 2. add the namespace
};
```

`YourNamespace` is whatever name the AI gave the C++ namespace during the conversion step. It's at the top of your generated `pattern_yourname.h`. Match it exactly — C++ is case-sensitive and won't compile if it's off.

Open `patternflow.ino` in Arduino IDE, select the right port, hit upload. The device picks up the new pattern on the next boot.

---

## The Live Editor in detail

### Buttons

- **Copy creation prompt** — for starting a new pattern. Copies the API spec along with a slot for your description.
- **Copy C++ prompt** — for converting a finished JS pattern. Copies your current code together with a conversion instruction set.

### Knobs

Four knobs corresponding to the four physical encoders. Their labels (Speed, Hue, Density, etc.) are defined by the pattern itself — you, or the AI, decide what each one controls. The labels you set in JS carry through to the C++ namespace and become the on-device readout.

### 3D preview

The preview renders the panel as it would appear on hardware, including aspect ratio (128 × 64) and brightness curve. It's a strong approximation, not a perfect match — colors on the physical HUB75 panel are slightly more saturated, and dark values look darker because the panel has no backlight bleed. Don't fine-tune to pixel-perfect in the preview; tune until it's *close*, flash, then make final adjustments on the device.

---

## Tips for better AI prompts

**Visual references travel well.** "Late-evening ocean ripples, color of bismuth" gives the AI specific direction. "Cool pattern" gives it nothing. Painters, films, natural phenomena, photography references — all of these load specificity into the model.

**Talk about motion and timing.** Color is half of a pattern; motion is the other half. "Slow drift, breathing rhythm, never stops fully" is more useful than just describing colors. "Snappy", "syrupy", "pulsing on the beat" — these all translate.

**Constrain when you need to.** "Stay under cost score 30. No `atan2`. Use additive blending only." Models follow stated constraints if you put them in the prompt. Use this when you've been bitten by a slow pattern once and don't want to be bitten again.

**Iterate in the editor, not in the AI.** Once you have working JS, tweak constants and conditions in the editor pane directly — the 3D preview updates instantly. Going back to the AI for every small tweak is slow, and the AI tends to "redesign" rather than "adjust," which costs you the version you liked.

**If you get stuck, name what's wrong.** "The motion is too fast" or "the contrast is too low" or "I want it to fade in instead of jumping in" — these are useful follow-ups. Vague feedback ("make it better") usually makes it worse.

---

## Direct coding (no AI)

If you want to write the JS yourself, open the Live Editor and start. The minimal pattern looks something like:

```js
function render(x, y, t) {
  const v = 0.5 + 0.5 * Math.sin(t + x * 0.1);
  return hsv(v, 1, 1);
}
```

`x` and `y` are pixel coordinates (0 to 127, 0 to 63). `t` is time in seconds. Knob values and helper functions are available — refer to the prompt copied by **Copy creation prompt** for the full API. That prompt is the canonical reference; this README only summarizes the workflow around it.

The conversion path is the same: tune until you like it, click **Copy C++ prompt**, paste into an AI, save the result as a `pattern_*.h` file, register it.

---

## Share what you make

If your pattern is good, send it.

- **Discord** — drop it in the patterns channel: [discord.gg/Vr9QtsxeTk](https://discord.gg/Vr9QtsxeTk)
- **GitHub** — open a PR adding your `pattern_yourname.h` to `firmware/patternflow/`
- **Instagram** — DM Patternflow with a clip and the code

Good patterns get bundled into future releases, with credit. The Patternflow pattern library should belong to the people who actually make patterns, not just the people who designed the hardware.

---

The whole loop, from "I want something like a slow blue wave" to that thing rendering on your physical panel, takes about ten minutes the first time and under five after that.
