import * as THREE from 'three';
import { getKnobValueDelta, LOGICAL_KNOB_RANGES, LOGICAL_KNOB_TO_WEB_KNOB, toEncoderDelta } from '@/lib/pattern/controls';
import { compilePatternCode, type PatternModule, type PatternParams } from '@/lib/pattern/harness';

type WebKnobValues = Record<'c1' | 'c2' | 'c3' | 'c4', number>;

function getLogicalKnobValues(knobValues: WebKnobValues) {
  return LOGICAL_KNOB_TO_WEB_KNOB.map((knobId) => knobValues[knobId]);
}

function getLogicalKnobNormalized(logicalKnobValues: number[]) {
  return logicalKnobValues.map((value, index) => {
    const [min, max] = LOGICAL_KNOB_RANGES[index];
    return (value - min) / Math.max(0.0001, max - min);
  });
}

export class LedMatrixTexture {
  public texture: THREE.DataTexture;
  private width: number = 128;
  private height: number = 64;
  private data: Uint8Array;
  
  private userModule: PatternModule | null = null;
  private userParams: PatternParams = {};
  
  // Create a display wrapper to match ESP32 API structure
  private displayApi = {
    width: 128,
    height: 64,
    setPixel: (x: number, y: number, r: number | number[], g?: number, b?: number) => {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

      // Tolerate the array form setPixel(x, y, [r, g, b]) as well as the
      // canonical setPixel(x, y, r, g, b).
      let cr: number;
      let cg: number;
      let cb: number;
      if (Array.isArray(r)) {
        cr = r[0] ?? 0;
        cg = r[1] ?? 0;
        cb = r[2] ?? 0;
      } else {
        cr = r;
        cg = g ?? 0;
        cb = b ?? 0;
      }

      // OpenGL texture origin is bottom-left, but ESP32 display is top-left
      // We flip Y to match ESP32 coordinate system (y=0 is top)
      const texY = this.height - 1 - Math.floor(y);
      const idx = (texY * this.width + Math.floor(x)) * 4;

      this.data[idx] = cr;
      this.data[idx + 1] = cg;
      this.data[idx + 2] = cb;
      this.data[idx + 3] = 255;
    },
    // Value-field patterns (Pattern Lab's setValue API). The landing preview
    // has no color ramp, so render the field as grayscale.
    setValue: (x: number, y: number, v: number) => {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
      const value = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
      const byte = Math.round(value * 255);
      const texY = this.height - 1 - Math.floor(y);
      const idx = (texY * this.width + Math.floor(x)) * 4;
      this.data[idx] = byte;
      this.data[idx + 1] = byte;
      this.data[idx + 2] = byte;
      this.data[idx + 3] = 255;
    }
  };

  constructor() {
    this.data = new Uint8Array(this.width * this.height * 4);
    this.texture = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat);
    this.texture.needsUpdate = true;
  }

  // Evaluate the custom code and setup the module
  public loadCode(code: string) {
    try {
      this.userModule = compilePatternCode(code);
      this.userParams = {};
      
      this.userModule.setup?.(this.userParams);
      
      // Clear the screen
      this.data.fill(0);
      this.texture.needsUpdate = true;
    } catch (e) {
      console.error("Failed to load pattern code:", e);
    }
  }

  // Call this every frame
  public render(dt: number, time: number, knobValues: WebKnobValues, prevKnobValues: WebKnobValues) {
    if (!this.userModule || !this.userModule.draw) return;

    try {
      const logicalKnobValues = getLogicalKnobValues(knobValues);

      // Prepare input frame
      const input = {
        knobDeltas: LOGICAL_KNOB_TO_WEB_KNOB.map((knobId, logicalIndex) =>
          toEncoderDelta(
            LOGICAL_KNOB_RANGES[logicalIndex],
            getKnobValueDelta(knobId, knobValues[knobId], prevKnobValues[knobId]),
          )
        ),
        knobValues: logicalKnobValues,
        knobNormalized: getLogicalKnobNormalized(logicalKnobValues),
        knobRanges: LOGICAL_KNOB_RANGES,
        btnPressed: [false, false, false, false],
        btnHeld: [false, false, false, false]
      };

      // Mirror knob/button state onto params so patterns that read
      // params.knobValues in draw() (rather than input.knobValues in update())
      // still work — input is only passed to update().
      this.userParams.knobValues = input.knobValues;
      this.userParams.knobNormalized = input.knobNormalized;
      this.userParams.knobDeltas = input.knobDeltas;
      this.userParams.knobRanges = input.knobRanges;
      this.userParams.btnPressed = input.btnPressed;
      this.userParams.btnHeld = input.btnHeld;

      // Run update
      if (this.userModule.update) {
        this.userModule.update(dt, input, this.userParams);
      }

      // Clear buffer
      this.data.fill(0);
      
      // Run draw
      this.userModule.draw(this.displayApi, this.userParams, time);
      
      // Update texture
      this.texture.needsUpdate = true;
    } catch (e) {
      console.error("Runtime error in pattern code:", e);
    }
  }
}
