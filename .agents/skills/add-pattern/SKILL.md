---
name: add-pattern
description: Use when adding a new generative pattern to the Patternflow firmware. Triggers on requests like "add a new pattern", "create a [name] pattern", or when the user describes a visual effect they want on the LED matrix.
---

# Add Pattern Skill

Follow these steps to implement a new visual pattern:

1. **Read existing patterns** in `firmware/patternflow/patternflow.ino` (or future separate pattern files). Specifically, look at `renderConcentric(float phase)` to understand the rendering interface and parameters.
2. **Identify integration points:**
   - How the pattern function is called from the main `loop()` or `renderCurrent()` multiplexer.
   - How `params` (hue, speed, mode, freq) are accessed.
   - How `dma_display->drawPixelRGB888(x, y, r, g, b)` is used to draw to the matrix.
3. **Create the new pattern function** following the existing signature convention (e.g., `renderNewPattern(float phase)`).
4. **Map the four encoders** to meaningful parameters within the pattern. Document this mapping in a header comment above the function. 
   - E1 (Hue): Usually base color.
   - E2 (Speed): Usually progression of the `phase` variable.
   - E3 (Mode): Usually switches pattern logic or shape preset.
   - E4 (Freq): Usually controls density, scale, or modulation frequency.
5. **Register the pattern** in the mode-switching logic (usually inside `renderCurrent()` or directly tied to `params.mode`).
6. **Test compile** the firmware to ensure no syntax errors (do not attempt to run on hardware).
7. **Update documentation:** Add the new pattern to any pattern list in `firmware/README.md`.

